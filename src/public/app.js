// DOM Elements
const appContainer = document.getElementById("app");
const systemStatusEl = document.getElementById("system-status");
const errorOverlayEl = document.getElementById("error-overlay");
const errorMessageEl = document.getElementById("error-message");

// Flight Data Panel Elements
const flightDataEl = document.getElementById("flight-data");
const noFlightCardEl = document.getElementById("no-flight-card");
const airlineNameEl = document.getElementById("airline-name");
const flightCallsignEl = document.getElementById("flight-callsign");
const aircraftTypeEl = document.getElementById("aircraft-type");
const maxDistLimitEl = document.getElementById("max-dist-limit");
const ringLabelInnerEl = document.getElementById("ring-label-inner");
const ringLabelMidEl = document.getElementById("ring-label-mid");
const ringLabelOuterEl = document.getElementById("ring-label-outer");

// Route Elements
const routeDisplayEl = document.getElementById("route-display");
const routeOriginCodeEl = document.getElementById("route-origin-code");
const routeOriginNameEl = document.getElementById("route-origin-name");
const routeDestinationCodeEl = document.getElementById("route-destination-code");
const routeDestinationNameEl = document.getElementById("route-destination-name");

// Metrics Elements
const metricAltitudeEl = document.getElementById("metric-altitude");
const verticalTrendIconEl = document.getElementById("vertical-trend-icon");
const metricVerticalRateEl = document.getElementById("metric-vertical-rate");
const metricDistanceEl = document.getElementById("metric-distance");
const metricElevationEl = document.getElementById("metric-elevation");
const metricSpeedEl = document.getElementById("metric-speed");
const metricBearingEl = document.getElementById("metric-bearing");
const metricBearingDirectionEl = document.getElementById("metric-bearing-direction");
const signalAgeEl = document.getElementById("signal-age");

// Radar Visual Elements
const compassGroupEl = document.getElementById("compass-group");
const targetGroupEl = document.getElementById("target-group");
const radarTrailsEl = document.getElementById("radar-trails");
const secondaryTargetsEl = document.getElementById("secondary-targets");
const radarArrowOrbitEl = document.getElementById("radar-arrow-orbit");
const arrowBearingLabelEl = document.getElementById("arrow-bearing-label");
const scanningOverlayEl = document.getElementById("scanning-overlay");
const nearbyListEl = document.getElementById("nearby-list");

// Math Utilities
function degToRad(deg) { return (deg * Math.PI) / 180; }
function radToDeg(rad) { return (rad * 180) / Math.PI; }
function normalizeDeg(deg) { return ((deg % 360) + 360) % 360; }
function signedAngularDiffDeg(angle, reference) {
  return ((((angle - reference) % 360) + 540) % 360) - 180;
}

function haversineNm(lat1, lon1, lat2, lon2) {
  const earthRadiusNm = 3440.065;
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degToRad(lat1)) *
      Math.cos(degToRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return earthRadiusNm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const phi1 = degToRad(lat1);
  const phi2 = degToRad(lat2);
  const lambda1 = degToRad(lon1);
  const lambda2 = degToRad(lon2);
  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);
  return normalizeDeg(radToDeg(Math.atan2(y, x)));
}

function elevationAngleDeg(distanceNm, altitudeFt, homeElevationFt) {
  if (distanceNm == null || altitudeFt == null) return 0;
  const groundDistanceFt = distanceNm * 6076.12;
  const altitudeAboveHomeFt = altitudeFt - homeElevationFt;
  return radToDeg(Math.atan2(altitudeAboveHomeFt, groundDistanceFt));
}

function bearingToUiAngleDeg(bearingFromHomeDeg, downBearingDeg, bearingToUiScale) {
  if (bearingFromHomeDeg == null) return 90;
  const diffFromDown = signedAngularDiffDeg(bearingFromHomeDeg, downBearingDeg);
  return normalizeDeg(90 - diffFromDown * bearingToUiScale);
}

function getCardinalDirection(bearing) {
  const directions = ["NORTH", "NORTHEAST", "EAST", "SOUTHEAST", "SOUTH", "SOUTHWEST", "WEST", "NORTHWEST"];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

function getElevationDescription(deg) {
  if (deg == null) return "";
  if (deg < 10) return "NEAR THE HORIZON";
  if (deg < 25) return "LOW IN SKY";
  if (deg < 50) return "MID SKY";
  if (deg < 80) return "HIGH IN SKY";
  return "DIRECTLY OVERHEAD (ZENITH)";
}

function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

function lerpAngle(current, target, factor) {
  let diff = signedAngularDiffDeg(target, current);
  return current + diff * factor;
}

function calculateKinematicsFromCoords(coords) {
  if (coords.length < 3) return null;
  
  const p1 = coords[coords.length - 3];
  const p2 = coords[coords.length - 2];
  const p3 = coords[coords.length - 1];
  
  if (p1.lat === p2.lat && p1.lon === p2.lon) return null;
  if (p2.lat === p3.lat && p2.lon === p3.lon) return null;
  
  const h12 = bearingDeg(p1.lat, p1.lon, p2.lat, p2.lon);
  const h23 = bearingDeg(p2.lat, p2.lon, p3.lat, p3.lon);
  
  const dt12 = (p2.t - p1.t) / 1000;
  const dt23 = (p3.t - p2.t) / 1000;
  
  if (dt12 <= 0.1 || dt23 <= 0.1) return null;
  
  const diff = signedAngularDiffDeg(h23, h12);
  const dt = 0.5 * dt12 + 0.5 * dt23;
  const measuredTurnRate = diff / dt;
  
  // Extrapolate track to the time of the latest point (p3)
  const dtExtrapolate = 0.5 * dt23;
  const measuredTrack = normalizeDeg(h23 + measuredTurnRate * dtExtrapolate);
  
  return { measuredTurnRate, measuredTrack };
}

// Curved position interpolator accounting for turn rate, dead-reckoning from last known true state
function estimatePositionFromState(state, now, groundSpeedKmh, verticalRateFpm) {
  if (state.lastTrueLat == null || state.lastTrueLon == null) return null;
  
  const speed = groundSpeedKmh || 0;
  const isStationary = speed < 5;
  const ageSec = isStationary
    ? Math.min(300, (now - state.lastTrueTime) / 1000)
    : (now - state.lastTrueTime) / 1000;
  
  let estLat = state.lastTrueLat;
  let estLon = state.lastTrueLon;
  let estAlt = state.lastTrueAlt;
  
  let track = state.lastTrueTrack;
  
  if (speed > 0 && track != null) {
    const speedKms = speed / 3600;
    const dt = 0.1; // 100ms integration step for high precision
    let t = 0;
    const decayConstant = state.turnRateDecaySeconds ?? 30;
    
    while (t < ageSec) {
      const stepDt = Math.min(dt, ageSec - t);
      const midT = t + stepDt / 2;
      const turnRateDecay = decayConstant === Infinity ? 1.0 : Math.exp(-midT / decayConstant);
      const currentTurnRate = state.turnRateDegPerSec * turnRateDecay;
      
      const stepTurn = currentTurnRate * stepDt;
      const midTrackRad = degToRad(track + stepTurn / 2);
      
      track = normalizeDeg(track + stepTurn);
      
      const distanceKm = speedKms * stepDt;
      
      const dLatKm = distanceKm * Math.cos(midTrackRad);
      const dLonKm = distanceKm * Math.sin(midTrackRad);
      
      const dLat = dLatKm / 111.32;
      const dLon = dLonKm / (111.32 * Math.cos(degToRad(estLat)));
      
      estLat += dLat;
      estLon += dLon;
      
      t += stepDt;
    }
  }
  
  if (verticalRateFpm != null && estAlt != null) {
    const dt = 0.1;
    let t = 0;
    const decayConstant = state.verticalRateDecaySeconds ?? 60;
    
    while (t < ageSec) {
      const stepDt = Math.min(dt, ageSec - t);
      const midT = t + stepDt / 2;
      const verticalRateDecay = decayConstant === Infinity ? 1.0 : Math.exp(-midT / decayConstant);
      const currentVerticalRate = verticalRateFpm * verticalRateDecay;
      const altRateFps = currentVerticalRate / 60;
      
      estAlt += altRateFps * stepDt;
      t += stepDt;
    }
  }
  
  return { lat: estLat, lon: estLon, altitudeFt: estAlt };
}

// Application State
let lastPayload = null;
let localTimeAtFetch = 0;
let config = null;
let lastRenderTime = 0;
const TARGET_FPS = 25;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

// Plane States Map for turn rate estimation and 60fps path smoothing (hex => state)
const planeStates = new Map();

// Interpolated display state
let currentHex = null;
let currentSelectedHex = null;
let displayedX = 0;
let displayedY = 0;
let displayedUiAngle = 0;

// Multi-plane trails collection (hex => { points: [{x, y, t, isVerified}], opacity: 1.0, active: boolean })
const flightTrails = new Map();
let lastTrailPointTime = 0;

// API polling
async function fetchAirspace() {
  try {
    const res = await fetch(`/api/aircraft?selected=${currentSelectedHex || ""}&t=${Date.now()}`, { cache: "no-store" });
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.details || data.error || "Unknown server error");
    }
    
    lastPayload = data;
    localTimeAtFetch = Date.now();
    config = data.config;
    
    // Update plane states (turn rate & smooth position trackers)
    updatePlaneStates(data.aircraft || []);
    
    const serverSelectedHex = data.selected ? data.selected.hex : null;
    if (serverSelectedHex) {
      currentSelectedHex = serverSelectedHex;
    } else if (currentSelectedHex) {
      // Keep selected aircraft for a 15-second grace period in case of weak/intermittent signals
      const activeState = planeStates.get(currentSelectedHex);
      if (activeState) {
        const ageSec = (Date.now() - activeState.lastTrueTime) / 1000;
        if (ageSec > 15.0) {
          currentSelectedHex = null;
        }
      } else {
        currentSelectedHex = null;
      }
    } else {
      currentSelectedHex = null;
    }
    
    // Hide error overlay
    errorOverlayEl.classList.add("hidden");
    
    // Rotate compass ring if configuration received
    if (config) {
      const compassRotationOffset = 180 + config.downBearingDeg * config.bearingToUiScale;
      compassGroupEl.style.transform = `rotate(${compassRotationOffset}deg)`;
      maxDistLimitEl.textContent = lastPayload.maxDistanceKm;
      
      // Update dynamic ring distance labels
      const maxDist = lastPayload.maxDistanceKm;
      if (ringLabelInnerEl) ringLabelInnerEl.textContent = `${(maxDist * 40 / 140).toFixed(1)} km`;
      if (ringLabelMidEl) ringLabelMidEl.textContent = `${(maxDist * 90 / 140).toFixed(1)} km`;
      if (ringLabelOuterEl) ringLabelOuterEl.textContent = `${maxDist.toFixed(1)} km`;
    }
    
    updateNearbyAirspace(data.nearby);
  } catch (err) {
    console.error("Fetch airspace failed:", err);
    errorMessageEl.textContent = `Unable to query receiver feed: ${err.message}`;
    errorOverlayEl.classList.remove("hidden");
  }
}

function updatePlaneStates(allPlanes) {
  const now = Date.now();
  
  allPlanes.forEach(plane => {
    if (plane.hex == null) return;
    
    let state = planeStates.get(plane.hex);
    const newTrueTime = now - (plane.seenPosSec || plane.seenSec || 0) * 1000;
    
    if (!state) {
      if (plane.lat == null || plane.lon == null) return; // Wait for valid position before tracking
      
      state = {
        hex: plane.hex,
        displayName: plane.displayName || plane.hex,
        aircraftType: plane.aircraftType,
        groundSpeedKmh: plane.groundSpeedKmh,
        verticalRateFpm: plane.verticalRateFpm,
        route: plane.route,
        isSelectable: plane.isSelectable,
        lastTrueLat: plane.lat,
        lastTrueLon: plane.lon,
        lastTrueAlt: plane.altitudeFt,
        lastTrueTrack: plane.trackDeg,
        lastTrueTime: newTrueTime,
        lastTrackTime: newTrueTime,
        turnRateDegPerSec: 0,
        hasNewVerifiedCoord: true,
        verifiedCoords: [{ lat: plane.lat, lon: plane.lon, t: newTrueTime }]
      };
      planeStates.set(plane.hex, state);
    } else {
      // Update basic fields
      state.displayName = plane.displayName || state.displayName;
      state.aircraftType = plane.aircraftType || state.aircraftType;
      state.groundSpeedKmh = plane.groundSpeedKmh ?? state.groundSpeedKmh;
      state.verticalRateFpm = plane.verticalRateFpm ?? state.verticalRateFpm;
      state.route = plane.route || state.route;
      state.isSelectable = plane.isSelectable ?? state.isSelectable;

      // Check if this is a new coordinate update
      let hasNewCoord = false;
      if (plane.lat != null && plane.lon != null) {
        if (Math.abs(newTrueTime - state.lastTrueTime) > 50) {
          state.lastTrueLat = plane.lat;
          state.lastTrueLon = plane.lon;
          state.lastTrueTime = newTrueTime;
          state.hasNewVerifiedCoord = true;
          hasNewCoord = true;
          
          if (!state.verifiedCoords) {
            state.verifiedCoords = [];
          }
          state.verifiedCoords.push({ lat: plane.lat, lon: plane.lon, t: newTrueTime });
          if (state.verifiedCoords.length > 5) {
            state.verifiedCoords.shift();
          }
        }
      }
      
      if (plane.altitudeFt != null) {
        state.lastTrueAlt = plane.altitudeFt;
      }

      // Calculate turn rate and heading from coordinate history
      let turnRate = state.turnRateDegPerSec || 0;
      if (state.verifiedCoords && state.verifiedCoords.length >= 3) {
        if (hasNewCoord) {
          const kinematics = calculateKinematicsFromCoords(state.verifiedCoords);
          if (kinematics) {
            const clampedTurnRate = Math.max(-6.0, Math.min(6.0, kinematics.measuredTurnRate));
            turnRate = lerp(turnRate, clampedTurnRate, 0.25);
            state.lastTrueTrack = kinematics.measuredTrack;
            state.lastTrackTime = newTrueTime;
          }
        }
      } else {
        // Fallback to reported trackDeg if coordinate history is not sufficient
        if (plane.trackDeg != null) {
          state.lastTrueTrack = plane.trackDeg;
          state.lastTrackTime = newTrueTime;
        }
        turnRate = 0;
      }
      
      state.turnRateDegPerSec = turnRate;
    }
  });
}

function updateNearbyAirspace(nearby) {
  if (!nearby || nearby.length === 0) {
    nearbyListEl.innerHTML = `<div class="nearby-empty">No other planes detected</div>`;
    return;
  }
  
  let html = "";
  for (const plane of nearby) {
    const origin = plane.route?.origin?.code || "";
    const dest = plane.route?.destination?.code || "";
    const routeString = (origin && dest) ? `${origin}➔${dest}` : (plane.aircraftType || "AIRCRAFT");
    
    const distText = plane.distanceKm != null ? `${plane.distanceKm.toFixed(1)} km` : "unknown";
    const altText = plane.altitudeFt != null ? `${Math.round(plane.altitudeFt).toLocaleString()} ft` : "unknown";
    
    html += `
      <div class="nearby-row">
        <span class="nearby-callsign">${plane.displayName}</span>
        <span class="nearby-route font-muted">${routeString}</span>
        <div class="nearby-dist-alt">
          <span class="nearby-dist">${distText}</span>
          <span class="nearby-alt font-muted">${altText}</span>
        </div>
      </div>
    `;
  }
  
  nearbyListEl.innerHTML = html;
}

// FPS Throttled Render & Dead-Reckoning Interpolation Loop
function renderLoop() {
  requestAnimationFrame(renderLoop);
  
  if (!lastPayload || !config) return;
  
  const now = Date.now();
  const elapsedSinceLastRender = now - lastRenderTime;
  if (elapsedSinceLastRender < FRAME_INTERVAL) {
    return;
  }
  lastRenderTime = now - (elapsedSinceLastRender % FRAME_INTERVAL);

  // 1. Reset all trails to inactive for this frame (will set to active if plane is processed)
  for (const trail of flightTrails.values()) {
    trail.active = false;
  }

  // 2. Render all planes from our persistent state map
  let secondaryHtml = "";
  let activeSelected = null;

  // Track selection state
  if (currentSelectedHex) {
    activeSelected = planeStates.get(currentSelectedHex);
    if (!activeSelected) {
      currentSelectedHex = null;
    }
  }

  // Auto-lock fallback removed to respect server-driven selection lock policy

  for (const [hex, state] of planeStates.entries()) {
    const ageSinceLastTrue = now - state.lastTrueTime;

    let estPos = state.lastCachedEstPos;
    const isSelected = currentSelectedHex && hex === currentSelectedHex;
    const isStaleForCalc = ageSinceLastTrue >= 10000 && !isSelected;
    const shouldRecalc = !estPos || 
                         !isStaleForCalc || 
                         (!state.lastEstPosCalcTime || now - state.lastEstPosCalcTime > 1000);

    if (shouldRecalc) {
      estPos = estimatePositionFromState(state, now, state.groundSpeedKmh, state.verticalRateFpm);
      state.lastCachedEstPos = estPos;
      state.lastEstPosCalcTime = now;
    }
    if (!estPos) continue;

    const distNm = haversineNm(config.homeLat, config.homeLon, estPos.lat, estPos.lon);
    const distKm = distNm * 1.852;

    // Prune planes that have departed the circle
    if (distKm > lastPayload.maxDistanceKm) {
      planeStates.delete(hex);
      const trail = flightTrails.get(hex);
      if (trail) trail.active = false;
      continue;
    }

    const bearing = bearingDeg(config.homeLat, config.homeLon, estPos.lat, estPos.lon);
    const uiAngle = bearingToUiAngleDeg(bearing, config.downBearingDeg, config.bearingToUiScale);

    // Unclamped coordinates for trails (so they extend past the border smoothly)
    const r_unclamped = (distKm / lastPayload.maxDistanceKm) * 140;
    const x_unclamped = r_unclamped * Math.cos(degToRad(uiAngle));
    const y_unclamped = r_unclamped * Math.sin(degToRad(uiAngle));

    // Clamped coordinates for targets/dots on the radar grid
    const r = Math.min(140, r_unclamped);
    const x = r * Math.cos(degToRad(uiAngle));
    const y = r * Math.sin(degToRad(uiAngle));

    // Handle Trail appending (use UNCLAMPED coordinates)
    let trail = flightTrails.get(hex);
    if (!trail) {
      trail = { points: [], maxAge: Infinity, active: true };
      flightTrails.set(hex, trail);
    }
    trail.active = true;
    trail.maxAge = Infinity;

    // Check if we need to record a verified point
    if (state.hasNewVerifiedCoord) {
      const rawDistNm = haversineNm(config.homeLat, config.homeLon, state.lastTrueLat, state.lastTrueLon);
      const rawDistKm = rawDistNm * 1.852;
      const rawBearing = bearingDeg(config.homeLat, config.homeLon, state.lastTrueLat, state.lastTrueLon);
      const rawUiAngle = bearingToUiAngleDeg(rawBearing, config.downBearingDeg, config.bearingToUiScale);
      const rawR = (rawDistKm / lastPayload.maxDistanceKm) * 140;
      const rawX = rawR * Math.cos(degToRad(rawUiAngle));
      const rawY = rawR * Math.sin(degToRad(rawUiAngle));

      trail.points.push({
        x: rawX,
        y: rawY,
        t: state.lastTrueTime,
        isVerified: true
      });
      state.hasNewVerifiedCoord = false;
    }

    // Append periodic prediction points every 300ms
    if (!state.lastPredPointTime) {
      state.lastPredPointTime = now;
    }
    const predInterval = 300;
    const elapsedPred = now - state.lastPredPointTime;
    if (elapsedPred > predInterval) {
      // Generate points to catch up if we were in background (cap at 60s to avoid overload)
      const catchUpTime = Math.min(60000, elapsedPred);
      const numPoints = Math.floor(catchUpTime / predInterval);
      for (let i = 1; i <= numPoints; i++) {
        const tPoint = state.lastPredPointTime + i * predInterval;
        const estPosAtT = estimatePositionFromState(state, tPoint, state.groundSpeedKmh, state.verticalRateFpm);
        if (estPosAtT) {
          const distNmAtT = haversineNm(config.homeLat, config.homeLon, estPosAtT.lat, estPosAtT.lon);
          const distKmAtT = distNmAtT * 1.852;
          const bearingAtT = bearingDeg(config.homeLat, config.homeLon, estPosAtT.lat, estPosAtT.lon);
          const uiAngleAtT = bearingToUiAngleDeg(bearingAtT, config.downBearingDeg, config.bearingToUiScale);
          const r_unclampedAtT = (distKmAtT / lastPayload.maxDistanceKm) * 140;
          const x_unclampedAtT = r_unclampedAtT * Math.cos(degToRad(uiAngleAtT));
          const y_unclampedAtT = r_unclampedAtT * Math.sin(degToRad(uiAngleAtT));

          trail.points.push({
            x: x_unclampedAtT,
            y: y_unclampedAtT,
            t: tPoint,
            isVerified: false
          });
        }
      }
      state.lastPredPointTime = state.lastPredPointTime + numPoints * predInterval;
    }

    // Render secondary targets (if it is not the main selected flight)
    const isMainSelected = activeSelected && hex === activeSelected.hex;
    
    if (!isMainSelected) {
      const targetClass = ageSinceLastTrue < 1200 ? "secondary-target-dot verified" : "secondary-target-dot predicted";
      secondaryHtml += `
        <g>
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="${targetClass}" />
          <text x="${x.toFixed(1)}" y="${(y + 9).toFixed(1)}" class="secondary-target-label">${state.displayName}</text>
        </g>
      `;
    }
  }

  // Write secondary targets to SVG
  secondaryTargetsEl.innerHTML = secondaryHtml;

  // 3. Decay and Render Trails (dotted format)
  let trailsHtml = "";
  for (const [hex, trail] of flightTrails.entries()) {
    if (!trail.active) {
      if (trail.maxAge === Infinity) {
        const oldestAge = (trail.points && trail.points.length > 0) ? (now - trail.points[0].t) : 30000;
        trail.maxAge = Math.max(30000, oldestAge);
      }
      trail.maxAge = Math.max(0, trail.maxAge - 150);
      if (trail.maxAge <= 0 || trail.points.length === 0) {
        flightTrails.delete(hex);
        continue;
      }
    }

    const TRAIL_MAX_AGE_MS = 60000;
    if (trail.maxAge !== Infinity) {
      trail.points = trail.points.filter(p => now - p.t < trail.maxAge);
    } else {
      trail.points = trail.points.filter(p => now - p.t < TRAIL_MAX_AGE_MS);
    }

    if (trail.points.length > 0) {
      for (const p of trail.points) {
        const ageMs = now - p.t;
        let ageFactor;
        if (trail.maxAge === Infinity) {
          ageFactor = Math.max(0, 1 - ageMs / TRAIL_MAX_AGE_MS) * 0.85;
        } else {
          ageFactor = Math.max(0, 1 - ageMs / trail.maxAge);
        }

        if (ageFactor > 0.01) {
          if (p.isVerified) {
            trailsHtml += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.8" class="trail-dot-verified" opacity="${ageFactor.toFixed(2)}" />`;
          } else {
            trailsHtml += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="1.2" class="trail-dot-predicted" opacity="${ageFactor.toFixed(2)}" />`;
          }
        }
      }
    }
  }
  radarTrailsEl.innerHTML = trailsHtml;

  // 4. Render Main Locked Telemetry / Active Target
  if (!activeSelected) {
    flightDataEl.classList.add("hidden");
    noFlightCardEl.classList.remove("hidden");
    targetGroupEl.classList.add("hidden");
    radarArrowOrbitEl.classList.add("hidden");
    scanningOverlayEl.classList.remove("hidden");
    currentHex = null;
    return;
  }

  // Get current estimated coordinates for the selected plane
  const sEstPos = estimatePositionFromState(activeSelected, now, activeSelected.groundSpeedKmh, activeSelected.verticalRateFpm);
  if (sEstPos) {
    const sDistNm = haversineNm(config.homeLat, config.homeLon, sEstPos.lat, sEstPos.lon);
    const sDistKm = sDistNm * 1.852;
    const sBearing = bearingDeg(config.homeLat, config.homeLon, sEstPos.lat, sEstPos.lon);
    const sElevation = elevationAngleDeg(sDistNm, sEstPos.altitudeFt, config.homeElevationFt);
    
    // Compute 3D slant range (direct line-of-sight distance)
    const sAltAboveHomeKm = Math.max(0, sEstPos.altitudeFt - config.homeElevationFt) * 0.0003048;
    const sSlantRangeKm = Math.sqrt(sDistKm * sDistKm + sAltAboveHomeKm * sAltAboveHomeKm);
    const sUiAngle = bearingToUiAngleDeg(sBearing, config.downBearingDeg, config.bearingToUiScale);

    // Map to SVG coordinates
    const sR = Math.min(140, (sDistKm / lastPayload.maxDistanceKm) * 140);
    const sTargetX = sR * Math.cos(degToRad(sUiAngle));
    const sTargetY = sR * Math.sin(degToRad(sUiAngle));

    // Instant coordinate snapping on updates, no lagging lerps
    displayedUiAngle = sUiAngle;
    displayedX = sTargetX;
    displayedY = sTargetY;

    // Toggle verified vs predicted styles on HUD reticle and tracking arrow
    const ageSinceLastTrue = now - activeSelected.lastTrueTime;
    const isVerifiedRecent = ageSinceLastTrue < 1200; // Updated in last 1.2s

    if (isVerifiedRecent) {
      targetGroupEl.classList.add("verified");
      targetGroupEl.classList.remove("predicted");
      radarArrowOrbitEl.classList.add("verified");
      radarArrowOrbitEl.classList.remove("predicted");
    } else {
      targetGroupEl.classList.add("predicted");
      targetGroupEl.classList.remove("verified");
      radarArrowOrbitEl.classList.add("predicted");
      radarArrowOrbitEl.classList.remove("verified");
    }

    // Update active HUD elements
    flightDataEl.classList.remove("hidden");
    noFlightCardEl.classList.add("hidden");
    targetGroupEl.classList.remove("hidden");
    radarArrowOrbitEl.classList.remove("hidden");
    scanningOverlayEl.classList.remove("hidden");

    // Position target reticle
    targetGroupEl.setAttribute("transform", `translate(${displayedX.toFixed(1)}, ${displayedY.toFixed(1)})`);

    // Position tracking arrow & bearing label
    radarArrowOrbitEl.style.setProperty("--arrow-angle", `${displayedUiAngle.toFixed(1)}deg`);
    arrowBearingLabelEl.textContent = `${Math.round(sBearing).toString().padStart(3, "0")}°`;

    // Update Text Dashboard
    airlineNameEl.textContent = activeSelected.route?.airline || (activeSelected.displayName.startsWith("a") ? "AIRCRAFT" : "COMMERCIAL FLIGHT");
    flightCallsignEl.textContent = activeSelected.displayName;
    aircraftTypeEl.textContent = activeSelected.aircraftType || "Aircraft type unknown";

    if (activeSelected.route?.origin && activeSelected.route?.destination) {
      routeOriginCodeEl.textContent = activeSelected.route.origin.code;
      routeOriginNameEl.textContent = activeSelected.route.origin.name;
      routeDestinationCodeEl.textContent = activeSelected.route.destination.code;
      routeDestinationNameEl.textContent = activeSelected.route.destination.name;
      routeDisplayEl.classList.remove("hidden");
    } else {
      routeDisplayEl.classList.add("hidden");
    }

    // Telemetry display bindings using estimated coordinates
    metricAltitudeEl.textContent = Math.round(sEstPos.altitudeFt).toLocaleString();

    if (activeSelected.verticalRateFpm > 128) {
      verticalTrendIconEl.textContent = "▲";
      verticalTrendIconEl.style.color = "#10b981";
      metricVerticalRateEl.textContent = `+${Math.round(activeSelected.verticalRateFpm)} FPM`;
    } else if (activeSelected.verticalRateFpm < -128) {
      verticalTrendIconEl.textContent = "▼";
      verticalTrendIconEl.style.color = "#3b82f6";
      metricVerticalRateEl.textContent = `${Math.round(activeSelected.verticalRateFpm)} FPM`;
    } else {
      verticalTrendIconEl.textContent = "—";
      verticalTrendIconEl.style.color = "rgba(255, 255, 255, 0.4)";
      metricVerticalRateEl.textContent = "LEVEL";
    }

    metricDistanceEl.textContent = sSlantRangeKm.toFixed(1);
    metricElevationEl.textContent = `${getElevationDescription(sElevation)} (${Math.round(sElevation)}° up)`;
    metricSpeedEl.textContent = Math.round(activeSelected.groundSpeedKmh || 0);
    metricBearingEl.textContent = Math.round(sBearing);
    metricBearingDirectionEl.textContent = getCardinalDirection(sBearing);
    
    // Show signal age relative to last true updates
    const selectedAge = ageSinceLastTrue / 1000;
    signalAgeEl.textContent = `UPDATED ${selectedAge.toFixed(1)}S AGO`;
  }
}

// Initializer
fetchAirspace().then(() => {
  // Start rendering frame loop
  requestAnimationFrame(renderLoop);
  
  // Poll the Express backend receiver data every 1000ms
  setInterval(fetchAirspace, 1000);
});