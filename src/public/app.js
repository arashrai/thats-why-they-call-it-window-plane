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

function formatDistance(distanceKm) {
  if (distanceKm == null) return "distance unknown";
  return `${distanceKm.toFixed(1)} km away`;
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

function ensureHud() {
  if (document.getElementById("hud-root")) return;

  aircraftEl.innerHTML = `
    <div id="hud-root" class="hud-root">
      <div id="calibration-readout" class="calibration-readout"></div>
      <div id="plane-count" class="plane-count"></div>

      <div id="arrow-orbit" class="arrow-orbit hidden" aria-hidden="true">
        <div class="look-arrow">
          <svg viewBox="0 0 120 60" role="img">
            <path d="M8 30 H92" class="arrow-line"></path>
            <path d="M72 10 L102 30 L72 50" class="arrow-head"></path>
          </svg>
        </div>
      </div>

      <section id="plane-info" class="plane-info">
        <div id="flight" class="flight"></div>
        <div id="aircraft-type" class="aircraft-type"></div>
        <div id="primary-metrics" class="metrics primary-metrics"></div>
        <div id="secondary-metrics" class="metrics"></div>
        <div id="updated" class="updated"></div>
      </section>
    </div>
  `;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function setArrowVisible(visible) {
  const orbit = document.getElementById("arrow-orbit");
  if (!orbit) return;
  orbit.classList.toggle("hidden", !visible);
}

function setArrowAngle(uiAngleDeg) {
  const orbit = document.getElementById("arrow-orbit");
  if (!orbit) return;
  orbit.style.setProperty("--arrow-angle", `${uiAngleDeg ?? 90}deg`);
}

function showNoAircraft(total, maxDistanceKm) {
  ensureHud();

  setText("plane-count", `${total ?? 0} planes`);
  setText("calibration-readout", "");
  setText("flight", "No aircraft");
  setText("aircraft-type", "");
  setText("primary-metrics", `Nothing within ${maxDistanceKm ?? 10} km`);
  setText("secondary-metrics", "");
  setText("updated", "");

  setArrowVisible(false);
}

function showError(message) {
  ensureHud();

  setText("plane-count", "");
  setText("calibration-readout", "");
  setText("flight", "Error");
  setText("aircraft-type", "");
  setText("primary-metrics", message);
  setText("secondary-metrics", "");
  setText("updated", "");

  setArrowVisible(false);
}

function showPlane(plane, total) {
  ensureHud();

  setText("plane-count", `${total ?? 0} planes`);

  setText(
    "calibration-readout",
    `${formatBearing(plane.bearingFromHomeDeg)} · ${formatElevation(
      plane.elevationAngleDeg
    )}`
  );

  setText("flight", plane.displayName || "UNKNOWN");
  setText("aircraft-type", plane.aircraftType || "aircraft type unknown");

  setText(
    "primary-metrics",
    `${formatDistance(plane.distanceKm)} · ${formatAltitude(plane.altitudeFt)}`
  );

  setText(
    "secondary-metrics",
    `${formatSpeedKmh(plane.groundSpeedKmh)} · ${formatVerticalRate(
      plane.verticalRateFpm
    )}`
  );

  setText("updated", formatUpdated(plane.seenSec));

  setArrowAngle(plane.uiAngleDeg);
  setArrowVisible(true);
}

async function refresh() {
  try {
    ensureHud();

    const res = await fetch(`/api/aircraft?t=${Date.now()}`, {
      cache: "no-store"
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.details || data.error || "Unknown error");
    }

    statusEl.textContent = "";

    if (!data.selected) {
      showNoAircraft(data.total, data.maxDistanceKm);
      return;
    }

    showPlane(data.selected, data.total);
  } catch (err) {
    statusEl.textContent = "";
    showError(String(err.message || err));
  }
}

ensureHud();
refresh();
setInterval(refresh, 500);
