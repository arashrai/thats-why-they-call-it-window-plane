const statusEl = document.getElementById("status");
const aircraftEl = document.getElementById("aircraft");

function formatHeading(deg) {
  if (deg == null) return "heading unknown";
  return `heading ${Math.round(deg)}°`;
}

function formatAltitude(alt) {
  if (alt == null) return "altitude unknown";
  if (typeof alt === "string") return alt;
  return `${Math.round(alt).toLocaleString()} ft`;
}

function formatSpeed(speed) {
  if (speed == null) return "speed unknown";
  return `${Math.round(speed)} kt`;
}

async function refresh() {
  try {
    const res = await fetch("/api/aircraft");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.details || data.error || "Unknown error");
    }

    const useful = data.aircraft
      .filter((a) => a.seenSec == null || a.seenSec < 10)
      .slice(0, 3);

    statusEl.textContent = `${data.total} aircraft received · showing ${useful.length}`;

    if (useful.length === 0) {
      aircraftEl.innerHTML = `
        <div class="aircraft-card">
          <div class="flight">No aircraft</div>
          <div class="details">Waiting for ADS-B messages...</div>
        </div>
      `;
      return;
    }

    aircraftEl.innerHTML = useful
      .map((a) => {
        const name = a.flight || a.hex || "UNKNOWN";
        return `
          <div class="aircraft-card">
            <div class="flight">✈ ${name}</div>
            <div class="details">
              ${formatAltitude(a.altitudeFt)} · ${formatSpeed(a.groundSpeedKt)} · ${formatHeading(a.trackDeg)}
            </div>
            <div class="small">
              seen ${a.seenSec?.toFixed?.(1) ?? "?"}s ago · RSSI ${a.rssi ?? "?"}
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    statusEl.textContent = "Error reading aircraft";
    aircraftEl.innerHTML = `
      <div class="aircraft-card">
        <div class="flight">Debug</div>
        <div class="details">${String(err.message || err)}</div>
      </div>
    `;
  }
}

refresh();
setInterval(refresh, 1000);