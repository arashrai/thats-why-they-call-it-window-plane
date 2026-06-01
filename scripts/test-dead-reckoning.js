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
  
  const ageSec = Math.min(300, (now - state.lastTrueTime) / 1000);
  
  let estLat = state.lastTrueLat;
  let estLon = state.lastTrueLon;
  let estAlt = state.lastTrueAlt;
  
  const speed = groundSpeedKmh || 0;
  const track = state.lastTrueTrack;
  
  if (speed > 0 && track != null) {
    const speedKms = speed / 3600;
    const trackRad = degToRad(track);
    
    let dLatKm = 0;
    let dLonKm = 0;

    if (Math.abs(state.turnRateDegPerSec) < 0.05) {
      // Straight line approximation
      const distanceKm = speedKms * ageSec;
      dLatKm = distanceKm * Math.cos(trackRad);
      dLonKm = distanceKm * Math.sin(trackRad);
    } else {
      // Curved path kinematics
      const turnRateRad = degToRad(state.turnRateDegPerSec);
      const vOverW = speedKms / turnRateRad;
      const endTrackRad = trackRad + turnRateRad * ageSec;
      
      dLatKm = vOverW * (Math.sin(endTrackRad) - Math.sin(trackRad));
      dLonKm = vOverW * (Math.cos(trackRad) - Math.cos(endTrackRad));
    }

    // 1 degree latitude = 111.32 km
    const dLat = dLatKm / 111.32;
    // 1 degree longitude = 111.32 * cos(lat) km
    const dLon = dLonKm / (111.32 * Math.cos(degToRad(state.lastTrueLat)));
    
    estLat += dLat;
    estLon += dLon;
  }
  
  if (verticalRateFpm != null && estAlt != null) {
    const altRateFps = verticalRateFpm / 60;
    estAlt += altRateFps * ageSec;
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
  assert.strictEqual(res.altitudeFt, 5000, "Test 1 Failed: Altitude should be unchanged");
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
    turnRateDegPerSec: 0
  };
  const now = 30000; // 20 seconds later
  const res = estimatePositionFromState(state, now, 540, 600); // with 600 FPM climb
  
  const expectedDLon = 3.0 / (111.32 * Math.cos(degToRad(47.6)));
  assert.ok(approxEqual(res.lat, 47.6), "Test 2 Failed: Latitude should be unchanged");
  assert.ok(approxEqual(res.lon, -122.3 + expectedDLon), "Test 2 Failed: Longitude deviation");
  assert.strictEqual(res.altitudeFt, 5000 + (600 / 60) * 20, "Test 2 Failed: Altitude deviation");
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
    turnRateDegPerSec: 3 // Turning right at 3 deg/s
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
    turnRateDegPerSec: -1.5 // Turning left
  };
  const now = 70000; // 60 seconds later
  const res = estimatePositionFromState(state, now, 540, -1200); // 1200 FPM descent
  
  const radiusKm = 0.15 / degToRad(1.5);
  const expectedDLat = -radiusKm / 111.32;
  const expectedDLon = radiusKm / (111.32 * Math.cos(degToRad(47.6)));

  assert.ok(approxEqual(res.lat, 47.6 + expectedDLat), "Test 4 Failed: Latitude deviation");
  assert.ok(approxEqual(res.lon, -122.3 + expectedDLon), "Test 4 Failed: Longitude deviation");
  assert.strictEqual(res.altitudeFt, 8000 + (-1200 / 60) * 60, "Test 4 Failed: Altitude deviation");
  console.log("✓ Test 4 Passed: Left turn kinematics with descent");
}

console.log("All unit tests passed successfully!");
