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

let routeDatabase = {};
const loggedMissingCallsigns = new Set();
const loggedSuccessfulCallsigns = new Set();
const loggedInvalidCallsigns = new Set();

const IATA_TO_ICAO = {
  AS: "ASA",
  DL: "DAL",
  UA: "UAL",
  WN: "SWA",
  QX: "QXE",
  OO: "SKW",
  AA: "AAL",
  FX: "FDX",
  "5X": "UPS",
  HA: "HAL",
  B6: "JBU",
  NK: "NKS",
  F9: "FFT",
  AC: "ACA",
  BA: "BAW",
  LH: "DLH",
  EK: "UAE",
  QR: "QTR",
  BR: "EVA",
  SQ: "SIA",
  NH: "ANA",
  JL: "JAL",
  AM: "AMX",
  AF: "AFR",
  DE: "CFG",
  FI: "ICE",
  HU: "CHH",
  KE: "KAL",
  OZ: "AAR",
  TN: "UTN", // Air Tahiti Nui
  EI: "EIN"  // Aer Lingus
};

const OPERATING_AIRLINES = [
  { name: "SkyWest", iata: "OO", icao: "SKW" },
  { name: "Horizon", iata: "QX", icao: "QXE" },
  { name: "Republic", iata: "YX", icao: "RPA" },
  { name: "Mesa", iata: "YV", icao: "ASH" },
  { name: "GoJet", iata: "G7", icao: "GJS" },
  { name: "Envoy", iata: "MQ", icao: "ENY" },
  { name: "Piedmont", iata: "PT", icao: "PDT" },
  { name: "PSA", iata: "OH", icao: "JIA" },
  { name: "Jazz", iata: "QK", icao: "JZA" }
];

async function updateSeaSchedule() {
  console.log("[Schedule] Updating SEA Airport flight schedule...");

  // Clear logging caches periodically (every 6 hours) to prevent memory growth
  loggedMissingCallsigns.clear();
  loggedSuccessfulCallsigns.clear();
  loggedInvalidCallsigns.clear();

  const tempDatabase = {};

  const options = { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric" };
  const formatter = new Intl.DateTimeFormat("en-US", options);

  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dates = [
    formatter.format(today).split("/"),
    formatter.format(tomorrow).split("/")
  ];

  const types = ["dep", "arr"];
  const startHours = [0, 12];

  for (const [month, day, year] of dates) {
    for (const type of types) {
      for (const startHour of startHours) {
        const url = `https://www.flightstats.com/v2/api-next/flight-tracker/${type}/SEA/${year}/${month}/${day}/${startHour}?numHours=12`;
        try {
          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
          });
          if (!res.ok) {
            console.error(`[Schedule] Failed to fetch schedule from ${url}: Status ${res.status}`);
            continue;
          }
          const data = await res.json();
          const flights = data?.data?.flights || [];
          const isArrival = type === "arr";

          for (const flight of flights) {
            if (!flight.carrier?.fs || !flight.carrier?.flightNumber) continue;

            const iata = flight.carrier.fs.trim().toUpperCase();
            const flightNum = flight.carrier.flightNumber.trim();
            const icao = IATA_TO_ICAO[iata];

            const routeInfo = {
              sortTime: flight.sortTime,
              airline: flight.carrier.name || null,
              origin: isArrival ? {
                code: flight.airport?.fs || null,
                name: flight.airport?.city || null,
                airport: flight.airport?.city || null
              } : {
                code: "SEA",
                name: "Seattle",
                airport: "Seattle-Tacoma Intl"
              },
              destination: isArrival ? {
                code: "SEA",
                name: "Seattle",
                airport: "Seattle-Tacoma Intl"
              } : {
                code: flight.airport?.fs || null,
                name: flight.airport?.city || null,
                airport: flight.airport?.city || null
              }
            };

            const iataKey = `${iata}${flightNum}`;
            if (!tempDatabase[iataKey]) tempDatabase[iataKey] = [];
            tempDatabase[iataKey].push(routeInfo);

            if (icao) {
              const icaoKey = `${icao}${flightNum}`;
              if (!tempDatabase[icaoKey]) tempDatabase[icaoKey] = [];
              tempDatabase[icaoKey].push(routeInfo);
            }

            if (flight.operatedBy) {
              const opLower = flight.operatedBy.toLowerCase();
              for (const op of OPERATING_AIRLINES) {
                if (opLower.includes(op.name.toLowerCase())) {
                  const opIataKey = `${op.iata}${flightNum}`;
                  const opIcaoKey = `${op.icao}${flightNum}`;
                  
                  if (!tempDatabase[opIataKey]) tempDatabase[opIataKey] = [];
                  tempDatabase[opIataKey].push(routeInfo);
                  
                  if (!tempDatabase[opIcaoKey]) tempDatabase[opIcaoKey] = [];
                  tempDatabase[opIcaoKey].push(routeInfo);
                  break;
                }
              }
            }
          }
        } catch (err) {
          console.error(`[Schedule] Error fetching slot ${type} starting at hour ${startHour} on ${year}-${month}-${day}:`, err.message);
        }
      }
    }
  }

  if (Object.keys(tempDatabase).length > 0) {
    routeDatabase = tempDatabase;
    console.log(`[Schedule] Successfully loaded ${Object.keys(routeDatabase).length} routes into database.`);
  } else {
    console.warn("[Schedule] Update returned 0 routes. Retaining current route database.");
  }
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

function validateAndLogAircraft(a) {
  if (!a.hex) return false;

  const hasCoords = typeof a.lat === "number" && typeof a.lon === "number";
  const alt = a.alt_baro ?? a.alt_geom;
  const hasAlt = alt != null && typeof alt === "number";
  
  // Track and groundspeed are optional, but we filter out stationary aircraft on the ground
  // (e.g. speed < 10 kt and altitude < 1000 ft)
  const hasGs = a.gs != null && typeof a.gs === "number";
  const isStationary = hasGs && a.gs < 10 && (alt != null && alt < 1000);

  const isValid = hasCoords && hasAlt && !isStationary;

  if (!isValid) {
    const callsign = a.flight?.trim().toUpperCase().replace(/\s+/g, "") || null;
    if (callsign) {
      if (!loggedInvalidCallsigns.has(callsign)) {
        loggedInvalidCallsigns.add(callsign);

        const reasons = [];
        if (!hasCoords) reasons.push("missing coordinates");
        if (!hasAlt) reasons.push("missing altitude");
        if (isStationary) reasons.push(`stationary ground target (speed: ${a.gs} kt, alt: ${alt} ft)`);

        console.log(`[Validation] Aircraft ${callsign} failed validation: ${reasons.join(", ")}`);
      }
    }
  }

  return isValid;
}

function isSelectableAircraft(a) {
  return (
    a.lat != null &&
    a.lon != null &&
    a.distanceKm != null &&
    a.elevationAngleDeg != null &&
    a.distanceKm <= HOME.maxDistanceKm &&
    a.elevationAngleDeg >= HOME.minElevationAngleDeg &&
    a.elevationAngleDeg <= HOME.maxElevationAngleDeg
  );
}

function isStillSelectableAircraft(a) {
  return (
    a.lat != null &&
    a.lon != null &&
    a.distanceKm != null &&
    a.elevationAngleDeg != null &&
    a.distanceKm <= (HOME.maxDistanceKm + 1.0) &&
    a.elevationAngleDeg >= (HOME.minElevationAngleDeg - 2.0) &&
    a.elevationAngleDeg <= (HOME.maxElevationAngleDeg + 2.0)
  );
}

function enrichAircraft(a) {
  const lat = a.lat ?? null;
  const lon = a.lon ?? null;

  const altitudeFt =
    typeof a.alt_geom === "number"
      ? a.alt_geom
      : typeof a.alt_baro === "number"
        ? a.alt_baro
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
  let route = null;
  if (cleanCallsign) {
    const entries = routeDatabase[cleanCallsign];
    if (entries && entries.length > 0) {
      const nowMs = Date.now();
      let closestEntry = null;
      let minDiff = Infinity;
      for (const entry of entries) {
        const entryTimeMs = entry.sortTime ? Date.parse(entry.sortTime) : 0;
        if (!entryTimeMs) continue;
        const diff = Math.abs(nowMs - entryTimeMs);
        if (diff < minDiff) {
          minDiff = diff;
          closestEntry = entry;
        }
      }
      route = closestEntry || entries[0];
      if (route) {
        if (!loggedSuccessfulCallsigns.has(cleanCallsign)) {
          loggedSuccessfulCallsigns.add(cleanCallsign);
          console.log(`[Lookup] Route found for ${cleanCallsign}: ${route.origin?.code} ➔ ${route.destination?.code}`);
        }
      }
    } else {
      if (!loggedMissingCallsigns.has(cleanCallsign)) {
        loggedMissingCallsigns.add(cleanCallsign);
        console.log(`[Lookup] Route NOT found in schedule DB for callsign: ${cleanCallsign}`);
      }
    }
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
    seenPosSec: a.seen_pos ?? a.seen ?? null,
    distanceNm,
    distanceKm,
    bearingFromHomeDeg,
    elevationAngleDeg: elev,
    uiAngleDeg: bearingToUiAngleDeg(bearingFromHomeDeg),
    route: route ? {
      airline: route.airline,
      origin: route.origin,
      destination: route.destination
    } : null
  };

  enriched.isSelectable = isSelectableAircraft(enriched);

  return enriched;
}

app.get("/api/aircraft", async (req, res) => {
  try {
    const raw = await fs.readFile(aircraftJsonPath, "utf8");
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

    const clientSelectedHex = req.query.selected || null;
    const bestSelectable = aircraft.find((a) => a.isSelectable) || null;
    let selected = null;

    if (bestSelectable) {
      const currentActive = clientSelectedHex ? aircraft.find((a) => a.hex === clientSelectedHex) : null;
      if (currentActive && isStillSelectableAircraft(currentActive)) {
        const bestDistance = bestSelectable.distanceKm ?? Infinity;
        const currentDistance = currentActive.distanceKm ?? Infinity;
        // Hysteresis threshold: new target must be at least 0.1 km closer to trigger selection switch
        if (bestSelectable.hex !== clientSelectedHex && bestDistance < currentDistance - 0.1) {
          selected = bestSelectable;
        } else {
          selected = currentActive;
        }
      } else {
        selected = bestSelectable;
      }
    } else if (clientSelectedHex) {
      const currentActive = aircraft.find((a) => a.hex === clientSelectedHex) || null;
      if (currentActive && isStillSelectableAircraft(currentActive)) {
        selected = currentActive;
      }
    }

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

// Load initial flight schedule first
console.log("[Schedule] Initializing SEA Airport flight schedule...");
try {
  await updateSeaSchedule();
} catch (err) {
  console.error("[Schedule] Failed to load initial flight schedule:", err.message);
}

// Refresh schedule every 6 hours
setInterval(() => {
  updateSeaSchedule().catch((err) => {
    console.error("[Schedule] Failed to update flight schedule:", err.message);
  });
}, 6 * 60 * 60 * 1000);

app.listen(port, "0.0.0.0", () => {
  console.log(`Window Plane running at http://0.0.0.0:${port}`);
  console.log(`Reading aircraft from ${aircraftJsonPath}`);
});
