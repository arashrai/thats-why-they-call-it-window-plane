import assert from "assert";
import {
  calculatePerspectiveCoords,
  calculatePerspectiveArrowAngle,
  radToDeg,
  degToRad,
  normalizeDeg
} from "../src/public/js/math.js";

// Helper to check closeness of floating point numbers
function approxEqual(val, expected, tolerance = 0.01) {
  return Math.abs(val - expected) < tolerance;
}

console.log("Running perspective projection unit tests...");

// Test Case 1: Zero tilt should match linear angular mapping (flat projection straight up)
{
  const config = {
    downBearingDeg: 120,
    projectorTiltDeg: 0,
    ceilingHeightFt: 8.0,
    radarRadiusFt: 2.0
  };

  // Bearing 120 (straight ahead / down on HUD)
  const coords = calculatePerspectiveCoords(120, 30, config);
  assert.ok(approxEqual(coords.x, 0.0), "X should be 0 for centered target");
  assert.ok(coords.y > 0.0, "Y should be positive for down-pointing target");

  // Bearing 150 (30 degrees clockwise / right on HUD)
  const coords150 = calculatePerspectiveCoords(150, 30, config);
  const angle150 = normalizeDeg(radToDeg(Math.atan2(coords150.y, coords150.x)));
  assert.ok(approxEqual(angle150, 60.0), "Angle should be 60° (90 - 30) for zero tilt");

  // Bearing 90 (30 degrees counter-clockwise / left on HUD)
  const coords90 = calculatePerspectiveCoords(90, 30, config);
  const angle90 = normalizeDeg(radToDeg(Math.atan2(coords90.y, coords90.x)));
  assert.ok(approxEqual(angle90, 120.0), "Angle should be 120° (90 - (-30)) for zero tilt");

  console.log("✓ Test 1 Passed: Zero tilt behaves orthogonally");
}

// Test Case 2: Tilted projection perspective warping
{
  const config = {
    downBearingDeg: 120,
    projectorTiltDeg: 25, // Tilted 25 degrees forward
    ceilingHeightFt: 8.0,
    radarRadiusFt: 2.0
  };

  // Plane is 30 degrees to the right (bearing 150)
  // With 25 degree tilt, the angle on the screen should warp further right (smaller angle on screen)
  const arrowAngle = calculatePerspectiveArrowAngle(150, config);
  // Linear angle would be 60. With forward shift, the perceived angle should be stretched (closer to 0)
  // Let's check the angular difference from 90° (Down)
  const diff150 = Math.abs(normalizeDeg(arrowAngle - 90)); // diff from 90
  // 351.2° is 98.8° away from 90°. 60° is 30° away from 90°.
  // So the difference from 90 should be larger than 30.
  const dev150 = Math.abs(120 - 150); // 30
  assert.ok(diff150 > dev150, `Tilted arrow angle (${arrowAngle.toFixed(1)}°) should warp further from 90° than linear 30° (got ${diff150.toFixed(1)}°)`);
  
  // Plane is 30 degrees to the left (bearing 90)
  // With 25 degree tilt, the angle on the screen should warp further left (larger angle on screen)
  const arrowAngleLeft = calculatePerspectiveArrowAngle(90, config);
  const diff90 = Math.abs(normalizeDeg(arrowAngleLeft - 90));
  const dev90 = Math.abs(120 - 90); // 30
  assert.ok(diff90 > dev90, `Tilted arrow angle (${arrowAngleLeft.toFixed(1)}°) should warp further from 90° than linear 30° (got ${diff90.toFixed(1)}°)`);

  console.log("✓ Test 2 Passed: Perspective warping under projector tilt");
}

// Test Case 3: Clamping logic for out-of-bounds perspective angles
{
  const config = {
    downBearingDeg: 120,
    projectorTiltDeg: 60, // Extreme tilt (K_tilt will be very large)
    ceilingHeightFt: 8.0,
    radarRadiusFt: 2.0
  };

  // K_scale = 8.0 / 2.0 = 4.0
  // K_tilt = 4.0 * tan(60) = 4.0 * 1.732 = 6.928
  // This is way > 1, so clamping to [-1, 1] is guaranteed to trigger for side bearings.
  const angle = calculatePerspectiveArrowAngle(210, config); // 90 degrees offset, sin(90) = 1
  assert.ok(Number.isFinite(angle), "Arrow angle should still compute a finite value even with extreme out-of-bounds tilt");
  console.log("✓ Test 3 Passed: Clamping boundaries successfully handled");
}

console.log("All perspective unit tests passed successfully!");
