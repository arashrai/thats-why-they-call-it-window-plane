import fs from "fs/promises";
import path from "path";

const HOME_LAT = 47.61684969992983;
const HOME_LON = -122.3314572136029;

const mockPlanes = [
  {
    hex: "a00001",
    flight: "ASA611",
    t: "B39M",
    desc: "Boeing 737 MAX 9",
    lat: 47.58,
    lon: -122.25,
    alt_baro: 4200,
    gs: 220,
    track: 310,
    baro_rate: -150
  },
  {
    hex: "a00002",
    flight: "DAL1432",
    t: "A21N",
    desc: "Airbus A321neo",
    lat: 47.68,
    lon: -122.38,
    alt_baro: 3500,
    gs: 180,
    track: 130,
    baro_rate: -400
  },
  {
    hex: "a00003",
    flight: "UAL2401",
    t: "B77W",
    desc: "Boeing 777-300ER",
    lat: 47.50,
    lon: -122.20,
    alt_baro: 12000,
    gs: 340,
    track: 340,
    baro_rate: 800
  }
];

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degToRad(lat1)) *
      Math.cos(degToRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function run() {
  const targetDir = path.resolve("test-data");
  await fs.mkdir(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, "aircraft.json");

  console.log("Starting aircraft simulator...");
  console.log(`Writing simulation state to ${targetFile}`);

  setInterval(async () => {
    // Update plane positions
    for (const plane of mockPlanes) {
      // 1 knot is 1.852 km/h, which is 0.0005144 km/s.
      // So in 1 second, plane flies: speedKt * 0.0005144 km.
      const distKm = plane.gs * 0.000514444;
      const angleRad = degToRad(plane.track);

      // Convert distance to delta lat/lon
      const dLat = (distKm * Math.cos(angleRad)) / 111.32;
      const dLon = (distKm * Math.sin(angleRad)) / (111.32 * Math.cos(degToRad(plane.lat)));

      plane.lat += dLat;
      plane.lon += dLon;

      // Update altitude (baro_rate is in ft/min, so delta per second is baro_rate / 60)
      plane.alt_baro += Math.round(plane.baro_rate / 60);

      // If altitude gets too low or high, reverse vertical rate
      if (plane.alt_baro < 1500) {
        plane.baro_rate = Math.abs(plane.baro_rate);
      } else if (plane.alt_baro > 15000) {
        plane.baro_rate = -Math.abs(plane.baro_rate);
      }

      // Check distance from home. If it goes past 25km, wrap it back
      const distFromHome = haversineKm(HOME_LAT, HOME_LON, plane.lat, plane.lon);
      if (distFromHome > 25) {
        // Respawn on opposite side relative to track
        const oppTrack = (plane.track + 180) % 360;
        const spawnAngle = degToRad(oppTrack);
        // Spawn 15km away
        const spawnDist = 15;
        const spawnLat = HOME_LAT + (spawnDist * Math.cos(spawnAngle)) / 111.32;
        const spawnLon = HOME_LON + (spawnDist * Math.sin(spawnAngle)) / (111.32 * Math.cos(degToRad(HOME_LAT)));

        plane.lat = spawnLat;
        plane.lon = spawnLon;
        plane.alt_baro = 5000 + Math.random() * 4000;
        plane.track = (plane.track + (Math.random() * 40 - 20) + 360) % 360;
        console.log(`[SIM] Respawned ${plane.flight} at ${spawnLat.toFixed(4)}, ${spawnLon.toFixed(4)}`);
      }
    }

    const payload = {
      now: Date.now() / 1000,
      aircraft: mockPlanes.map(p => ({
        hex: p.hex,
        flight: p.flight.padEnd(8),
        t: p.t,
        desc: p.desc,
        lat: p.lat,
        lon: p.lon,
        alt_baro: p.alt_baro,
        gs: p.gs,
        track: p.track,
        baro_rate: p.baro_rate,
        seen: 0.1 + Math.random() * 0.3
      }))
    };

    try {
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(targetFile, JSON.stringify(payload, null, 2), "utf8");
    } catch (err) {
      console.error("Error writing mock aircraft.json:", err);
    }
  }, 1000);
}

run().catch(console.error);
