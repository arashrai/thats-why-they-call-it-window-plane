const planeCountEl = document.getElementById("plane-count");
const hudOrbitEl = document.getElementById("hud-orbit");
const lookArrowEl = document.getElementById("look-arrow");
const planeInfoEl = document.getElementById("plane-info");
const flightEl = document.getElementById("flight");
const aircraftTypeEl = document.getElementById("aircraft-type");
const metricsPrimaryEl = document.getElementById("metrics-primary");
const metricsSecondaryEl = document.getElementById("metrics-secondary");
const updatedEl = document.getElementById("updated");
const debugCornerEl = document.getElementById("debug-corner");
const statusEl = document.getElementById("status");

let selectedPlane = null;
let arrowVisible = false;

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

function setArrowVisible(visible) {
  arrowVisible = visible;
  lookArrowEl.classList.toggle("is-hidden", !visible);
}

function positionLookArrow(uiAngleDeg) {
  if (!arrowVisible || uiAngleDeg == null) return;

  const orbitRect = hudOrbitEl.getBoundingClientRect();
  const infoRect = planeInfoEl.getBoundingClientRect();

  const pad = Math.min(window.innerWidth, window.innerHeight) * 0.07;
  const radiusX = infoRect.width / 2 + pad;
  const radiusY = infoRect.height / 2 + pad;

  const angleRad = (uiAngleDeg * Math.PI) / 180;
  const cx = orbitRect.width / 2;
  const cy = orbitRect.height / 2;
  const x = cx + Math.cos(angleRad) * radiusX;
  const y = cy + Math.sin(angleRad) * radiusY;

  lookArrowEl.style.left = `${x}px`;
  lookArrowEl.style.top = `${y}px`;
  lookArrowEl.style.transform = `translate(-50%, -50%) rotate(${uiAngleDeg}deg)`;
}

function renderEmpty(message, total) {
  selectedPlane = null;
  setArrowVisible(false);

  planeCountEl.textContent = total != null ? `${total} planes` : "";
  flightEl.textContent = message;
  aircraftTypeEl.textContent = "";
  metricsPrimaryEl.textContent = "";
  metricsSecondaryEl.textContent = "";
  updatedEl.textContent = "";
  debugCornerEl.textContent = "";
}

function renderPlane(plane, total) {
  selectedPlane = plane;

  planeCountEl.textContent = `${total} planes`;
  flightEl.textContent = plane.displayName;
  aircraftTypeEl.textContent = plane.aircraftType || "aircraft type unknown";
  metricsPrimaryEl.textContent = `${formatDistance(plane.distanceNm)} · ${formatAltitude(plane.altitudeFt)}`;
  metricsSecondaryEl.textContent = `${formatSpeedKmh(plane.groundSpeedKmh)} · ${formatVerticalRate(plane.verticalRateFpm)}`;
  updatedEl.textContent = formatUpdated(plane.seenSec);
  debugCornerEl.textContent = `${formatBearing(plane.bearingFromHomeDeg)} · ${formatElevation(plane.elevationAngleDeg)}`;

  if (plane.uiAngleDeg != null) {
    setArrowVisible(true);
    positionLookArrow(plane.uiAngleDeg);
  } else {
    setArrowVisible(false);
  }
}

function renderError(message) {
  statusEl.hidden = false;
  statusEl.textContent = message;
  renderEmpty("Error", null);
  aircraftTypeEl.textContent = message;
}

async function refresh() {
  try {
    const res = await fetch("/api/aircraft");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.details || data.error || "Unknown error");
    }

    statusEl.hidden = true;
    statusEl.textContent = "";

    if (!data.selected) {
      renderEmpty("No aircraft", data.total ?? 0);
      metricsSecondaryEl.textContent = "Waiting for ADS-B messages…";
      return;
    }

    renderPlane(data.selected, data.total ?? 0);
  } catch (err) {
    renderError(String(err.message || err));
  }
}

function onLayoutChange() {
  if (selectedPlane?.uiAngleDeg != null) {
    positionLookArrow(selectedPlane.uiAngleDeg);
  }
}

const resizeObserver = new ResizeObserver(onLayoutChange);
resizeObserver.observe(planeInfoEl);
resizeObserver.observe(hudOrbitEl);
window.addEventListener("resize", onLayoutChange);

refresh();
setInterval(refresh, 500);
