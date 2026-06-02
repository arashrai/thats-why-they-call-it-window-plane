# That's Why They Call It Window Plane ✈️

A local-first, premium aircraft HUD and radar tracking system designed to run on a Raspberry Pi 5 with a projector displaying aircraft movements on your ceiling.

Perfect for flats and high-rise apartments to visually track and catalog aircraft flying overhead in real time.

---

## Key Features

- **Buttery Smooth 60fps Interpolation**: Uses client-side dead reckoning based on reported speed, track heading, and vertical rates to slide the target reticle and tracking chevron continuously between server updates.
- **Dynamic Flight Route Lookups**: Automatically fetches carrier names, origin, and destination airports (e.g., `SFO ➔ SEA`) via the ADSBDB API and caches them locally to ensure instant load times and zero network congestion.
- **Distance-Based Target Selection**: Automatically targets and tracks the closest active aircraft within the custom maximum distance range boundary, featuring distance hysteresis to prevent selection flashing.
- **Rotatable Compass Calibration**: Automatically aligns North, East, South, and West to match your room's physical orientation using simple configuration settings.
- **Projector-Optimized Aesthetics**: Designed with a pure black (`#000000`) background to eliminate light leakage on your ceiling, detailed with high-contrast glowing cyan and amber elements.
- **Live Local Airspace Feed**: Tracks nearby planes entering the airspace, including climb/descent trend states and elevation angles.
- **Developer Simulation Mode**: Includes an offline aircraft simulator to build and test the HUD features directly on your laptop without needing an active SDR receiver.

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