import {
  lerp,
  haversineNm,
  bearingDeg,
  elevationAngleDeg,
  calculatePerspectiveCoords,
  degToRad,
  estimatePositionFromState,
  calculateKinematicsFromCoords
} from "./math.js";

export class StateManager {
  constructor() {
    this.planeStates = new Map();
    this.flightTrails = new Map();
    this.currentSelectedHex = null;
    this.displaySelectedHex = null;
  }

  updateAirspace(allPlanes, config, maxDistanceKm) {
    const now = Date.now();
    const presentHexes = new Set();

    allPlanes.forEach(plane => {
      if (plane.hex == null) return;
      presentHexes.add(plane.hex);

      let state = this.planeStates.get(plane.hex);
      const newTrueTime = now - (plane.seenPosSec || plane.seenSec || 0) * 1000;

      if (!state) {
        if (plane.lat == null || plane.lon == null) return;

        state = {
          hex: plane.hex,
          displayName: plane.displayName || plane.hex,
          aircraftType: plane.aircraftType,
          groundSpeedKmh: plane.groundSpeedKmh,
          verticalRateFpm: plane.verticalRateFpm,
          route: plane.route,
          isSelectable: plane.isSelectable,
          lastTrueLat: plane.lat,
          lastTrueLon: plane.lon,
          lastTrueAlt: plane.altitudeFt,
          lastTrueTrack: plane.trackDeg,
          lastTrueTime: newTrueTime,
          lastTrackTime: newTrueTime,
          turnRateDegPerSec: 0,
          verifiedCoords: [{ lat: plane.lat, lon: plane.lon, t: newTrueTime }]
        };
        this.planeStates.set(plane.hex, state);

        let trail = this.flightTrails.get(plane.hex);
        if (!trail) {
          trail = { points: [], maxAge: Infinity, active: true };
          this.flightTrails.set(plane.hex, trail);
        }
        trail.active = true;
        trail.maxAge = Infinity;

        if (config && maxDistanceKm) {
          const rawDistNm = haversineNm(config.homeLat, config.homeLon, plane.lat, plane.lon);
          const rawBearing = bearingDeg(config.homeLat, config.homeLon, plane.lat, plane.lon);
          const rawElev = elevationAngleDeg(rawDistNm, plane.altitudeFt, config.homeElevationFt);
          const rawCoords = calculatePerspectiveCoords(rawBearing, rawElev, config);

          trail.points.push({
            x: rawCoords.x,
            y: rawCoords.y,
            t: newTrueTime,
            isVerified: true
          });
        }
      } else {
        state.displayName = plane.displayName || state.displayName;
        state.aircraftType = plane.aircraftType || state.aircraftType;
        state.groundSpeedKmh = plane.groundSpeedKmh ?? state.groundSpeedKmh;
        state.verticalRateFpm = plane.verticalRateFpm ?? state.verticalRateFpm;
        state.route = plane.route || state.route;
        state.isSelectable = plane.isSelectable ?? state.isSelectable;

        let hasNewCoord = false;
        if (plane.lat != null && plane.lon != null) {
          if (Math.abs(newTrueTime - state.lastTrueTime) > 50) {
            state.lastTrueLat = plane.lat;
            state.lastTrueLon = plane.lon;
            state.lastTrueTime = newTrueTime;
            hasNewCoord = true;

            if (!state.verifiedCoords) {
              state.verifiedCoords = [];
            }
            state.verifiedCoords.push({ lat: plane.lat, lon: plane.lon, t: newTrueTime });
            if (state.verifiedCoords.length > 5) {
              state.verifiedCoords.shift();
            }

            let trail = this.flightTrails.get(plane.hex);
            if (!trail) {
              trail = { points: [], maxAge: Infinity, active: true };
              this.flightTrails.set(plane.hex, trail);
            }
            trail.active = true;
            trail.maxAge = Infinity;

            if (config && maxDistanceKm) {
              const rawDistNm = haversineNm(config.homeLat, config.homeLon, plane.lat, plane.lon);
              const rawBearing = bearingDeg(config.homeLat, config.homeLon, plane.lat, plane.lon);
              const rawElev = elevationAngleDeg(rawDistNm, plane.altitudeFt, config.homeElevationFt);
              const rawCoords = calculatePerspectiveCoords(rawBearing, rawElev, config);

              trail.points.push({
                x: rawCoords.x,
                y: rawCoords.y,
                t: newTrueTime,
                isVerified: true
              });
            }
          }
        }

        if (plane.altitudeFt != null) {
          state.lastTrueAlt = plane.altitudeFt;
        }

        let turnRate = state.turnRateDegPerSec || 0;
        if (state.verifiedCoords && state.verifiedCoords.length >= 3) {
          if (hasNewCoord) {
            const kinematics = calculateKinematicsFromCoords(state.verifiedCoords);
            if (kinematics) {
              const clampedTurnRate = Math.max(-6.0, Math.min(6.0, kinematics.measuredTurnRate));
              turnRate = lerp(turnRate, clampedTurnRate, 0.25);
              state.lastTrueTrack = kinematics.measuredTrack;
              state.lastTrackTime = newTrueTime;
            }
          }
        } else {
          if (plane.trackDeg != null) {
            state.lastTrueTrack = plane.trackDeg;
            state.lastTrackTime = newTrueTime;
          }
          turnRate = 0;
        }
        state.turnRateDegPerSec = turnRate;
      }
    });

    // Prune stale plane states
    for (const [hex, state] of this.planeStates.entries()) {
      if (!presentHexes.has(hex)) {
        const ageSec = (now - state.lastTrueTime) / 1000;
        const isSelected = this.displaySelectedHex && hex === this.displaySelectedHex;
        if (ageSec > 30.0 && !isSelected) {
          this.planeStates.delete(hex);
        }
      }
    }
  }

  syncSelection(serverSelectedHex, allPlanes) {
    this.currentSelectedHex = serverSelectedHex;

    if (serverSelectedHex) {
      this.displaySelectedHex = serverSelectedHex;
    } else if (this.displaySelectedHex) {
      const isStillInPayload = allPlanes.some(a => a.hex === this.displaySelectedHex);
      const activeState = this.planeStates.get(this.displaySelectedHex);

      if (isStillInPayload) {
        this.displaySelectedHex = null;
      } else if (activeState) {
        const ageSec = (Date.now() - activeState.lastTrueTime) / 1000;
        if (ageSec > 30.0) {
          this.displaySelectedHex = null;
        }
      } else {
        this.displaySelectedHex = null;
      }
    } else {
      this.displaySelectedHex = null;
    }
  }

  decayTrails(now) {
    for (const [hex, trail] of this.flightTrails.entries()) {
      if (!trail.active) {
        if (trail.maxAge === Infinity) {
          const oldestAge = (trail.points && trail.points.length > 0) ? (now - trail.points[0].t) : 30000;
          trail.maxAge = Math.max(30000, oldestAge);
        }
        trail.maxAge = Math.max(0, trail.maxAge - 150);
        if (trail.maxAge <= 0 || trail.points.length === 0) {
          this.flightTrails.delete(hex);
          continue;
        }
      }

      const TRAIL_MAX_AGE_MS = 60000;
      if (trail.maxAge !== Infinity) {
        trail.points = trail.points.filter(p => now - p.t < trail.maxAge);
      } else {
        trail.points = trail.points.filter(p => now - p.t < TRAIL_MAX_AGE_MS);
      }
    }
  }

  appendTrailPredictions(now, config, maxDistanceKm) {
    for (const [hex, state] of this.planeStates.entries()) {
      let trail = this.flightTrails.get(hex);
      if (!trail || !trail.active) continue;

      if (!state.lastPredPointTime || state.lastPredPointTime < state.lastTrueTime) {
        state.lastPredPointTime = state.lastTrueTime;
      }

      const predInterval = 300;
      const elapsedPred = now - state.lastPredPointTime;
      if (elapsedPred > predInterval) {
        const catchUpTime = Math.min(60000, elapsedPred);
        const numPoints = Math.floor(catchUpTime / predInterval);

        for (let i = 1; i <= numPoints; i++) {
          const tPoint = state.lastPredPointTime + i * predInterval;
          const estPosAtT = estimatePositionFromState(state, tPoint, state.groundSpeedKmh, state.verticalRateFpm);
          
          if (estPosAtT && config && maxDistanceKm) {
            const distNmAtT = haversineNm(config.homeLat, config.homeLon, estPosAtT.lat, estPosAtT.lon);
            const bearingAtT = bearingDeg(config.homeLat, config.homeLon, estPosAtT.lat, estPosAtT.lon);
            const elevAtT = elevationAngleDeg(distNmAtT, estPosAtT.altitudeFt, config.homeElevationFt);
            const coordsAtT = calculatePerspectiveCoords(bearingAtT, elevAtT, config);

            trail.points.push({
              x: coordsAtT.x,
              y: coordsAtT.y,
              t: tPoint,
              isVerified: false
            });
          }
        }
        state.lastPredPointTime = state.lastPredPointTime + numPoints * predInterval;
      }
    }
  }
}
