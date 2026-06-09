import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./services/config.js";
import { initScheduleLoop } from "./services/schedule.js";
import { selectActiveAircraft } from "./services/selection.js";
import { readAndParseAircraftFeed } from "./services/telemetry.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Disable caching for all routes, including static files, to ensure real-time telemetry updates and prevent stale CSS/JS cache on the kiosk
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/aircraft", async (req, res) => {
  try {
    const { now, total, aircraft } = await readAndParseAircraftFeed();

    const clientSelectedHex = req.query.selected || null;
    const selected = selectActiveAircraft(aircraft, clientSelectedHex);

    const nearby = aircraft
      .filter((a) => a.hex !== (selected ? selected.hex : null))
      .slice(0, 5);

    res.json({
      now,
      total,
      maxDistanceKm: config.home.maxDistanceKm,
      selected,
      nearby,
      aircraft,
      config: {
        homeLat: config.home.lat,
        homeLon: config.home.lon,
        homeElevationFt: config.home.elevationFt,
        downBearingDeg: config.home.downBearingDeg,
        bearingToUiScale: config.home.bearingToUiScale,
        projectorTiltDeg: config.home.projectorTiltDeg
      }
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to read aircraft data",
      path: config.aircraftJsonPath,
      details: String(err)
    });
  }
});

// Initialize SEA manifest schedule background fetch
initScheduleLoop();

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Window Plane running at http://0.0.0.0:${config.port}`);
  console.log(`Reading aircraft from ${config.aircraftJsonPath}`);
});
