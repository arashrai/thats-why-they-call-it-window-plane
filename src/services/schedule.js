let routeDatabase = {};
const loggedMissingCallsigns = new Set();
const loggedSuccessfulCallsigns = new Set();

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
  
  // Clear caches periodically
  loggedMissingCallsigns.clear();
  loggedSuccessfulCallsigns.clear();

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

export function getRouteForCallsign(callsign) {
  if (!callsign) return null;

  const cleanCallsign = callsign.trim().toUpperCase().replace(/\s+/g, "");
  let entries = routeDatabase[cleanCallsign];

  if (!entries || entries.length === 0) {
    // Attempt to resolve alphanumeric ATC callsign suffixes (e.g., ICE11P -> ICE11, SWA45C -> SWA45)
    const match = cleanCallsign.match(/^([A-Z]{2,3})(\d+)([A-Z]+)$/);
    if (match) {
      const prefix = match[1];
      const num = match[2];
      const strippedCallsign = `${prefix}${num}`;
      entries = routeDatabase[strippedCallsign];

      // If still not found, try translating IATA <=> ICAO
      if (!entries || entries.length === 0) {
        if (prefix.length === 3) {
          const iata = Object.keys(IATA_TO_ICAO).find(key => IATA_TO_ICAO[key] === prefix);
          if (iata) {
            entries = routeDatabase[`${iata}${num}`];
          }
        } else if (prefix.length === 2) {
          const icao = IATA_TO_ICAO[prefix];
          if (icao) {
            entries = routeDatabase[`${icao}${num}`];
          }
        }
      }
    }
  }

  if (!entries || entries.length === 0) {
    if (!loggedMissingCallsigns.has(cleanCallsign)) {
      loggedMissingCallsigns.add(cleanCallsign);
      console.log(`[Lookup] Route NOT found in schedule DB for callsign: ${cleanCallsign}`);
    }
    return null;
  }

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

  const route = closestEntry || entries[0];
  if (route) {
    if (!loggedSuccessfulCallsigns.has(cleanCallsign)) {
      loggedSuccessfulCallsigns.add(cleanCallsign);
      console.log(`[Lookup] Route found for ${cleanCallsign}: ${route.origin?.code} ➔ ${route.destination?.code}`);
    }
  }

  return route ? {
    airline: route.airline,
    origin: route.origin,
    destination: route.destination
  } : null;
}

export async function initScheduleLoop() {
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
}
