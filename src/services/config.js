import "dotenv/config";

const PORT = Number(process.env.PORT || 3000);
const AIRCRAFT_JSON_PATH = process.env.AIRCRAFT_JSON_PATH || "/run/readsb/aircraft.json";

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

if (isNaN(HOME.lat) || isNaN(HOME.lon)) {
  console.error("[Config] WARNING: HOME_LAT and HOME_LON coordinates are not set or invalid in .env!");
}

export const config = {
  port: PORT,
  aircraftJsonPath: AIRCRAFT_JSON_PATH,
  home: HOME
};
