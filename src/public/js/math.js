// Math Utilities

export function degToRad(deg) { return (deg * Math.PI) / 180; }
export function radToDeg(rad) { return (rad * 180) / Math.PI; }
export function normalizeDeg(deg) { return ((deg % 360) + 360) % 360; }
export function signedAngularDiffDeg(angle, reference) {
  return ((((angle - reference) % 360) + 540) % 360) - 180;
}

export function haversineNm(lat1, lon1, lat2, lon2) {
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

export function bearingDeg(lat1, lon1, lat2, lon2) {
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

export function elevationAngleDeg(distanceNm, altitudeFt, homeElevationFt) {
  if (distanceNm == null || altitudeFt == null) return 0;
  const groundDistanceFt = distanceNm * 6076.12;
  const altitudeAboveHomeFt = altitudeFt - homeElevationFt;
  return radToDeg(Math.atan2(altitudeAboveHomeFt, groundDistanceFt));
}

export function bearingToUiAngleDeg(bearingFromHomeDeg, downBearingDeg, bearingToUiScale) {
  if (bearingFromHomeDeg == null) return 90;
  const diffFromDown = signedAngularDiffDeg(bearingFromHomeDeg, downBearingDeg);
  return normalizeDeg(90 - diffFromDown * bearingToUiScale);
}

export function getCardinalDirection(bearing) {
  const directions = ["NORTH", "NORTHEAST", "EAST", "SOUTHEAST", "SOUTH", "SOUTHWEST", "WEST", "NORTHWEST"];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

export function getElevationDescription(deg) {
  if (deg == null) return "";
  if (deg < 10) return "NEAR THE HORIZON";
  if (deg < 25) return "LOW IN SKY";
  if (deg < 50) return "MID SKY";
  if (deg < 80) return "HIGH IN SKY";
  return "DIRECTLY OVERHEAD (ZENITH)";
}

export function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

// Curved position interpolator accounting for turn rate, dead-reckoning from last known true state
export function estimatePositionFromState(state, now, groundSpeedKmh, verticalRateFpm) {
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

export function calculateKinematicsFromCoords(coords) {
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
  
  const dtExtrapolate = 0.5 * dt23;
  const measuredTrack = normalizeDeg(h23 + measuredTurnRate * dtExtrapolate);
  
  return { measuredTurnRate, measuredTrack };
}
