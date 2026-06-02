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
  const bestSelectable = aircraftList.find((a) => a.isSelectable) || null;
  let selected = null;

  if (bestSelectable) {
    const currentActive = clientSelectedHex ? aircraftList.find((a) => a.hex === clientSelectedHex) : null;
    if (currentActive && isStillSelectableAircraft(currentActive)) {
      const bestDistance = bestSelectable.distanceKm ?? Infinity;
      const currentDistance = currentActive.distanceKm ?? Infinity;
      // Hysteresis threshold: new target must be at least 0.1 km closer to trigger selection switch
      if (bestSelectable.hex !== clientSelectedHex && bestDistance < currentDistance - 0.1) {
        selected = bestSelectable;
      } else {
        selected = currentActive;
      }
    } else {
      selected = bestSelectable;
    }
  } else if (clientSelectedHex) {
    const currentActive = aircraftList.find((a) => a.hex === clientSelectedHex) || null;
    if (currentActive && isStillSelectableAircraft(currentActive)) {
      selected = currentActive;
    }
  }

  return selected;
}
