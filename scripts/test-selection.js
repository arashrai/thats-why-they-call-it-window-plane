import assert from "assert";
import { selectActiveAircraft, isSelectableAircraft, isStillSelectableAircraft } from "../src/services/selection.js";
import { config } from "../src/services/config.js";

// Mock home config values
config.home = {
  lat: 47.6168,
  lon: -122.3314,
  elevationFt: 488,
  maxDistanceKm: 10.0,
  minElevationAngleDeg: 0,
  maxElevationAngleDeg: 85,
  downBearingDeg: 120,
  bearingToUiScale: 1
};

console.log("Running target selection unit tests...");

// Test Case 1: Basic selectability based on distance
{
  const planeInRange = {
    hex: "a00001",
    lat: 47.6,
    lon: -122.3,
    distanceKm: 8.0
  };
  const planeOutOfRange = {
    hex: "a00002",
    lat: 47.6,
    lon: -122.1,
    distanceKm: 15.0
  };

  assert.strictEqual(isSelectableAircraft(planeInRange), true, "Plane in range should be selectable");
  assert.strictEqual(isSelectableAircraft(planeOutOfRange), false, "Plane out of range should not be selectable");
  console.log("✓ Test 1 Passed: Basic selectability (distance)");
}

// Test Case 2: Target deselection when exiting range (exceeding maxDistanceKm + hysteresis buffer)
{
  // Current selection is "a00001"
  // It has drifted to 11.5 km (exceeding 10.0 + 1.0 km hysteresis buffer)
  const aircraftList = [
    {
      hex: "a00001",
      lat: 47.6,
      lon: -122.2,
      distanceKm: 11.5,
      isSelectable: false
    }
  ];

  const selected = selectActiveAircraft(aircraftList, "a00001");
  assert.strictEqual(selected, null, "Plane exiting range beyond hysteresis boundary should be deselected (selected is null)");
  console.log("✓ Test 2 Passed: Deselection upon exiting range");
}

// Test Case 3: Target stays selected within hysteresis zone
{
  // Current selection is "a00001"
  // It has drifted to 10.5 km (within 10.0 + 1.0 km hysteresis buffer)
  const aircraftList = [
    {
      hex: "a00001",
      lat: 47.6,
      lon: -122.25,
      distanceKm: 10.5,
      isSelectable: false
    }
  ];

  const selected = selectActiveAircraft(aircraftList, "a00001");
  assert.ok(selected, "Plane should remain selected inside hysteresis zone");
  assert.strictEqual(selected.hex, "a00001", "Plane inside hysteresis zone should stay selected");
  console.log("✓ Test 3 Passed: Hysteresis boundary retention");
}

// Test Case 4: Selection switches to a new closer plane when current selection is further away
{
  // Current active is "a00001" (at 9.0 km)
  // New selectable plane "a00002" enters at 5.0 km (closer by > 0.1 km threshold)
  const aircraftList = [
    {
      hex: "a00002",
      lat: 47.61,
      lon: -122.31,
      distanceKm: 5.0,
      isSelectable: true
    },
    {
      hex: "a00001",
      lat: 47.62,
      lon: -122.21,
      distanceKm: 9.0,
      isSelectable: true
    }
  ];

  const selected = selectActiveAircraft(aircraftList, "a00001");
  assert.ok(selected, "Should have a selected target");
  assert.strictEqual(selected.hex, "a00002", "Selection should switch to the closer target");
  console.log("✓ Test 4 Passed: Selection switch to closer plane");
}

// Test Case 5: Hysteresis threshold prevents rapid switching (flashing)
{
  // Current active is "a00001" (at 8.0 km)
  // New plane "a00002" is at 7.95 km (only 0.05 km closer, less than the 0.1 km threshold)
  const aircraftList = [
    {
      hex: "a00002",
      lat: 47.61,
      lon: -122.31,
      distanceKm: 7.95,
      isSelectable: true
    },
    {
      hex: "a00001",
      lat: 47.62,
      lon: -122.21,
      distanceKm: 8.0,
      isSelectable: true
    }
  ];

  const selected = selectActiveAircraft(aircraftList, "a00001");
  assert.ok(selected, "Should have a selected target");
  assert.strictEqual(selected.hex, "a00001", "Should NOT switch selection due to hysteresis threshold (0.1 km)");
  console.log("✓ Test 5 Passed: Selection switch prevented by hysteresis threshold");
}

// Test Case 6: Selection switches immediately to closest plane on signal dropout of the current selection
{
  // Current active was "a00001" but it is no longer in the payload (signal dropout)
  // Closest selectable is "a00002" (at 7.0 km)
  const aircraftList = [
    {
      hex: "a00002",
      lat: 47.61,
      lon: -122.31,
      distanceKm: 7.0,
      isSelectable: true
    }
  ];

  const selected = selectActiveAircraft(aircraftList, "a00001");
  assert.ok(selected, "Should have a selected target");
  assert.strictEqual(selected.hex, "a00002", "Should switch immediately to the new selectable target if old target disappears");
  console.log("✓ Test 6 Passed: Target switch on current selection dropout");
}

// Test Case 7: Stale signal aircraft is still selectable, but a fresh plane is preferred
{
  const planeStale = {
    hex: "a00001",
    lat: 47.6,
    lon: -122.3,
    distanceKm: 5.0,
    seenSec: 12.0
  };
  assert.strictEqual(isSelectableAircraft(planeStale), true, "Stale plane in range should still be selectable");
  console.log("✓ Test 7 Passed: Stale plane in range is selectable");
}

// Test Case 8: Active selection switches to fresh target when current selection becomes stale
{
  // Current active is "a00001" (at 5.0 km, but stale with seenSec = 16.0s)
  // Fresh plane "a00002" is at 7.0 km (fresh with seenSec = 1.0s)
  const aircraftList = [
    {
      hex: "a00001",
      lat: 47.6,
      lon: -122.3,
      distanceKm: 5.0,
      seenSec: 16.0
    },
    {
      hex: "a00002",
      lat: 47.61,
      lon: -122.31,
      distanceKm: 7.0,
      seenSec: 1.0
    }
  ];

  const selected = selectActiveAircraft(aircraftList, "a00001");
  assert.ok(selected, "Should have a selected target");
  assert.strictEqual(selected.hex, "a00002", "Should switch to fresh target when active selection exceeds staleness threshold");
  console.log("✓ Test 8 Passed: Selection switches to fresh target on active selection staleness");
}

console.log("All selection tests passed successfully!");
