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
  maxDistanceKm: Number(process.env.MAX_DISTANCE_KM || 10),
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

const CACHE_FILE = path.join(process.cwd(), "data/routes-cache.json");
let routeCache = {};
const fetchInProgress = new Set();

const CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const NOT_FOUND_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function cleanExpiredCacheEntries() {
  const now = Date.now();
  let modified = false;
  for (const [key, value] of Object.entries(routeCache)) {
    const timestamp = value.timestamp || 0;
    const age = now - timestamp;
    if (value.notFound) {
      if (age > NOT_FOUND_EXPIRY_MS) {
        delete routeCache[key];
        modified = true;
      }
    } else if (value.failed) {
      if (age > 60 * 60 * 1000) { // 1 hour for temp errors
        delete routeCache[key];
        modified = true;
      }
    } else {
      if (age > CACHE_EXPIRY_MS) {
        delete routeCache[key];
        modified = true;
      }
    }
  }
  if (modified) {
    console.log("[CACHE] Evicted expired cache entries.");
    saveRouteCache();
  }
}

async function initRouteCache() {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    const data = await fs.readFile(CACHE_FILE, "utf8");
    routeCache = JSON.parse(data);
    console.log(`[CACHE] Loaded ${Object.keys(routeCache).length} cached flight routes.`);
    cleanExpiredCacheEntries();
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("[CACHE] Error reading routes cache:", err);
    } else {
      console.log("[CACHE] No routes cache file found. Starting empty.");
    }
  }
}

async function saveRouteCache() {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(routeCache, null, 2), "utf8");
  } catch (err) {
    console.error("[CACHE] Error saving routes cache:", err);
  }
}

function triggerRouteLookup(callsign) {
  if (!callsign) return;
  const cleanCallsign = callsign.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleanCallsign) return;

  const cached = routeCache[cleanCallsign];
  if (fetchInProgress.has(cleanCallsign)) {
    return;
  }

  const now = Date.now();
  if (cached) {
    if (cached.notFound) {
      return; // Do not query known not found items (24h expiry handles invalidation)
    }
    if (cached.failed) {
      const retryDelayMs = 60 * 60 * 1000; // 1 hour
      if (now - cached.timestamp < retryDelayMs) {
        return; // Do not retry transient errors within 1 hour
      }
      console.log(`[API] Retrying route lookup for callsign ${cleanCallsign} after 1 hour...`);
    } else {
      return; // Already cached successfully
    }
  }

  fetchInProgress.add(cleanCallsign);
  console.log(`[API] Fetching route info for callsign: ${cleanCallsign}`);

  fetch(`https://api.adsbdb.com/v0/callsign/${cleanCallsign}`)
    .then((res) => {
      if (res.status === 404) {
        routeCache[cleanCallsign] = {
          notFound: true,
          timestamp: now
        };
        saveRouteCache();
        console.log(`[API] Route for ${cleanCallsign} not found (404). Caching negative result for 24h.`);
        return null;
      }

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      if (!data) return; // 404 handled above

      const routeInfo = data?.response?.flightroute || null;
      if (routeInfo) {
        routeCache[cleanCallsign] = {
          airline: routeInfo.airline?.name || null,
          origin: routeInfo.origin ? {
            code: routeInfo.origin.iata_code || routeInfo.origin.icao_code || null,
            name: routeInfo.origin.municipality || routeInfo.origin.name || null,
            airport: routeInfo.origin.name || null
          } : null,
          destination: routeInfo.destination ? {
            code: routeInfo.destination.iata_code || routeInfo.destination.icao_code || null,
            name: routeInfo.destination.municipality || routeInfo.destination.name || null,
            airport: routeInfo.destination.name || null
          } : null,
          timestamp: now
        };
        console.log(`[API] Successfully cached route for ${cleanCallsign}: ${routeCache[cleanCallsign].origin?.code} -> ${routeCache[cleanCallsign].destination?.code}`);
      } else {
        routeCache[cleanCallsign] = {
          notFound: true,
          timestamp: now
        };
        console.log(`[API] Response for ${cleanCallsign} lacked route info. Caching negative result for 24h.`);
      }
      saveRouteCache();
    })
    .catch((err) => {
      console.error(`[API] Error fetching route for ${cleanCallsign}:`, err.message);
      // Cache as temporary failure to prevent retries for 1 hour
      routeCache[cleanCallsign] = {
        failed: true,
        timestamp: Date.now()
      };
      saveRouteCache();
    })
    .finally(() => {
      fetchInProgress.delete(cleanCallsign);
    });
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
  // bearing 140 -> 70°  -> down-right
  // bearing 100 -> 110° -> down-left
  return normalizeDeg(90 - diffFromDown * HOME.bearingToUiScale);
}

function isSelectableAircraft(a) {
  return (
    a.lat != null &&
    a.lon != null &&
    a.distanceKm != null &&
    a.elevationAngleDeg != null &&
    (a.seenSec ?? 999) < 10 &&
    a.distanceKm <= HOME.maxDistanceKm &&
    a.elevationAngleDeg >= HOME.minElevationAngleDeg &&
    a.elevationAngleDeg <= HOME.maxElevationAngleDeg
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

  const distanceKm = distanceNm == null ? null : distanceNm * 1.852;

  const bearingFromHomeDeg = hasHome
    ? bearingDeg(HOME.lat, HOME.lon, lat, lon)
    : null;

  const elev = elevationAngleDeg(distanceNm, altitudeFt, HOME.elevationFt);

  const cleanCallsign = a.flight?.trim().toUpperCase().replace(/\s+/g, "") || null;
  const route = cleanCallsign ? routeCache[cleanCallsign] : null;

  if (cleanCallsign) {
    triggerRouteLookup(cleanCallsign);
  }

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
    distanceKm,
    bearingFromHomeDeg,
    elevationAngleDeg: elev,
    uiAngleDeg: bearingToUiAngleDeg(bearingFromHomeDeg),
    route: (route && !route.notFound && !route.failed) ? {
      airline: route.airline,
      origin: route.origin,
      destination: route.destination
    } : null
  };

  enriched.isSelectable = isSelectableAircraft(enriched);

  return enriched;
}

app.get("/api/aircraft", async (_req, res) => {
  try {
    const raw = await fs.readFile(aircraftJsonPath, "utf8");
    const data = JSON.parse(raw);

    const aircraft = (data.aircraft || [])
      .filter((a) => a.flight || a.lat || a.lon || a.alt_baro || a.alt_geom)
      .map(enrichAircraft)
      .sort((a, b) => {
        if (a.isSelectable && !b.isSelectable) return -1;
        if (!a.isSelectable && b.isSelectable) return 1;

        const aDistance = a.distanceKm ?? Infinity;
        const bDistance = b.distanceKm ?? Infinity;
        return aDistance - bDistance;
      });

    const selected = aircraft.find((a) => a.isSelectable) || null;
    const nearby = aircraft
      .filter((a) => a.hex !== (selected ? selected.hex : null))
      .slice(0, 5);

    res.json({
      now: data.now,
      total: data.aircraft?.length ?? 0,
      maxDistanceKm: HOME.maxDistanceKm,
      selected,
      nearby,
      aircraft,
      config: {
        homeLat: HOME.lat,
        homeLon: HOME.lon,
        homeElevationFt: HOME.elevationFt,
        downBearingDeg: HOME.downBearingDeg,
        bearingToUiScale: HOME.bearingToUiScale
      }
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to read aircraft data",
      path: aircraftJsonPath,
      details: String(err)
    });
  }
});

initRouteCache().then(() => {
  app.listen(port, "0.0.0.0", () => {
    console.log(`Window Plane running at http://0.0.0.0:${port}`);
    console.log(`Reading aircraft from ${aircraftJsonPath}`);
  });
});
