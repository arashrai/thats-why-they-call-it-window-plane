import assert from "assert";
import {
  bearingToUiAngleDeg,
  normalizeDeg
} from "../src/public/js/math.js";

// Helper to check closeness of floating point numbers
function approxEqual(val, expected, tolerance = 0.01) {
  return Math.abs(val - expected) < tolerance;
}

console.log("Running bearing to UI angle mapping unit tests...");

// Test Case 1: Simple linear mapping (scale = 1.0, tilt = 0)
{
  // Bearing 120 (straight ahead / down on HUD, 90°)
  const angle120 = bearingToUiAngleDeg(120, 120, 1.0, 0);
  assert.ok(approxEqual(angle120, 90.0), "Angle should be 90° for centered target");

  // Bearing 150 (30 degrees clockwise / right on HUD)
  const angle150 = bearingToUiAngleDeg(150, 120, 1.0, 0);
  assert.ok(approxEqual(angle150, 60.0), "Angle should be 60° (90 - 30) for scale = 1.0");

  // Bearing 90 (30 degrees counter-clockwise / left on HUD)
  const angle90 = bearingToUiAngleDeg(90, 120, 1.0, 0);
  assert.ok(approxEqual(angle90, 120.0), "Angle should be 120° (90 - (-30)) for scale = 1.0");

  console.log("✓ Test 1 Passed: Linear mapping matches expectations");
}

// Test Case 2: Scaling mapping (scale = 1.2, tilt = 0)
{
  // Bearing 150 (30 degrees clockwise / right on HUD)
  const angle150 = bearingToUiAngleDeg(150, 120, 1.2, 0);
  assert.ok(approxEqual(angle150, 54.0), "Angle should be 54° (90 - 30 * 1.2) for scale = 1.2");

  // Bearing 90 (30 degrees counter-clockwise / left on HUD)
  const angle90 = bearingToUiAngleDeg(90, 120, 1.2, 0);
  assert.ok(approxEqual(angle90, 126.0), "Angle should be 126° (90 - (-30) * 1.2) for scale = 1.2");

  console.log("✓ Test 2 Passed: Scaling modifier behaves correctly");
}

// Test Case 3: Projector tilt mapping
{
  // Bearing 150 (30 degrees clockwise / right on HUD) with tilt = 20
  const angle150 = bearingToUiAngleDeg(150, 120, 1.0, 20);
  // With tilt, the angle should warp slightly away from center (smaller than 60)
  assert.ok(angle150 < 60.0, `Tilted angle (${angle150.toFixed(1)}°) should warp further to the right than linear 60°`);
  console.log("✓ Test 3 Passed: Projector tilt warping behaves correctly");
}

console.log("All projection unit tests passed successfully!");
