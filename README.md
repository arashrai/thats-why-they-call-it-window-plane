# That's Why They Call It Window Plane ✈️

A local-first aircraft HUD and radar tracking system designed to run on a Raspberry Pi 5 with a projector displaying aircraft movements on your ceiling.

Visually tracks aircraft flying overhead in real time.

---

## Key Features

- **25 FPS Client-Side Interpolation**: Uses dead reckoning based on speed, track heading, and vertical rates to smooth target movements between receiver updates.
- **FlightStats-Based Route Scraper**: Automatically fetches carrier names, origin, and destination airports for flights to/from SEA airport via public APIs and caches them locally.
- **Distance-Based Target Selection**: Targets and tracks the closest active aircraft within the maximum distance range boundary, using hysteresis to prevent selection switching/flashing.
- **Compass Calibration**: Aligns the grid coordinates to match your room's physical orientation using down-bearing configuration offsets.
- **Projector-Optimized Aesthetics**: Uses a pure black (`#000000`) background to prevent light leakage on ceiling displays, with high-contrast cyan and amber elements.
- **Airspace Overview**: Tracks nearby aircraft in the area, displaying distance, altitude, climbs/descents, and bearings.
- **Offline Simulator**: Includes a mock flight telemetry generator to test HUD rendering without an active SDR receiver.

---

## Hardware Requirements

- **Raspberry Pi 5** (Runs on Raspberry Pi OS Lite 64-bit)
- **RTL-SDR USB Dongle** (e.g., RTL-SDR Blog V3/V4 or generic RTL2832U)
- **1090 MHz Antenna** (positioned vertically near a window)
- **Ceiling Projector** (connected to the Pi's micro-HDMI port)

---

## Quick Installation on Raspberry Pi

Copy this repository to your Pi and run the master setup script, which handles base software, receiver dependencies, kiosk display configuration, and autostart scripts:

```bash
git clone https://github.com/arashrai/thats-why-they-call-it-window-plane.git
cd thats-why-they-call-it-window-plane
chmod +x setup.sh
./setup.sh
```

### Configuration

Edit the generated `.env` file in the root directory to set your home coordinates and calibrate the projection tracking:

```env
PORT=3000
AIRCRAFT_JSON_PATH=/run/readsb/aircraft.json

# Your location coordinates & elevation
HOME_LAT=47.xxxxxx
HOME_LON=-122.xxxxxx
HOME_ELEVATION_FT=350

# Max tracking distance (planes outside this range won't lock on)
MAX_DISTANCE_KM=10

# Projector Calibration
# What bearing (0-360°) is straight down on your ceiling?
# (e.g. if your window faces Southeast (120°), set this to 120)
DOWN_BEARING_DEG=120

# Scale factor for bearing rotation mapping
BEARING_TO_UI_SCALE=1
```

---

## Local Development & Simulation (Mac/Windows)

You can run and test the HUD locally on your development machine using mock tracking vectors:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the simulated flight telemetry generator**:
   ```bash
   node scripts/simulate-aircraft.js
   ```

3. **Start the local server**:
   ```bash
   npm run dev
   ```

4. **Run unit tests**:
   You can run tests for dead-reckoning calculations and target selection logic:
   ```bash
   npm test
   ```

5. Open your browser to [http://localhost:3000](http://localhost:3000). The radar will acquire simulated flights crossing the Seattle airspace and track them in real time.

---

## Architecture Overview

```text
       Aircraft ADS-B Broadcasts
                 ↓ (1090 MHz)
              Antenna
                 ↓
           RTL-SDR Dongle
                 ↓ (USB)
     readsb (decodes transmissions)
                 ↓
     /run/readsb/aircraft.json
                 ↓
     Window Plane Server (queries routes & caches)
                 ↓ (HTTP / API)
     Client Web UI (60fps dead-reckoned interpolation)
                 ↓
     Projector Display (Ceiling projection HUD)
```

## Useful Commands

### Manage Services

The setup script configures two services:
- `windowplane.service` (manages the Node web server)
- `windowplane-kiosk.service` (manages Cage compositor and Chromium display)

```bash
# Restart server
sudo systemctl restart windowplane

# View logs
journalctl -u windowplane -f --no-pager
journalctl -u windowplane-kiosk -f --no-pager
```

### Testing Receiver Hardware

If you need to verify that your SDR dongle is connected and readable by the system:

```bash
# Stop readsb temporarily so it releases the USB lock
sudo systemctl stop readsb
rtl_test
sudo systemctl start readsb
```