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
  maxDistanceNm: Number(process.env.MAX_DISTANCE_NM || 30),
  minElevationAngleDeg: Number(process.env.MIN_ELEVATION_ANGLE_DEG || 0),
  maxElevationAngleDeg: Number(process.env.MAX_ELEVATION_ANGLE_DEG || 85),
  downBearingDeg: Number(process.env.DOWN_BEARING_DEG || 120),
  bearingToUiScale: Number(process.env.BEARING_TO_UI_SCALE || 1)
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

const AIRCRAFT_TYPES = {
  E75L: "Embraer E175",
  E75S: "Embraer E175",
  E170: "Embraer E170",
  E190: "Embraer E190",
  B739: "Boeing 737-900",
  B738: "Boeing 737-800",
  B737: "Boeing 737",
  B38M: "Boeing 737 MAX 8",
  B39M: "Boeing 737 MAX 9",
  A319: "Airbus A319",
  A320: "Airbus A320",
  A321: "Airbus A321",
  A20N: "Airbus A320neo",
  A21N: "Airbus A321neo",
  B752: "Boeing 757-200",
  B753: "Boeing 757-300",
  B763: "Boeing 767-300",
  B772: "Boeing 777-200",
  B77W: "Boeing 777-300ER",
  B788: "Boeing 787-8",
  B789: "Boeing 787-9",
  B78X: "Boeing 787-10",
  C172: "Cessna 172",
  C208: "Cessna 208",
  PC12: "Pilatus PC-12",
  GLF4: "Gulfstream IV",
  GLF5: "Gulfstream V",
  GLF6: "Gulfstream G650",
  CL35: "Challenger 350",
  CL60: "Challenger 600"
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

function signedAngularDiffDeg(angle, reference) {
  return ((((angle - reference) % 360) + 540) % 360) - 180;
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

function getAircraftType(a) {
  if (a.desc) return normalizeAircraftDescription(a.desc);
  if (a.typeDescription) return normalizeAircraftDescription(a.typeDescription);

  const typeCode = a.t || a.type || null;
  if (!typeCode) return null;

  return AIRCRAFT_TYPES[typeCode] || typeCode;
}

function normalizeAircraftDescription(desc) {
  if (!desc) return null;

  return String(desc)
    .replace(/\s+/g, " ")
    .replace(/^BOEING\s+/i, "Boeing ")
    .replace(/^AIRBUS\s+/i, "Airbus ")
    .replace(/^EMBRAER\s+/i, "Embraer ")
    .replace(/^BOMBARDIER\s+/i, "Bombardier ")
    .replace(/^CESSNA\s+/i, "Cessna ")
    .trim();
}

function bearingToUiAngleDeg(bearingFromHomeDeg) {
  if (bearingFromHomeDeg == null) return 90;

  const diffFromDown = signedAngularDiffDeg(
    bearingFromHomeDeg,
    HOME.downBearingDeg
  );

  // Screen coordinate convention:
  // 0° = right, 90° = down, 180° = left, 270° = up.
  //
  // If DOWN_BEARING_DEG is 120:
  // bearing 120 -> 90°  -> down
  // bearing 130 -> 100° -> down-left
  // bearing 110 -> 80°  -> down-right
  return normalizeDeg(90 + diffFromDown * HOME.bearingToUiScale);
}

function isUsableAircraft(a) {
  return (
    a.lat != null &&
    a.lon != null &&
    a.distanceNm != null &&
    a.elevationAngleDeg != null &&
    (a.seenSec ?? 999) < 10 &&
    a.distanceNm <= HOME.maxDistanceNm &&
    a.elevationAngleDeg >= HOME.minElevationAngleDeg &&
    a.elevationAngleDeg <= HOME.maxElevationAngleDeg
  );
}

function scoreAircraft(a) {
  if (!isUsableAircraft(a)) return -Infinity;

  const distanceScore = 1 - Math.min(a.distanceNm / HOME.maxDistanceNm, 1);

  const freshnessScore =
    a.seenSec == null
      ? 0.5
      : Math.max(0, Math.min(1, 1 - a.seenSec / 10));

  const altitudeScore =
    typeof a.altitudeFt === "number"
      ? 1 - Math.min(Math.max(a.altitudeFt - 1000, 0) / 35000, 1)
      : 0.3;

  // No window visibility logic here. Just prefer nearby, fresh, visually plausible aircraft.
  return 0.5 * distanceScore + 0.35 * freshnessScore + 0.15 * altitudeScore;
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
    aircraftType: getAircraftType(a),
    lat,
    lon,
    altitudeFt,
    groundSpeedKt: a.gs ?? null,
    groundSpeedKmh: knotsToKmh(a.gs),
    trackDeg: a.track ?? null,
    verticalRateFpm: a.baro_rate ?? a.geom_rate ?? null,
    seenSec: a.seen ?? null,
    distanceNm,
    bearingFromHomeDeg,
    elevationAngleDeg: elev,
    uiAngleDeg: bearingToUiAngleDeg(bearingFromHomeDeg)
  };

  enriched.isUsable = isUsableAircraft(enriched);
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
      aircraft.find((a) => a.isUsable) ||
      aircraft.find((a) => (a.seenSec ?? 999) < 10) ||
      null;

    res.json({
      now: data.now,
      total: data.aircraft?.length ?? 0,
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
