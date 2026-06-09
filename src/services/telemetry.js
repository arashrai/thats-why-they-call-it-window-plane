import fs from "fs/promises";
import { config } from "./config.js";
import { getRouteForCallsign } from "./schedule.js";
import { isSelectableAircraft } from "./selection.js";

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

// Math Utilities
function degToRad(deg) { return (deg * Math.PI) / 180; }
function radToDeg(rad) { return (rad * 180) / Math.PI; }
function normalizeDeg(deg) { return ((deg % 360) + 360) % 360; }
function signedAngularDiffDeg(angle, reference) {
  return ((((angle - reference) % 360) + 540) % 360) - 180;
}

export function haversineNm(lat1, lon1, lat2, lon2) {
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

export function bearingDeg(lat1, lon1, lat2, lon2) {
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

export function elevationAngleDeg(distanceNm, altitudeFt, homeElevationFt) {
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

function getAircraftType(a) {
  if (a.desc) return normalizeAircraftDescription(a.desc);
  if (a.typeDescription) return normalizeAircraftDescription(a.typeDescription);
  const typeCode = a.t || a.type || null;
  if (!typeCode) return null;
  return AIRCRAFT_TYPES[typeCode] || typeCode;
}

const loggedInvalidCallsigns = new Set();

function validateAndLogAircraft(a) {
  if (!a.hex) return false;
  const hasCoords = typeof a.lat === "number" && typeof a.lon === "number";
  const alt = a.alt_baro ?? a.alt_geom;
  const hasAlt = alt != null && typeof alt === "number";
  const hasGs = a.gs != null && typeof a.gs === "number";
  const isStationary = hasGs && a.gs < 10 && (alt != null && alt < 1000);
  const isValid = hasCoords && hasAlt && !isStationary;

  if (!isValid) {
    const callsign = a.flight?.trim().toUpperCase().replace(/\s+/g, "") || null;
    if (callsign && !loggedInvalidCallsigns.has(callsign)) {
      loggedInvalidCallsigns.add(callsign);
      const reasons = [];
      if (!hasCoords) reasons.push("missing coordinates");
      if (!hasAlt) reasons.push("missing altitude");
      if (isStationary) reasons.push(`stationary ground target (speed: ${a.gs} kt, alt: ${alt} ft)`);
      console.log(`[Validation] Aircraft ${callsign} failed validation: ${reasons.join(", ")}`);
    }
  }
  return isValid;
}

function bearingToUiAngleDeg(bearingFromHomeDeg) {
  if (bearingFromHomeDeg == null) return 90;
  
  const Bd = config.home.downBearingDeg ?? 120;
  const B = bearingFromHomeDeg;
  
  const ceilingHeight = config.home.ceilingHeightFt ?? 8.0;
  const radarRadius = config.home.radarRadiusFt ?? 2.0;
  const tilt = degToRad(config.home.projectorTiltDeg ?? 0);
  
  const K_scale = ceilingHeight / radarRadius;
  const K_tilt = K_scale * Math.tan(tilt);
  
  const diffRad = degToRad(B - Bd);
  const arg = K_tilt * Math.sin(diffRad);
  const clampedArg = Math.max(-1.0, Math.min(1.0, arg));
  
  const acosValDeg = radToDeg(Math.acos(clampedArg));
  
  const angle = Bd - B + acosValDeg;
  return normalizeDeg(angle);
}

function enrichAircraft(a) {
  const lat = a.lat ?? null;
  const lon = a.lon ?? null;
  const altitudeFt = typeof a.alt_geom === "number" ? a.alt_geom : typeof a.alt_baro === "number" ? a.alt_baro : null;
  const hasHome = Number.isFinite(config.home.lat) && Number.isFinite(config.home.lon) && lat != null && lon != null;

  const distanceNm = hasHome ? haversineNm(config.home.lat, config.home.lon, lat, lon) : null;
  const distanceKm = distanceNm == null ? null : distanceNm * 1.852;
  const bearingFromHomeDeg = hasHome ? bearingDeg(config.home.lat, config.home.lon, lat, lon) : null;
  const elev = elevationAngleDeg(distanceNm, altitudeFt, config.home.elevationFt);

  const cleanCallsign = a.flight?.trim() || null;
  const route = getRouteForCallsign(cleanCallsign);

  const enriched = {
    hex: a.hex,
    callsign: cleanCallsign,
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
    seenPosSec: a.seen_pos ?? a.seen ?? null,
    distanceNm,
    distanceKm,
    bearingFromHomeDeg,
    elevationAngleDeg: elev,
    uiAngleDeg: bearingToUiAngleDeg(bearingFromHomeDeg),
    route
  };

  enriched.isSelectable = isSelectableAircraft(enriched);
  return enriched;
}

export async function readAndParseAircraftFeed() {
  const raw = await fs.readFile(config.aircraftJsonPath, "utf8");
  const data = JSON.parse(raw);
  const aircraft = (data.aircraft || [])
    .filter(validateAndLogAircraft)
    .map(enrichAircraft)
    .sort((a, b) => {
      if (a.isSelectable && !b.isSelectable) return -1;
      if (!a.isSelectable && b.isSelectable) return 1;
      const aDistance = a.distanceKm ?? Infinity;
      const bDistance = b.distanceKm ?? Infinity;
      return aDistance - bDistance;
    });

  return {
    now: data.now,
    total: data.aircraft?.length ?? 0,
    aircraft
  };
}
