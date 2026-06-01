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
  if (deg < 15) return "NEAR THE HORIZON";
  if (deg < 45) return "LOW IN SKY";
  if (deg < 75) return "HIGH IN SKY";
  return "STRAIGHT UP (ZENITH)";
}

function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

function lerpAngle(current, target, factor) {
  let diff = signedAngularDiffDeg(target, current);
  return current + diff * factor;
}

// Curved position interpolator accounting for turn rate
function estimatePosition(plane, ageSec, turnRateDegPerSec = 0) {
  if (plane.lat == null || plane.lon == null) return null;
  
  let estLat = plane.lat;
  let estLon = plane.lon;
  let estAlt = plane.altitudeFt;
  
  if (plane.groundSpeedKmh != null && plane.trackDeg != null) {
    const speedKms = plane.groundSpeedKmh / 3600;
    const trackRad = degToRad(plane.trackDeg);
    
    let dLatKm = 0;
    let dLonKm = 0;

    if (Math.abs(turnRateDegPerSec) < 0.05) {
      // Straight line approximation
      const distanceKm = speedKms * ageSec;
      dLatKm = distanceKm * Math.cos(trackRad);
      dLonKm = distanceKm * Math.sin(trackRad);
    } else {
      // Curved path kinematics
      const turnRateRad = degToRad(turnRateDegPerSec);
      const vOverW = speedKms / turnRateRad;
      const endTrackRad = trackRad + turnRateRad * ageSec;
      
      dLatKm = vOverW * (Math.sin(endTrackRad) - Math.sin(trackRad));
      dLonKm = vOverW * (Math.cos(trackRad) - Math.cos(endTrackRad));
    }

    // 1 degree latitude = 111.32 km
    const dLat = dLatKm / 111.32;
    // 1 degree longitude = 111.32 * cos(lat) km
    const dLon = dLonKm / (111.32 * Math.cos(degToRad(plane.lat)));
    
    estLat += dLat;
    estLon += dLon;
  }
  
  if (plane.verticalRateFpm != null && estAlt != null) {
    const altRateFps = plane.verticalRateFpm / 60;
    estAlt += altRateFps * ageSec;
  }
  
  return { lat: estLat, lon: estLon, altitudeFt: estAlt };
}

// Application State
let lastPayload = null;
let localTimeAtFetch = 0;
let config = null;

// Plane States Map for turn rate estimation and 60fps path smoothing (hex => state)
const planeStates = new Map();

// Interpolated display state
let currentHex = null;
let displayedX = 0;
let displayedY = 0;
let displayedUiAngle = 0;

// Multi-plane trails collection (hex => { points: [{x, y, t}], opacity: 1.0, active: boolean })
const flightTrails = new Map();
let lastTrailPointTime = 0;

// API polling
async function fetchAirspace() {
  try {
    const res = await fetch(`/api/aircraft?t=${Date.now()}`, { cache: "no-store" });
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.details || data.error || "Unknown server error");
    }
    
    lastPayload = data;
    localTimeAtFetch = Date.now();
    config = data.config;
    
    // Update plane states (turn rate & smooth position trackers)
    updatePlaneStates(data.aircraft || []);
    
    // Hide error overlay
    errorOverlayEl.classList.add("hidden");
    
    // Rotate compass ring if configuration received
    if (config) {
      const compassRotationOffset = 180 + config.downBearingDeg * config.bearingToUiScale;
      compassGroupEl.style.transform = `rotate(${compassRotationOffset}deg)`;
      maxDistLimitEl.textContent = lastPayload.maxDistanceKm;
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
  const activeHexes = new Set();
  
  allPlanes.forEach(plane => {
    if (plane.hex == null) return;
    activeHexes.add(plane.hex);
    
    let state = planeStates.get(plane.hex);
    if (!state) {
      state = {
        hex: plane.hex,
        lastTrueLat: plane.lat,
        lastTrueLon: plane.lon,
        lastTrueAlt: plane.altitudeFt,
        lastTrueTrack: plane.trackDeg,
        lastTrueTime: now,
        turnRateDegPerSec: 0,
        smoothLat: plane.lat,
        smoothLon: plane.lon,
        smoothAlt: plane.altitudeFt
      };
      planeStates.set(plane.hex, state);
    } else {
      let turnRate = 0;
      if (state.lastTrueTrack != null && plane.trackDeg != null) {
        const dt = (now - state.lastTrueTime) / 1000;
        if (dt > 0.1 && dt < 5.0) {
          const diff = signedAngularDiffDeg(plane.trackDeg, state.lastTrueTrack);
          turnRate = diff / dt;
          if (Math.abs(turnRate) > 10) {
            turnRate = Math.sign(turnRate) * 10;
          }
        } else {
          turnRate = state.turnRateDegPerSec;
        }
      }
      
      state.lastTrueLat = plane.lat;
      state.lastTrueLon = plane.lon;
      state.lastTrueAlt = plane.altitudeFt;
      state.lastTrueTrack = plane.trackDeg;
      state.lastTrueTime = now;
      state.turnRateDegPerSec = turnRate;
    }
  });
  
  for (const hex of planeStates.keys()) {
    if (!activeHexes.has(hex)) {
      planeStates.delete(hex);
    }
  }
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

// 60FPS Render & Dead-Reckoning Interpolation Loop
function renderLoop() {
  requestAnimationFrame(renderLoop);
  
  if (!lastPayload || !config) return;
  
  const selected = lastPayload.selected;
  const allPlanes = lastPayload.aircraft || [];
  const now = Date.now();
  const elapsedSec = (now - localTimeAtFetch) / 1000;

  // 1. Reset all trails to inactive for this frame
  for (const trail of flightTrails.values()) {
    trail.active = false;
  }

  // 2. Render all planes (selected and secondary) on the radar
  let secondaryHtml = "";
  let appendTrailPoints = false;
  
  // Throttle trail point recording to every 150ms to keep SVG path strings compact
  if (now - lastTrailPointTime > 150) {
    appendTrailPoints = true;
    lastTrailPointTime = now;
  }

  allPlanes.forEach((plane) => {
    const state = planeStates.get(plane.hex);
    if (!state) return;

    // Calculate age relative to the last true package update
    const ageSec = Math.min(10, (now - state.lastTrueTime) / 1000);
    
    // Estimate raw projected position (using turn rate)
    const estPos = estimatePosition(plane, ageSec, state.turnRateDegPerSec);
    if (!estPos) return;

    // Smoothly blend current state towards the projected target
    const lerpFactor = 0.06;
    if (state.smoothLat == null) {
      state.smoothLat = estPos.lat;
      state.smoothLon = estPos.lon;
      state.smoothAlt = estPos.altitudeFt;
    } else {
      state.smoothLat = lerp(state.smoothLat, estPos.lat, lerpFactor);
      state.smoothLon = lerp(state.smoothLon, estPos.lon, lerpFactor);
      state.smoothAlt = lerp(state.smoothAlt, estPos.altitudeFt, lerpFactor);
    }

    // Now compute everything from the SMOOTHED coordinates
    const distNm = haversineNm(config.homeLat, config.homeLon, state.smoothLat, state.smoothLon);
    const distKm = distNm * 1.852;
    const bearing = bearingDeg(config.homeLat, config.homeLon, state.smoothLat, state.smoothLon);
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
    let trail = flightTrails.get(plane.hex);
    if (!trail) {
      trail = { points: [], opacity: 1.0, active: true };
      flightTrails.set(plane.hex, trail);
    }
    
    trail.active = true;
    trail.opacity = 1.0;

    if (appendTrailPoints) {
      trail.points.push({ x: x_unclamped, y: y_unclamped, t: now });
      // Keep trailing path length to last 30 seconds
      trail.points = trail.points.filter(p => now - p.t < 30000);
    }

    // Render secondary targets (if it is not the main selected flight and within range)
    if ((!selected || plane.hex !== selected.hex) && distKm <= lastPayload.maxDistanceKm) {
      secondaryHtml += `
        <g>
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="secondary-target-dot" />
          <text x="${x.toFixed(1)}" y="${(y + 9).toFixed(1)}" class="secondary-target-label">${plane.displayName}</text>
        </g>
      `;
    }
  });

  // Write secondary targets to SVG
  secondaryTargetsEl.innerHTML = secondaryHtml;

  // 3. Decay and Render Trails (fade older segments first)
  let trailsHtml = "";
  for (const [hex, trail] of flightTrails.entries()) {
    // If plane has vanished from the active receiver feed, decay its opacity
    if (!trail.active) {
      trail.opacity -= 0.004; // completely fades out in ~4 seconds at 60fps
      if (trail.opacity <= 0) {
        flightTrails.delete(hex);
        continue;
      }
    }

    if (trail.points.length > 1) {
      for (let i = 0; i < trail.points.length - 1; i++) {
        const pStart = trail.points[i];
        const pEnd = trail.points[i + 1];
        
        // Calculate age factor based on average age of segment endpoints
        const ageMs = now - (pStart.t + pEnd.t) / 2;
        const ageFactor = Math.max(0, 1 - ageMs / 30000);
        const segmentOpacity = ageFactor * trail.opacity;
        
        if (segmentOpacity > 0.01) {
          trailsHtml += `<line x1="${pStart.x.toFixed(1)}" y1="${pStart.y.toFixed(1)}" x2="${pEnd.x.toFixed(1)}" y2="${pEnd.y.toFixed(1)}" class="radar-trail-line" stroke-opacity="${segmentOpacity.toFixed(2)}" />`;
        }
      }
    }
  }
  radarTrailsEl.innerHTML = trailsHtml;

  // 4. Render Main Locked Telemetry / Active Target
  if (!selected) {
    flightDataEl.classList.add("hidden");
    noFlightCardEl.classList.remove("hidden");
    targetGroupEl.classList.add("hidden");
    radarArrowOrbitEl.classList.add("hidden");
    scanningOverlayEl.classList.remove("hidden");
    currentHex = null;
    return;
  }

  // Get smoothed coordinates for the selected plane
  const selectedState = planeStates.get(selected.hex);
  if (selectedState && selectedState.smoothLat != null) {
    const sDistNm = haversineNm(config.homeLat, config.homeLon, selectedState.smoothLat, selectedState.smoothLon);
    const sDistKm = sDistNm * 1.852;
    const sBearing = bearingDeg(config.homeLat, config.homeLon, selectedState.smoothLat, selectedState.smoothLon);
    const sElevation = elevationAngleDeg(sDistNm, selectedState.smoothAlt, config.homeElevationFt);
    const sUiAngle = bearingToUiAngleDeg(sBearing, config.downBearingDeg, config.bearingToUiScale);

    // Map to SVG coordinates
    const sR = Math.min(140, (sDistKm / lastPayload.maxDistanceKm) * 140);
    const sTargetX = sR * Math.cos(degToRad(sUiAngle));
    const sTargetY = sR * Math.sin(degToRad(sUiAngle));

    // Handle reticle swap snap vs lerp
    if (selected.hex !== currentHex) {
      currentHex = selected.hex;
      displayedUiAngle = sUiAngle;
      displayedX = sTargetX;
      displayedY = sTargetY;
    } else {
      displayedUiAngle = lerpAngle(displayedUiAngle, sUiAngle, 0.08);
      displayedX = lerp(displayedX, sTargetX, 0.1);
      displayedY = lerp(displayedY, sTargetY, 0.1);
    }

    // Update active HUD elements
    flightDataEl.classList.remove("hidden");
    noFlightCardEl.classList.add("hidden");
    targetGroupEl.classList.remove("hidden");
    radarArrowOrbitEl.classList.remove("hidden");
    scanningOverlayEl.classList.add("hidden");

    // Position target reticle
    targetGroupEl.setAttribute("transform", `translate(${displayedX.toFixed(1)}, ${displayedY.toFixed(1)})`);

    // Position tracking arrow & bearing label
    radarArrowOrbitEl.style.setProperty("--arrow-angle", `${displayedUiAngle.toFixed(1)}deg`);
    arrowBearingLabelEl.textContent = `${Math.round(sBearing).toString().padStart(3, "0")}°`;

    // Update Text Dashboard
    airlineNameEl.textContent = selected.route?.airline || (selected.displayName.startsWith("a") ? "AIRCRAFT" : "COMMERCIAL FLIGHT");
    flightCallsignEl.textContent = selected.displayName;
    aircraftTypeEl.textContent = selected.aircraftType || "Aircraft type unknown";

    if (selected.route?.origin && selected.route?.destination) {
      routeOriginCodeEl.textContent = selected.route.origin.code;
      routeOriginNameEl.textContent = selected.route.origin.name;
      routeDestinationCodeEl.textContent = selected.route.destination.code;
      routeDestinationNameEl.textContent = selected.route.destination.name;
      routeDisplayEl.classList.remove("hidden");
    } else {
      routeDisplayEl.classList.add("hidden");
    }

    // Telemetry display bindings using SMOOTHED coordinates!
    metricAltitudeEl.textContent = Math.round(selectedState.smoothAlt).toLocaleString();

    if (selected.verticalRateFpm > 128) {
      verticalTrendIconEl.textContent = "▲";
      verticalTrendIconEl.style.color = "#10b981";
      metricVerticalRateEl.textContent = `+${Math.round(selected.verticalRateFpm)} FPM`;
    } else if (selected.verticalRateFpm < -128) {
      verticalTrendIconEl.textContent = "▼";
      verticalTrendIconEl.style.color = "#3b82f6";
      metricVerticalRateEl.textContent = `${Math.round(selected.verticalRateFpm)} FPM`;
    } else {
      verticalTrendIconEl.textContent = "—";
      verticalTrendIconEl.style.color = "rgba(255, 255, 255, 0.4)";
      metricVerticalRateEl.textContent = "LEVEL";
    }

    metricDistanceEl.textContent = sDistKm.toFixed(1);
    metricElevationEl.textContent = `${getElevationDescription(sElevation)} (${Math.round(sElevation)}° up)`;
    metricSpeedEl.textContent = Math.round(selected.groundSpeedKmh || 0);
    metricBearingEl.textContent = Math.round(sBearing);
    metricBearingDirectionEl.textContent = getCardinalDirection(sBearing);
    
    // Show signal age relative to last true updates
    const selectedAge = (now - selectedState.lastTrueTime) / 1000;
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