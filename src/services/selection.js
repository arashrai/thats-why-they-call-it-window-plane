import { config } from "./config.js";

export function isSelectableAircraft(a) {
  return (
    a.lat != null &&
    a.lon != null &&
    a.distanceKm != null &&
    a.distanceKm <= config.home.maxDistanceKm
  );
}

export function isStillSelectableAircraft(a) {
  return (
    a.lat != null &&
    a.lon != null &&
    a.distanceKm != null &&
    a.distanceKm <= (config.home.maxDistanceKm + 1.0)
  );
}

export function selectActiveAircraft(aircraftList, clientSelectedHex) {
  // Filter all selectable aircraft (in range)
  const selectables = aircraftList.filter(isSelectableAircraft);
  if (selectables.length === 0) {
    if (clientSelectedHex) {
      const currentActive = aircraftList.find((a) => a.hex === clientSelectedHex) || null;
      if (currentActive && isStillSelectableAircraft(currentActive)) {
        return currentActive;
      }
    }
    return null;
  }

  const currentActive = clientSelectedHex ? aircraftList.find((a) => a.hex === clientSelectedHex) : null;
  const isFresh = (a) => (a.seenSec == null || a.seenSec <= 10.0);

  if (!currentActive || !isStillSelectableAircraft(currentActive)) {
    // Sort selectables: fresh ones first, then by distance
    const sorted = [...selectables].sort((a, b) => {
      const aFresh = isFresh(a);
      const bFresh = isFresh(b);
      if (aFresh && !bFresh) return -1;
      if (!aFresh && bFresh) return 1;
      return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    });
    return sorted[0] || null;
  }

  const alternatives = selectables.filter(a => a.hex !== clientSelectedHex);
  if (alternatives.length === 0) {
    return currentActive;
  }

  const sortedAlternatives = [...alternatives].sort((a, b) => {
    const aFresh = isFresh(a);
    const bFresh = isFresh(b);
    if (aFresh && !bFresh) return -1;
    if (!aFresh && bFresh) return 1;
    return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
  });
  const bestAlt = sortedAlternatives[0];

  const currentActiveFresh = isFresh(currentActive);
  const bestAltFresh = isFresh(bestAlt);

  if (bestAltFresh && !currentActiveFresh) {
    // Switch immediately to a fresh target if the current one is stale
    return bestAlt;
  }
  
  if (!bestAltFresh && currentActiveFresh) {
    // Keep tracking the current fresh target instead of switching to a stale one
    return currentActive;
  }

  // If both are fresh or both are stale, switch only if the alternative is closer by at least the 0.1 km hysteresis threshold
  const currentDist = currentActive.distanceKm ?? Infinity;
  const altDist = bestAlt.distanceKm ?? Infinity;
  if (altDist < currentDist - 0.1) {
    return bestAlt;
  }

  return currentActive;
}
