export class TelemetryPanel {
  constructor() {
    this.flightDataEl = document.getElementById("flight-data");
    this.noFlightCardEl = document.getElementById("no-flight-card");
    this.flightCallsignEl = document.getElementById("flight-callsign");
    this.aircraftTypeEl = document.getElementById("aircraft-type");
    
    this.routeDisplayEl = document.getElementById("route-display");
    this.routeOriginCodeEl = document.getElementById("route-origin-code");
    this.routeOriginNameEl = document.getElementById("route-origin-name");
    this.routeDestinationCodeEl = document.getElementById("route-destination-code");
    this.routeDestinationNameEl = document.getElementById("route-destination-name");

    this.metricAltitudeEl = document.getElementById("metric-altitude");
    this.verticalTrendIconEl = document.getElementById("vertical-trend-icon");
    this.metricVerticalRateEl = document.getElementById("metric-vertical-rate");
    this.metricDistanceEl = document.getElementById("metric-distance");
    this.metricElevationEl = document.getElementById("metric-elevation");
    this.metricSpeedEl = document.getElementById("metric-speed");
    this.metricBearingEl = document.getElementById("metric-bearing");
    this.metricBearingDirectionEl = document.getElementById("metric-bearing-direction");
    this.signalAgeEl = document.getElementById("signal-age");
    
    this.nearbyListEl = document.getElementById("nearby-list");
  }

  renderDetails(target, now) {
    if (!target) {
      this.flightDataEl.classList.add("hidden");
      this.noFlightCardEl.classList.remove("hidden");
      return;
    }

    this.flightDataEl.classList.remove("hidden");
    this.noFlightCardEl.classList.add("hidden");

    this.flightCallsignEl.textContent = target.displayName;
    this.aircraftTypeEl.textContent = target.aircraftType || "Aircraft type unknown";

    // Route
    if (target.route?.origin && target.route?.destination) {
      this.routeOriginCodeEl.textContent = target.route.origin.code;
      this.routeOriginNameEl.textContent = target.route.origin.name;
      this.routeDestinationCodeEl.textContent = target.route.destination.code;
      this.routeDestinationNameEl.textContent = target.route.destination.name;
      this.routeDisplayEl.classList.remove("hidden");
    } else {
      this.routeDisplayEl.classList.add("hidden");
    }

    // Altitude
    this.metricAltitudeEl.textContent = Math.round(target.altitudeFt).toLocaleString();

    // Climb/Descent trend icon & vertical rate
    if (target.verticalRateFpm > 128) {
      this.verticalTrendIconEl.textContent = "▲";
      this.verticalTrendIconEl.style.color = "#10b981";
      this.metricVerticalRateEl.textContent = `+${Math.round(target.verticalRateFpm)} FPM`;
    } else if (target.verticalRateFpm < -128) {
      this.verticalTrendIconEl.textContent = "▼";
      this.verticalTrendIconEl.style.color = "#3b82f6";
      this.metricVerticalRateEl.textContent = `${Math.round(target.verticalRateFpm)} FPM`;
    } else {
      this.verticalTrendIconEl.textContent = "—";
      this.verticalTrendIconEl.style.color = "rgba(255, 255, 255, 0.4)";
      this.metricVerticalRateEl.textContent = "LEVEL";
    }

    // Proximity
    this.metricDistanceEl.textContent = target.slantRangeKm.toFixed(1);
    this.metricElevationEl.textContent = `${target.elevationDesc} (${Math.round(target.elevationAngle)}° up)`;

    // Speed
    this.metricSpeedEl.textContent = Math.round(target.groundSpeedKmh || 0);

    // Bearing
    this.metricBearingEl.textContent = Math.round(target.bearing);
    this.metricBearingDirectionEl.textContent = target.cardinalDirection;

    // Signal Age
    const selectedAge = (now - target.lastTrueTime) / 1000;
    this.signalAgeEl.textContent = `UPDATED ${selectedAge.toFixed(1)}S AGO`;
  }

  renderNearbyAirspace(nearby) {
    if (!nearby || nearby.length === 0) {
      this.nearbyListEl.innerHTML = `<div class="nearby-empty">No other planes detected</div>`;
      return;
    }

    let html = "";
    for (const plane of nearby) {
      const origin = plane.route?.origin?.code || "";
      const dest = plane.route?.destination?.code || "";
      const routeString = (origin && dest) ? `${origin}➔${dest}` : (plane.aircraftType || "AIRCRAFT");
      
      const distText = plane.distanceKm != null ? `${plane.distanceKm.toFixed(1)} km` : "unknown";
      const altText = plane.altitudeFt != null ? `${Math.round(plane.altitudeFt).toLocaleString()} ft` : "unknown";
      
      html += `
        <div class="nearby-row">
          <span class="nearby-callsign">${plane.displayName}</span>
          <span class="nearby-route font-muted">${routeString}</span>
          <div class="nearby-dist-alt">
            <span class="nearby-dist">${distText}</span>
            <span class="nearby-alt font-muted">${altText}</span>
          </div>
        </div>
      `;
    }
    
    this.nearbyListEl.innerHTML = html;
  }
}
