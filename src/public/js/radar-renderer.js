import { bearingToUiAngleDeg } from "./math.js";

export class RadarRenderer {
  constructor() {
    this.compassGroupEl = document.getElementById("compass-group");
    this.targetGroupEl = document.getElementById("target-group");
    this.radarTrailsEl = document.getElementById("radar-trails");
    this.secondaryTargetsEl = document.getElementById("secondary-targets");
    this.radarArrowOrbitEl = document.getElementById("radar-arrow-orbit");
    this.arrowBearingLabelEl = document.getElementById("arrow-bearing-label");
    this.scanningOverlayEl = document.getElementById("scanning-overlay");
  }

  setCompassRotation(config) {
    if (!config) return;
    
    // Reset compass group rotation since we now position individual text nodes
    this.compassGroupEl.style.transform = "none";
    
    // Position each cardinal direction text element individually using bearingToUiAngleDeg
    const bearings = {
      north: 0,
      east: 90,
      south: 180,
      west: 270
    };
    
    const r = 143; // radius for compass labels
    
    for (const [key, b] of Object.entries(bearings)) {
      const angleDeg = bearingToUiAngleDeg(b, config.downBearingDeg, config.bearingToUiScale, config.projectorTiltDeg);
      const angleRad = (angleDeg * Math.PI) / 180;
      
      const x = r * Math.cos(angleRad);
      const y = r * Math.sin(angleRad);
      
      const el = this.compassGroupEl.querySelector(`.${key}`);
      if (el) {
        el.setAttribute("x", x.toFixed(1));
        el.setAttribute("y", y.toFixed(1));
      }
    }
  }

  renderTrails(flightTrails, now) {
    let trailsHtml = "";
    const TRAIL_MAX_AGE_MS = 60000;

    for (const [hex, trail] of flightTrails.entries()) {
      const maxAge = trail.maxAge;
      if (trail.points.length > 0) {
        for (const p of trail.points) {
          const ageMs = now - p.t;
          let ageFactor;
          if (maxAge === Infinity) {
            ageFactor = Math.max(0, 1 - ageMs / TRAIL_MAX_AGE_MS) * 0.85;
          } else {
            ageFactor = Math.max(0, 1 - ageMs / maxAge);
          }

          if (ageFactor > 0.01) {
            if (p.isVerified) {
              trailsHtml += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.8" class="trail-dot-verified" opacity="${ageFactor.toFixed(2)}" />`;
            } else {
              trailsHtml += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="1.2" class="trail-dot-predicted" opacity="${ageFactor.toFixed(2)}" />`;
            }
          }
        }
      }
    }
    this.radarTrailsEl.innerHTML = trailsHtml;
  }

  renderSecondaryTargets(planesList) {
    let secondaryHtml = "";
    for (const p of planesList) {
      secondaryHtml += `
        <g>
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" class="${p.class}" />
          <text x="${p.x.toFixed(1)}" y="${(p.y + 13).toFixed(1)}" class="secondary-target-label">${p.name}</text>
        </g>
      `;
    }
    this.secondaryTargetsEl.innerHTML = secondaryHtml;
  }

  renderSelectedTarget(target, now) {
    if (!target) {
      this.targetGroupEl.classList.add("hidden");
      this.radarArrowOrbitEl.classList.add("hidden");
      this.scanningOverlayEl.classList.remove("hidden");
      return;
    }

    const isVerifiedRecent = (now - target.lastTrueTime) < 1200;

    if (isVerifiedRecent) {
      this.targetGroupEl.classList.add("verified");
      this.targetGroupEl.classList.remove("predicted");
      this.radarArrowOrbitEl.classList.add("verified");
      this.radarArrowOrbitEl.classList.remove("predicted");
    } else {
      this.targetGroupEl.classList.add("predicted");
      this.targetGroupEl.classList.remove("verified");
      this.radarArrowOrbitEl.classList.add("predicted");
      this.radarArrowOrbitEl.classList.remove("verified");
    }

    this.targetGroupEl.classList.remove("hidden");
    this.radarArrowOrbitEl.classList.remove("hidden");
    this.scanningOverlayEl.classList.remove("hidden");

    this.targetGroupEl.setAttribute("transform", `translate(${target.x.toFixed(1)}, ${target.y.toFixed(1)})`);

    this.radarArrowOrbitEl.style.setProperty("--arrow-angle", `${target.uiAngle.toFixed(1)}deg`);
    this.arrowBearingLabelEl.textContent = `${Math.round(target.bearing).toString().padStart(3, "0")}°`;
  }
}
