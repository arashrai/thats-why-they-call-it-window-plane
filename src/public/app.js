import { StateManager } from "./js/state-manager.js";
import { NetworkService } from "./js/network.js";
import { RadarRenderer } from "./js/radar-renderer.js";
import { TelemetryPanel } from "./js/telemetry-panel.js";
import {
  haversineNm,
  bearingDeg,
  elevationAngleDeg,
  bearingToUiAngleDeg,
  getCardinalDirection,
  getElevationDescription,
  degToRad,
  estimatePositionFromState
} from "./js/math.js";

// Global DOM references for general state
const errorOverlayEl = document.getElementById("error-overlay");
const errorMessageEl = document.getElementById("error-message");
const maxDistLimitEl = document.getElementById("max-dist-limit");

// Instantiate core modules
const stateManager = new StateManager();
const radarRenderer = new RadarRenderer();
const telemetryPanel = new TelemetryPanel();

let lastPayload = null;
let config = null;
let lastRenderTime = 0;
const TARGET_FPS = 25;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

// Network handlers
const networkService = new NetworkService(
  (data) => {
    // onData callback
    lastPayload = data;
    config = data.config;

    stateManager.updateAirspace(data.aircraft || [], config, data.maxDistanceKm);
    stateManager.syncSelection(data.selected ? data.selected.hex : null, data.aircraft || []);

    if (config) {
      radarRenderer.setCompassRotation(config);
      if (maxDistLimitEl) {
        maxDistLimitEl.textContent = data.maxDistanceKm;
      }
    }

    if (lastPayload && lastPayload.nearby) {
      telemetryPanel.renderNearbyAirspace(lastPayload.nearby);
    }

    errorOverlayEl.classList.add("hidden");
  },
  (err) => {
    // onError callback
    console.error("Fetch airspace failed:", err);
    if (errorMessageEl) {
      errorMessageEl.textContent = `Unable to query receiver feed: ${err.message}`;
    }
    errorOverlayEl.classList.remove("hidden");
  }
);

function renderLoop() {
  requestAnimationFrame(renderLoop);

  if (!lastPayload || !config) return;

  const now = Date.now();
  const elapsedSinceLastRender = now - lastRenderTime;
  if (elapsedSinceLastRender < FRAME_INTERVAL) {
    return;
  }
  lastRenderTime = now - (elapsedSinceLastRender % FRAME_INTERVAL);

  // 1. Reset all trails to inactive for this frame
  for (const trail of stateManager.flightTrails.values()) {
    trail.active = false;
  }

  // 2. Append periodic dead-reckoned trail predictions
  stateManager.appendTrailPredictions(now, config, lastPayload.maxDistanceKm);

  // 3. Render all planes from our persistent state map
  const secondaryPlanes = [];
  let activeSelectedTargetObject = null;

  const displaySelectedHex = stateManager.displaySelectedHex;

  for (const [hex, state] of stateManager.planeStates.entries()) {
    const ageSinceLastTrue = now - state.lastTrueTime;

    // Prune selections locally if grace period expired
    if (displaySelectedHex && hex === displaySelectedHex && ageSinceLastTrue > 15000) {
      stateManager.displaySelectedHex = null;
      continue;
    }

    let estPos = state.lastCachedEstPos;
    const isSelected = displaySelectedHex && hex === displaySelectedHex;
    const isStaleForCalc = ageSinceLastTrue >= 10000 && !isSelected;
    const shouldRecalc = !estPos || 
                         !isStaleForCalc || 
                         (!state.lastEstPosCalcTime || now - state.lastEstPosCalcTime > 1000);

    if (shouldRecalc) {
      estPos = estimatePositionFromState(state, now, state.groundSpeedKmh, state.verticalRateFpm);
      state.lastCachedEstPos = estPos;
      state.lastEstPosCalcTime = now;
    }
    if (!estPos) continue;

    const distNm = haversineNm(config.homeLat, config.homeLon, estPos.lat, estPos.lon);
    const distKm = distNm * 1.852;
    const bearing = bearingDeg(config.homeLat, config.homeLon, estPos.lat, estPos.lon);
    const uiAngle = bearingToUiAngleDeg(bearing, config.downBearingDeg, config.bearingToUiScale);

    // Unclamped coordinates for trails (so they extend past the border smoothly)
    const r_unclamped = (distKm / lastPayload.maxDistanceKm) * 132;
    const x_unclamped = r_unclamped * Math.cos(degToRad(uiAngle));
    const y_unclamped = r_unclamped * Math.sin(degToRad(uiAngle));

    // Clamped coordinates for targets/dots on the radar grid
    const r = Math.min(132, r_unclamped);
    const x = r * Math.cos(degToRad(uiAngle));
    const y = r * Math.sin(degToRad(uiAngle));

    // Update coordinates in the state for renderer
    state.x = x;
    state.y = y;

    // Mark trail active
    let trail = stateManager.flightTrails.get(hex);
    if (!trail) {
      trail = { points: [], maxAge: Infinity, active: true };
      stateManager.flightTrails.set(hex, trail);
    }
    trail.active = true;
    trail.maxAge = Infinity;

    // Populate display object if it is the selected flight
    if (isSelected) {
      const elevation = elevationAngleDeg(distNm, estPos.altitudeFt, config.homeElevationFt);
      const altAboveHomeKm = Math.max(0, estPos.altitudeFt - config.homeElevationFt) * 0.0003048;
      const slantRangeKm = Math.sqrt(distKm * distKm + altAboveHomeKm * altAboveHomeKm);

      activeSelectedTargetObject = {
        hex,
        displayName: state.displayName,
        aircraftType: state.aircraftType,
        route: state.route,
        altitudeFt: estPos.altitudeFt,
        verticalRateFpm: state.verticalRateFpm,
        slantRangeKm,
        elevationAngle: elevation,
        elevationDesc: getElevationDescription(elevation),
        groundSpeedKmh: state.groundSpeedKmh,
        bearing,
        uiAngle,
        cardinalDirection: getCardinalDirection(bearing),
        lastTrueTime: state.lastTrueTime,
        x,
        y
      };
    } else {
      // Package secondary target details only if within the radar range limit
      if (distKm <= lastPayload.maxDistanceKm) {
        const targetClass = ageSinceLastTrue < 1200 ? "secondary-target-dot verified" : "secondary-target-dot predicted";
        secondaryPlanes.push({
          x,
          y,
          name: state.displayName,
          class: targetClass
        });
      }
    }
  }

  // 4. Decay and prune trails
  stateManager.decayTrails(now);

  // 5. Render updates
  radarRenderer.renderTrails(stateManager.flightTrails, now);
  radarRenderer.renderSecondaryTargets(secondaryPlanes);
  radarRenderer.renderSelectedTarget(activeSelectedTargetObject, now);
  telemetryPanel.renderDetails(activeSelectedTargetObject, now);
}

// Bootstrap
networkService.start(() => stateManager.currentSelectedHex);
requestAnimationFrame(renderLoop);