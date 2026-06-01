#!/usr/bin/env bash
set -euo pipefail

# Make sure we are running in the repo root
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

echo "==========================================="
echo "  Window Plane Pi Setup Tool"
echo "==========================================="
echo "This script will install system dependencies, ADS-B tools,"
echo "node packages, and configure autostart services."
echo

# Ensure setup scripts are executable
chmod +x scripts/*.sh

# Step 1: Base Pi Dependencies
echo "[1/5] Installing base system dependencies (Avahi, node, npm, rtl-sdr)..."
./scripts/install-pi-deps.sh
echo

# Step 2: ADS-B Stack
echo "[2/5] Installing readsb and tar1090 stack..."
./scripts/install-adsb-stack.sh
echo

# Step 3: Kiosk dependencies (Optional/Recommended for projector roof setup)
read -rp "Install Chromium kiosk display components (Cage compositor, Chromium) for projector/roof display? [Y/n] " install_kiosk
install_kiosk=${install_kiosk:-Y}

if [[ "$install_kiosk" =~ ^[Yy]$ ]]; then
  echo "[3/5] Installing kiosk display packages..."
  ./scripts/install-kiosk-deps.sh
else
  echo "[3/5] Skipping kiosk display packages..."
fi
echo

# Step 4: NPM Install
echo "[4/5] Installing Node app dependencies..."
npm install
echo

# Step 5: Environment Config (.env)
if [ ! -f .env ]; then
  echo "[5/5] Creating .env file from template..."
  cp .env.example .env
  echo "--> Created '.env'. PLEASE open and edit your coordinates (HOME_LAT/HOME_LON) and height!"
else
  echo "[5/5] '.env' already exists. Skipping creation."
fi
echo

# Step 6: Systemd Autostart
read -rp "Configure autostart services (automatically starts web app and kiosk on boot)? [Y/n] " install_services
install_services=${install_services:-Y}

if [[ "$install_services" =~ ^[Yy]$ ]]; then
  echo "Installing systemd services..."
  ./scripts/install-systemd-services.sh
else
  echo "Skipping systemd service installation. You can run the app manually using 'npm start'."
fi

echo
echo "==========================================="
echo "  Setup Complete!"
echo "==========================================="
echo "1. Edit coordinates in '.env' to calibrate target tracking."
echo "2. If services were enabled, they will run automatically on boot."
echo "3. Run manual server using 'npm start' or 'npm run dev'."
echo "==========================================="
