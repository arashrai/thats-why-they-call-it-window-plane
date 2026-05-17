const statusEl = document.getElementById("status");
const aircraftEl = document.getElementById("aircraft");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatAltitude(alt) {
  if (alt == null) return "altitude unknown";
  if (typeof alt === "string") return alt;
  return `${Math.round(alt).toLocaleString()} ft`;
}

function formatSpeedKmh(speed) {
  if (speed == null) return "speed unknown";
  return `${Math.round(speed).toLocaleString()} km/h`;
}

function formatDistance(distanceNm) {
  if (distanceNm == null) return "distance unknown";
  const km = distanceNm * 1.852;
  return `${km.toFixed(1)} km away`;
}

function formatBearing(deg) {
  if (deg == null) return "bearing unknown";
  return `bearing ${Math.round(deg)}°`;
}

function formatElevation(deg) {
  if (deg == null) return "elevation unknown";
  return `${Math.round(deg)}° up`;
}

function formatVerticalRate(fpm) {
  if (fpm == null) return "";
  if (Math.abs(fpm) < 128) return "level";
  return fpm > 0 ? "climbing" : "descending";
}

function angularDiffSignedDeg(angle, center) {
  return ((((angle - center) % 360) + 540) % 360) - 180;
}

function getPlaneScreenPosition(plane, home) {
  if (
    plane.bearingFromHomeDeg == null ||
    plane.elevationAngleDeg == null ||
    home.windowCenterAzimuthDeg == null ||
    home.windowHalfWidthDeg == null
  ) {
    return { x: 50, y: 45 };
  }

  const xDiff = angularDiffSignedDeg(
    plane.bearingFromHomeDeg,
    home.windowCenterAzimuthDeg
  );

  const xPct = 50 + (xDiff / home.windowHalfWidthDeg) * 42;

  const minElev = 1;
  const maxElev = 75;
  const elevNorm = clamp(
    (plane.elevationAngleDeg - minElev) / (maxElev - minElev),
    0,
    1
  );

  const yPct = 78 - elevNorm * 58;

  return {
    x: clamp(xPct, 8, 92),
    y: clamp(yPct, 14, 82)
  };
}

function getArrowRotation(plane, home) {
  if (plane.bearingFromHomeDeg == null || home.windowCenterAzimuthDeg == null) {
    return 0;
  }

  const xDiff = angularDiffSignedDeg(
    plane.bearingFromHomeDeg,
    home.windowCenterAzimuthDeg
  );

  return clamp(xDiff, -65, 65);
}

async function refresh() {
  try {
    const res = await fetch("/api/aircraft");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.details || data.error || "Unknown error");
    }

    const plane = data.selected;
    statusEl.textContent = `${data.total} aircraft received`;

    if (!plane) {
      aircraftEl.innerHTML = `
        <div class="empty-state">
          <div class="eyebrow">WINDOW PLANE</div>
          <div class="main-title">No aircraft</div>
          <div class="subtle">Waiting for ADS-B messages...</div>
        </div>
      `;
      return;
    }

    const pos = getPlaneScreenPosition(plane, data.home);
    const arrowRotation = getArrowRotation(plane, data.home);
    const movement = formatVerticalRate(plane.verticalRateFpm);
    const windowLabel = plane.isWithinWindow ? "best visible aircraft" : "nearest recent aircraft";

    aircraftEl.innerHTML = `
      <div class="sky-hud">
        <div
          class="look-target"
          style="left: ${pos.x}%; top: ${pos.y}%;"
        >
          <div
            class="arrow"
            style="transform: translate(-50%, -50%) rotate(${arrowRotation}deg);"
          >
            ↑
          </div>
          <div class="target-dot"></div>
        </div>

        <div class="plane-card">
          <div class="eyebrow">${windowLabel}</div>
          <div class="main-title">✈ ${plane.displayName}</div>

          <div class="details">
            ${formatAltitude(plane.altitudeFt)} · ${formatSpeedKmh(plane.groundSpeedKmh)}
          </div>

          <div class="details">
            ${formatDistance(plane.distanceNm)} · ${formatBearing(plane.bearingFromHomeDeg)} · ${formatElevation(plane.elevationAngleDeg)}
          </div>

          <div class="subtle">
            ${movement}${movement ? " · " : ""}
            score ${plane.visibilityScore?.toFixed?.(2) ?? "?"} ·
            seen ${plane.seenSec?.toFixed?.(1) ?? "?"}s ago ·
            RSSI ${plane.rssi ?? "?"}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    statusEl.textContent = "Error reading aircraft";
    aircraftEl.innerHTML = `
      <div class="empty-state">
        <div class="eyebrow">Debug</div>
        <div class="main-title">Error</div>
        <div class="details">${String(err.message || err)}</div>
      </div>
    `;
  }
}

refresh();
setInterval(refresh, 1000);