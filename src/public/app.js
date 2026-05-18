const statusEl = document.getElementById("status");
const aircraftEl = document.getElementById("aircraft");

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

function formatUpdated(seenSec) {
  if (seenSec == null) return "updated unknown";
  return `updated ${seenSec.toFixed(1)}s ago`;
}

function formatVerticalRate(fpm) {
  if (fpm == null) return "vertical rate unknown";
  if (Math.abs(fpm) < 128) return "level";
  return fpm > 0 ? "climbing" : "descending";
}

function arrowPosition(uiAngleDeg) {
  // CSS/screen convention:
  // 0deg = right, 90deg = down, 180deg = left, 270deg = up.
  const angleRad = (uiAngleDeg * Math.PI) / 180;

  // Radius as viewport-relative percentage around centered text.
  // Keep this moderate so the arrow does not steal text space.
  const radiusX = 24;
  const radiusY = 24;

  return {
    left: 50 + Math.cos(angleRad) * radiusX,
    top: 50 + Math.sin(angleRad) * radiusY
  };
}

function arrowRotation(uiAngleDeg) {
  // SVG arrow points right by default, so rotate directly by uiAngleDeg.
  return uiAngleDeg;
}

function planeHtml(plane, total) {
  const uiAngle = plane.uiAngleDeg ?? 90;
  const pos = arrowPosition(uiAngle);
  const rotation = arrowRotation(uiAngle);

  return `
    <div class="plane-count">${total} planes</div>

    <div class="hud-orbit">
      <div
        class="look-arrow"
        style="
          left: ${pos.left}%;
          top: ${pos.top}%;
          transform: translate(-50%, -50%) rotate(${rotation}deg);
        "
        aria-hidden="true"
      >
        <svg viewBox="0 0 120 60" role="img">
          <path
            d="M8 30 H92"
            class="arrow-line"
          />
          <path
            d="M72 10 L102 30 L72 50"
            class="arrow-head"
          />
        </svg>
      </div>

      <section class="plane-info">
        <div class="flight">${plane.displayName}</div>
        <div class="aircraft-type">${plane.aircraftType || "aircraft type unknown"}</div>

        <div class="metrics primary-metrics">
          ${formatDistance(plane.distanceNm)} · ${formatAltitude(plane.altitudeFt)}
        </div>

        <div class="metrics">
          ${formatSpeedKmh(plane.groundSpeedKmh)} · ${formatVerticalRate(plane.verticalRateFpm)}
        </div>

        <div class="updated">
          ${formatUpdated(plane.seenSec)}
        </div>

        <div class="debug-line">
          ${formatBearing(plane.bearingFromHomeDeg)} · ${formatElevation(plane.elevationAngleDeg)}
        </div>
      </section>
    </div>
  `;
}

async function refresh() {
  try {
    const res = await fetch("/api/aircraft");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.details || data.error || "Unknown error");
    }

    statusEl.textContent = "";

    if (!data.selected) {
      aircraftEl.innerHTML = `
        <div class="plane-count">${data.total ?? 0} planes</div>
        <section class="plane-info empty">
          <div class="flight">No aircraft</div>
          <div class="metrics">Waiting for ADS-B messages...</div>
        </section>
      `;
      return;
    }

    aircraftEl.innerHTML = planeHtml(data.selected, data.total ?? 0);
  } catch (err) {
    statusEl.textContent = "";
    aircraftEl.innerHTML = `
      <section class="plane-info empty">
        <div class="flight">Error</div>
        <div class="metrics">${String(err.message || err)}</div>
      </section>
    `;
  }
}

refresh();
setInterval(refresh, 500);
