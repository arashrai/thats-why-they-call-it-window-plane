import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;
const aircraftJsonPath =
  process.env.AIRCRAFT_JSON_PATH || "/run/readsb/aircraft.json";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/aircraft", async (_req, res) => {
  try {
    const raw = await fs.readFile(aircraftJsonPath, "utf8");
    const data = JSON.parse(raw);

    const aircraft = (data.aircraft || [])
      .filter((a) => a.flight || a.lat || a.lon || a.alt_baro)
      .map((a) => ({
        hex: a.hex,
        flight: a.flight?.trim() || null,
        lat: a.lat ?? null,
        lon: a.lon ?? null,
        altitudeFt: a.alt_baro ?? null,
        groundSpeedKt: a.gs ?? null,
        trackDeg: a.track ?? null,
        verticalRateFpm: a.baro_rate ?? a.geom_rate ?? null,
        seenSec: a.seen ?? null,
        rssi: a.rssi ?? null
      }))
      .sort((a, b) => (a.seenSec ?? 999) - (b.seenSec ?? 999));

    res.json({
      now: data.now,
      total: data.aircraft?.length ?? 0,
      aircraft
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to read aircraft data",
      path: aircraftJsonPath,
      details: String(err)
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Window Plane running at http://0.0.0.0:${port}`);
  console.log(`Reading aircraft from ${aircraftJsonPath}`);
});