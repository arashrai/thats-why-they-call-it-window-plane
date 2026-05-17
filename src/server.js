import "dotenv/config";
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const port = process.env.PORT || 3000;
const aircraftJsonPath =
  process.env.AIRCRAFT_JSON_PATH || "/run/readsb/aircraft.json";

const HOME = {
  lat: Number(process.env.HOME_LAT),
  lon: Number(process.env.HOME_LON),
  elevationFt: Number(process.env.HOME_ELEVATION_FT || 350),
  windowCenterAzimuthDeg: Number(process.env.WINDOW_CENTER_AZIMUTH_DEG || 45),
  windowHalfWidthDeg: Number(process.env.WINDOW_HALF_WIDTH_DEG || 55),
  maxDistanceNm: Number(process.env.MAX_DISTANCE_NM || 25),
  minElevationAngleDeg: Number(process.env.MIN_ELEVATION_ANGLE_DEG || 1),
  maxElevationAngleDeg: Number(process.env.MAX_ELEVATION_ANGLE_DEG || 75)
};

const AIRLINES = {
  AAL: "American",
  ASA: "Alaska",
  DAL: "Delta",
  UAL: "United",
  SWA: "Southwest",
  QXE: "Horizon",
  SKW: "SkyWest",
  FFT: "Frontier",
  JBU: "JetBlue",
  NKS: "Spirit",
  UPS: "UPS",
  FDX: "FedEx",
  WJA: "WestJet",
  ACA: "Air Canada",
  BAW: "British Airways",
  DLH: "Lufthansa",
  AFR: "Air France",
  KLM: "KLM",
  VIR: "Virgin Atlantic",
  EVA: "EVA Air",
  JAL: "Japan Airlines",
  ANA: "ANA",
  UAE: "Emirates",
  QTR: "Qatar",
  CMP: "Copa",
  AMX: "Aeromexico",
  HAL: "Hawaiian"
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

function angularDiffDeg(a, b) {
  const diff = Math.abs(normalizeDeg(a) - normalizeDeg(b));
  return Math.min(diff, 360 - diff);
}

function haversineNm(lat1, lon1, lat2, lon2) {
  const earthRadiusNm = 3440.065;
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degToRad(lat1)) *
      Math.cos(degToRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusNm * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const phi1 = degToRad(lat1);
  const phi2 = degToRad(lat2);
  const lambda1 = degToRad(lon1);
  const lambda2 = degToRad(lon2);

  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);

  return normalizeDeg(radToDeg(Math.atan2(y, x)));
}

function elevationAngleDeg(distanceNm, altitudeFt, homeElevationFt) {
  if (distanceNm == null || altitudeFt == null) return null;

  const groundDistanceFt = distanceNm * 6076.12;
  const altitudeAboveHomeFt = altitudeFt - homeElevationFt;

  return radToDeg(Math.atan2(altitudeAboveHomeFt, groundDistanceFt));
}

function knotsToKmh(knots) {
  if (knots == null || Number.isNaN(Number(knots))) return null;
  return Number(knots) * 1.852;
}

function formatFlightName(callsign) {
  if (!callsign) return null;

  const clean = callsign.trim().replace(/\s+/g, "");
  const match = clean.match(/^([A-Z]{3})(\d+[A-Z]?)$/);

  if (!match) return clean;

  const [, prefix, number] = match;
  const airline = AIRLINES[prefix];

  if (!airline) return clean;

  return `${airline} ${number}`;
}

function isWithinWindow(aircraft) {
  if (
    aircraft.bearingFromHomeDeg == null ||
    aircraft.elevationAngleDeg == null ||
    aircraft.distanceNm == null
  ) {
    return false;
  }

  const azimuthDiff = angularDiffDeg(
    aircraft.bearingFromHomeDeg,
    HOME.windowCenterAzimuthDeg
  );

  return (
    azimuthDiff <= HOME.windowHalfWidthDeg &&
    aircraft.distanceNm <= HOME.maxDistanceNm &&
    aircraft.elevationAngleDeg >= HOME.minElevationAngleDeg &&
    aircraft.elevationAngleDeg <= HOME.maxElevationAngleDeg
  );
}

function scoreAircraft(aircraft) {
  if (!aircraft.isWithinWindow) return -Infinity;

  const azimuthDiff = angularDiffDeg(
    aircraft.bearingFromHomeDeg,
    HOME.windowCenterAzimuthDeg
  );

  const azimuthScore = 1 - azimuthDiff / HOME.windowHalfWidthDeg;
  const distanceScore = 1 - Math.min(aircraft.distanceNm / HOME.maxDistanceNm, 1);

  // readsb RSSI is negative; closer to 0 is stronger.
  const rssi = typeof aircraft.rssi === "number" ? aircraft.rssi : -50;
  const rssiScore = Math.max(0, Math.min(1, (rssi + 50) / 50));

  const freshnessScore =
    aircraft.seenSec == null
      ? 0.5
      : Math.max(0, Math.min(1, 1 - aircraft.seenSec / 10));

  const altitudeScore =
    typeof aircraft.altitudeFt === "number"
      ? 1 - Math.min(Math.max(aircraft.altitudeFt - 1000, 0) / 35000, 1)
      : 0.3;

  return (
    0.35 * azimuthScore +
    0.25 * distanceScore +
    0.2 * rssiScore +
    0.15 * freshnessScore +
    0.05 * altitudeScore
  );
}

function enrichAircraft(a) {
  const lat = a.lat ?? null;
  const lon = a.lon ?? null;

  const altitudeFt =
    typeof a.alt_baro === "number"
      ? a.alt_baro
      : typeof a.alt_geom === "number"
        ? a.alt_geom
        : null;

  const hasHome =
    Number.isFinite(HOME.lat) &&
    Number.isFinite(HOME.lon) &&
    lat != null &&
    lon != null;

  const distanceNm = hasHome
    ? haversineNm(HOME.lat, HOME.lon, lat, lon)
    : null;

  const bearingFromHomeDeg = hasHome
    ? bearingDeg(HOME.lat, HOME.lon, lat, lon)
    : null;

  const elev = elevationAngleDeg(distanceNm, altitudeFt, HOME.elevationFt);

  const enriched = {
    hex: a.hex,
    callsign: a.flight?.trim() || null,
    displayName: formatFlightName(a.flight) || a.hex || "UNKNOWN",
    lat,
    lon,
    altitudeFt,
    groundSpeedKt: a.gs ?? null,
    groundSpeedKmh: knotsToKmh(a.gs),
    trackDeg: a.track ?? null,
    verticalRateFpm: a.baro_rate ?? a.geom_rate ?? null,
    seenSec: a.seen ?? null,
    rssi: a.rssi ?? null,
    distanceNm,
    bearingFromHomeDeg,
    elevationAngleDeg: elev
  };

  enriched.isWithinWindow = isWithinWindow(enriched);
  enriched.visibilityScore = scoreAircraft(enriched);

  return enriched;
}

app.get("/api/aircraft", async (_req, res) => {
  try {
    const raw = await fs.readFile(aircraftJsonPath, "utf8");
    const data = JSON.parse(raw);

    const aircraft = (data.aircraft || [])
      .filter((a) => a.flight || a.lat || a.lon || a.alt_baro || a.alt_geom)
      .map(enrichAircraft)
      .sort((a, b) => b.visibilityScore - a.visibilityScore);

    const selected =
      aircraft.find((a) => a.isWithinWindow && (a.seenSec ?? 999) < 10) ||
      aircraft.find((a) => (a.seenSec ?? 999) < 10) ||
      null;

    res.json({
      now: data.now,
      total: data.aircraft?.length ?? 0,
      home: {
        windowCenterAzimuthDeg: HOME.windowCenterAzimuthDeg,
        windowHalfWidthDeg: HOME.windowHalfWidthDeg,
        maxDistanceNm: HOME.maxDistanceNm
      },
      selected,
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
