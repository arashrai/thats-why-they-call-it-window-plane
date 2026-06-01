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
const metricSpeedKtEl = document.getElementById("metric-speed-kt");
const metricBearingEl = document.getElementById("metric-bearing");
const metricBearingDirectionEl = document.getElementById("metric-bearing-direction");
const signalAgeEl = document.getElementById("signal-age");

// Radar Visual Elements
const compassGroupEl = document.getElementById("compass-group");
const targetGroupEl = document.getElementById("target-group");
const planeTrailEl = document.getElementById("plane-trail");
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

function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

function lerpAngle(current, target, factor) {
  let diff = signedAngularDiffDeg(target, current);
  return current + diff * factor;
}

// Dead-Reckoning Position Extrapolator
function estimatePosition(plane, ageSec) {
  if (plane.lat == null || plane.lon == null) return null;
  
  let estLat = plane.lat;
  let estLon = plane.lon;
  let estAlt = plane.altitudeFt;
  
  if (plane.groundSpeedKmh != null && plane.trackDeg != null) {
    const speedKms = plane.groundSpeedKmh / 3600;
    const distanceKm = speedKms * ageSec;
    const trackRad = degToRad(plane.trackDeg);
    
    // 1 degree latitude = 111.32 km
    const dLat = (distanceKm * Math.cos(trackRad)) / 111.32;
    // 1 degree longitude = 111.32 * cos(lat) km
    const dLon = (distanceKm * Math.sin(trackRad)) / (111.32 * Math.cos(degToRad(plane.lat)));
    
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

// Interpolated display state
let currentHex = null;
let displayedX = 0;
let displayedY = 0;
let displayedUiAngle = 0;
let trailPoints = []; // [{x, y, t}]
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
    
    // Hide error overlay
    errorOverlayEl.classList.add("hidden");
    systemStatusEl.textContent = "FEED ONLINE";
    systemStatusEl.style.borderColor = "rgba(0, 240, 255, 0.3)";
    systemStatusEl.style.color = "var(--accent-cyan)";
    
    // Rotate compass ring if configuration received
    if (config) {
      // Rotate such that N points to its calibrated screen angle
      // N is at top of SVG (270deg). We rotate N to uiAngleDeg(0)
      const compassRotationOffset = 180 + config.downBearingDeg * config.bearingToUiScale;
      compassGroupEl.style.transform = `rotate(${compassRotationOffset}deg)`;
      maxDistLimitEl.textContent = lastPayload.maxDistanceKm;
    }
    
    updateNearbyAirspace(data.nearby);
  } catch (err) {
    console.error("Fetch airspace failed:", err);
    errorMessageEl.textContent = `Unable to query receiver feed: ${err.message}`;
    errorOverlayEl.classList.remove("hidden");
    systemStatusEl.textContent = "FEED OFFLINE";
    systemStatusEl.style.borderColor = "rgba(239, 68, 68, 0.4)";
    systemStatusEl.style.color = "#ef4444";
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
  
  if (!selected) {
    // Transition to scanning/idle state
    flightDataEl.classList.add("hidden");
    noFlightCardEl.classList.remove("hidden");
    targetGroupEl.classList.add("hidden");
    radarArrowOrbitEl.classList.add("hidden");
    scanningOverlayEl.classList.remove("hidden");
    
    // Clear display tracking state
    currentHex = null;
    trailPoints = [];
    planeTrailEl.setAttribute("d", "");
    return;
  }
  
  // Plane is selected - compute elapsed time since last server fetch
  const elapsedSec = (Date.now() - localTimeAtFetch) / 1000;
  const ageSec = selected.seenSec + elapsedSec;
  
  // Extrapolate plane coordinates and altitude in real-time
  const estPos = estimatePosition(selected, ageSec);
  if (!estPos) return;
  
  // Calculate relative metrics from Home
  const distNm = haversineNm(config.homeLat, config.homeLon, estPos.lat, estPos.lon);
  const distKm = distNm * 1.852;
  const bearing = bearingDeg(config.homeLat, config.homeLon, estPos.lat, estPos.lon);
  const elevation = elevationAngleDeg(distNm, estPos.altitudeFt, config.homeElevationFt);
  
  // Map bearing to screen angle (compass angle)
  const targetUiAngle = bearingToUiAngleDeg(bearing, config.downBearingDeg, config.bearingToUiScale);
  
  // Detect target swap - snap immediately to prevent sliding line artifacts across radar
  if (selected.hex !== currentHex) {
    currentHex = selected.hex;
    trailPoints = [];
    
    const initialR = Math.min(140, (distKm / lastPayload.maxDistanceKm) * 140);
    displayedUiAngle = targetUiAngle;
    displayedX = initialR * Math.cos(degToRad(targetUiAngle));
    displayedY = initialR * Math.sin(degToRad(targetUiAngle));
    lastTrailPointTime = Date.now();
  } else {
    // Lerp values for ultra smooth target sliding
    displayedUiAngle = lerpAngle(displayedUiAngle, targetUiAngle, 0.08);
    
    const targetR = Math.min(140, (distKm / lastPayload.maxDistanceKm) * 140);
    const targetX = targetR * Math.cos(degToRad(targetUiAngle));
    const targetY = targetR * Math.sin(degToRad(targetUiAngle));
    
    displayedX = lerp(displayedX, targetX, 0.1);
    displayedY = lerp(displayedY, targetY, 0.1);
  }
  
  // Update HUD/Radar displays
  flightDataEl.classList.remove("hidden");
  noFlightCardEl.classList.add("hidden");
  targetGroupEl.classList.remove("hidden");
  radarArrowOrbitEl.classList.remove("hidden");
  scanningOverlayEl.classList.add("hidden");
  
  // Move target reticle to smoothed (x, y)
  targetGroupEl.setAttribute("transform", `translate(${displayedX}, ${displayedY})`);
  
  // Update trailing path (append point every 100ms)
  const now = Date.now();
  if (now - lastTrailPointTime > 100) {
    trailPoints.push({ x: displayedX, y: displayedY, t: now });
    lastTrailPointTime = now;
    
    // Purge old trail points (keep last 45 seconds of flight path)
    trailPoints = trailPoints.filter(p => now - p.t < 45000);
    
    // Render trail path
    if (trailPoints.length > 1) {
      let pathString = `M ${trailPoints[0].x.toFixed(1)} ${trailPoints[0].y.toFixed(1)}`;
      for (let i = 1; i < trailPoints.length; i++) {
        pathString += ` L ${trailPoints[i].x.toFixed(1)} ${trailPoints[i].y.toFixed(1)}`;
      }
      planeTrailEl.setAttribute("d", pathString);
    }
  }
  
  // Update tracking arrow rotation
  radarArrowOrbitEl.style.setProperty("--arrow-angle", `${displayedUiAngle}deg`);
  arrowBearingLabelEl.textContent = `${Math.round(bearing).toString().padStart(3, "0")}°`;
  
  // Update text dashboard panel
  airlineNameEl.textContent = selected.route?.airline || (selected.displayName.startsWith("a") ? "AIRCRAFT" : "COMMERCIAL FLIGHT");
  flightCallsignEl.textContent = selected.displayName;
  aircraftTypeEl.textContent = selected.aircraftType || "Aircraft type unknown";
  
  // Route details check
  if (selected.route?.origin && selected.route?.destination) {
    routeOriginCodeEl.textContent = selected.route.origin.code;
    routeOriginNameEl.textContent = selected.route.origin.name;
    routeDestinationCodeEl.textContent = selected.route.destination.code;
    routeDestinationNameEl.textContent = selected.route.destination.name;
    routeDisplayEl.classList.remove("hidden");
  } else {
    routeDisplayEl.classList.add("hidden");
  }
  
  // Update numeric telemetry readings
  metricAltitudeEl.textContent = Math.round(estPos.altitudeFt).toLocaleString();
  
  // Vertical trend
  if (selected.verticalRateFpm > 128) {
    verticalTrendIconEl.textContent = "▲";
    verticalTrendIconEl.style.color = "#10b981"; // green
    metricVerticalRateEl.textContent = `+${Math.round(selected.verticalRateFpm)} FPM`;
  } else if (selected.verticalRateFpm < -128) {
    verticalTrendIconEl.textContent = "▼";
    verticalTrendIconEl.style.color = "#3b82f6"; // blue
    metricVerticalRateEl.textContent = `${Math.round(selected.verticalRateFpm)} FPM`;
  } else {
    verticalTrendIconEl.textContent = "—";
    verticalTrendIconEl.style.color = "rgba(255, 255, 255, 0.4)";
    metricVerticalRateEl.textContent = "LEVEL";
  }
  
  metricDistanceEl.textContent = distKm.toFixed(1);
  metricElevationEl.textContent = `${Math.round(elevation)}° ELEVATION`;
  metricSpeedEl.textContent = Math.round(selected.groundSpeedKmh || 0);
  metricSpeedKtEl.textContent = `${Math.round(selected.groundSpeedKt || 0)} KNOTS`;
  metricBearingEl.textContent = Math.round(bearing);
  metricBearingDirectionEl.textContent = getCardinalDirection(bearing);
  signalAgeEl.textContent = `UPDATED ${ageSec.toFixed(1)}S AGO`;
}

// Initializer
fetchAirspace().then(() => {
  // Start rendering frame loop
  requestAnimationFrame(renderLoop);
  
  // Poll the Express backend receiver data every 1000ms
  setInterval(fetchAirspace, 1000);
});