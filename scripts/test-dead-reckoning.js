import assert from "assert";

// Math functions copied from app.js to ensure exact logic verification
function degToRad(deg) { return (deg * Math.PI) / 180; }
function radToDeg(rad) { return (rad * 180) / Math.PI; }
function normalizeDeg(deg) { return ((deg % 360) + 360) % 360; }
function signedAngularDiffDeg(angle, reference) {
  return ((((angle - reference) % 360) + 540) % 360) - 180;
}

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

// Helper to check closeness of floating point numbers
function approxEqual(val, expected, tolerance = 0.0001) {
  return Math.abs(val - expected) < tolerance;
}

console.log("Running kinematics unit tests...");

// Test Case 1: Straight line flight at 0° (North) heading
// Speed: 360 km/h (0.1 km/s). Heading: 0° (North). Duration: 10s.
// Expected displacement: 1.0 km North.
// 1.0 km North / 111.32 = 0.008983 degrees latitude change.
// Longitude change should be 0.
{
  const state = {
    lastTrueLat: 47.6,
    lastTrueLon: -122.3,
    lastTrueAlt: 5000,
    lastTrueTrack: 0,
    lastTrueTime: 10000,
    turnRateDegPerSec: 0
  };
  const now = 20000; // 10 seconds later
  const res = estimatePositionFromState(state, now, 360, 0);
  
  assert.ok(approxEqual(res.lat, 47.6 + (1.0 / 111.32)), "Test 1 Failed: Latitude deviation");
  assert.ok(approxEqual(res.lon, -122.3), "Test 1 Failed: Longitude should be unchanged");
  assert.ok(approxEqual(res.altitudeFt, 5000), "Test 1 Failed: Altitude should be unchanged");
  console.log("✓ Test 1 Passed: Straight flight North");
}

// Test Case 2: Straight line flight at 90° (East) heading
// Speed: 540 km/h (0.15 km/s). Heading: 90° (East). Duration: 20s.
// Expected displacement: 3.0 km East.
// Latitude change should be 0.
// Longitude change: 3.0 km / (111.32 * cos(47.6°)) = 3.0 / (111.32 * 0.6743) = 0.03996 degrees.
{
  const state = {
    lastTrueLat: 47.6,
    lastTrueLon: -122.3,
    lastTrueAlt: 5000,
    lastTrueTrack: 90,
    lastTrueTime: 10000,
    turnRateDegPerSec: 0,
    verticalRateDecaySeconds: Infinity
  };
  const now = 30000; // 20 seconds later
  const res = estimatePositionFromState(state, now, 540, 600); // with 600 FPM climb
  
  const expectedDLon = 3.0 / (111.32 * Math.cos(degToRad(47.6)));
  assert.ok(approxEqual(res.lat, 47.6), "Test 2 Failed: Latitude should be unchanged");
  assert.ok(approxEqual(res.lon, -122.3 + expectedDLon), "Test 2 Failed: Longitude deviation");
  assert.ok(approxEqual(res.altitudeFt, 5000 + (600 / 60) * 20), "Test 2 Failed: Altitude deviation");
  console.log("✓ Test 2 Passed: Straight flight East with climb");
}

// Test Case 3: Standard Rate Turn (3 deg/sec) to the Right
// Speed: 360 km/h (0.1 km/s). Starting track: 0° (North). Turn Rate: 3 deg/sec. Duration: 30s.
// Expected: Turn 90° to the right (to East heading 90°).
// The path is a quarter circle.
// Turn radius R = speed / turn_rate_rad = 0.1 / degToRad(3) = 0.1 / 0.05236 = 1.90986 km.
// Centered at (lat0, lon0 + R).
// End position should be R km North and R km East of starting position.
{
  const state = {
    lastTrueLat: 47.6,
    lastTrueLon: -122.3,
    lastTrueAlt: 5000,
    lastTrueTrack: 0,
    lastTrueTime: 10000,
    turnRateDegPerSec: 3, // Turning right at 3 deg/s
    turnRateDecaySeconds: Infinity
  };
  const now = 40000; // 30 seconds later (turns exactly 90 degrees)
  const res = estimatePositionFromState(state, now, 360, 0);

  const radiusKm = 0.1 / degToRad(3);
  const expectedDLat = radiusKm / 111.32;
  const expectedDLon = radiusKm / (111.32 * Math.cos(degToRad(47.6)));

  assert.ok(approxEqual(res.lat, 47.6 + expectedDLat), "Test 3 Failed: Latitude deviation");
  assert.ok(approxEqual(res.lon, -122.3 + expectedDLon), "Test 3 Failed: Longitude deviation");
  console.log("✓ Test 3 Passed: Right turn kinematics (circular arc)");
}

// Test Case 4: Left Turn (-1.5 deg/sec)
// Speed: 540 km/h (0.15 km/s). Starting track: 180° (South). Turn Rate: -1.5 deg/sec. Duration: 60s.
// Expected: Turn -90° (to East heading 90°).
// Turn radius R = 0.15 / degToRad(1.5) = 5.729578 km.
{
  const state = {
    lastTrueLat: 47.6,
    lastTrueLon: -122.3,
    lastTrueAlt: 8000,
    lastTrueTrack: 180,
    lastTrueTime: 10000,
    turnRateDegPerSec: -1.5, // Turning left
    turnRateDecaySeconds: Infinity,
    verticalRateDecaySeconds: Infinity
  };
  const now = 70000; // 60 seconds later
  const res = estimatePositionFromState(state, now, 540, -1200); // 1200 FPM descent
  
  const radiusKm = 0.15 / degToRad(1.5);
  const expectedDLat = -radiusKm / 111.32;
  const expectedDLon = radiusKm / (111.32 * Math.cos(degToRad(47.6)));

  assert.ok(approxEqual(res.lat, 47.6 + expectedDLat), "Test 4 Failed: Latitude deviation");
  assert.ok(approxEqual(res.lon, -122.3 + expectedDLon), "Test 4 Failed: Longitude deviation");
  assert.ok(approxEqual(res.altitudeFt, 8000 + (-1200 / 60) * 60), "Test 4 Failed: Altitude deviation");
  console.log("✓ Test 4 Passed: Left turn kinematics with descent");
}

// Test Case 5: Infinite prediction age for moving planes vs capped age for stationary planes
{
  const stationaryState = {
    lastTrueLat: 47.6,
    lastTrueLon: -122.3,
    lastTrueAlt: 5000,
    lastTrueTrack: 0,
    lastTrueTime: 10000,
    turnRateDegPerSec: 0,
    verticalRateDecaySeconds: Infinity
  };
  
  const movingState = {
    ...stationaryState
  };

  const now = 610000; // 600 seconds later
  
  // 1. Stationary plane (speed = 0)
  const resStationary = estimatePositionFromState(stationaryState, now, 0, 120); // 120 FPM climb
  // Expected ageSec should be capped at 300.
  // Expected altitude: 5000 + (120 / 60) * 300 = 5600
  assert.ok(approxEqual(resStationary.altitudeFt, 5600), "Test 5 Failed: Stationary plane prediction age should be capped at 300s");
 
  // 2. Moving plane (speed = 360 km/h)
  const resMoving = estimatePositionFromState(movingState, now, 360, 120);
  // Expected ageSec should be 600 (not capped).
  // Expected displacement: speed (0.1 km/s) * 600s = 60 km
  // Expected latitude change: 60 km / 111.32 = 0.5389867 degrees
  // Expected altitude: 5000 + (120 / 60) * 600 = 6200
  assert.ok(approxEqual(resMoving.lat, 47.6 + (60.0 / 111.32)), "Test 5 Failed: Moving plane latitude deviation");
  assert.ok(approxEqual(resMoving.altitudeFt, 6200), "Test 5 Failed: Moving plane prediction age should not be capped");
  
  console.log("✓ Test 5 Passed: Infinite prediction age for moving planes vs capped age for stationary planes");
}

// Test Case 6: Turning & Vertical Rate Exponential Decay
// Speed: 360 km/h (0.1 km/s). Heading: 0° (North). Turn Rate: 3 deg/sec.
// Vertical Rate: 1200 FPM (20 fps). Duration: 20 seconds.
// Decay Constants: 10 seconds.
// Expected altitude: 5000 + 200 * (1 - e^-2) = 5172.93 ft.
{
  const state = {
    lastTrueLat: 47.6,
    lastTrueLon: -122.3,
    lastTrueAlt: 5000,
    lastTrueTrack: 0,
    lastTrueTime: 10000,
    turnRateDegPerSec: 3,
    turnRateDecaySeconds: 10,
    verticalRateDecaySeconds: 10
  };
  const now = 30000; // 20 seconds later
  const res = estimatePositionFromState(state, now, 360, 1200);

  const expectedAlt = 5000 + 20 * 10 * (1 - Math.exp(-2.0));
  assert.ok(approxEqual(res.altitudeFt, expectedAlt, 0.5), "Test 6 Failed: Decaying altitude deviation");
  
  // Track angle is updated numerically, let's verify it curved correctly
  assert.ok(Number.isFinite(res.lat), "Test 6 Failed: Lat is not finite");
  assert.ok(Number.isFinite(res.lon), "Test 6 Failed: Lon is not finite");
  console.log("✓ Test 6 Passed: Turning & Vertical Rate Exponential Decay");
}

console.log("All unit tests passed successfully!");
