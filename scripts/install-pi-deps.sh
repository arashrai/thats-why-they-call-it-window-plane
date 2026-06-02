#!/usr/bin/env bash
set -euo pipefail

sudo apt update

sudo apt install -y \
  git \
  curl \
  nodejs \
  npm \
  rtl-sdr \
  avahi-daemon

sudo systemctl enable ssh
sudo systemctl enable avahi-daemon
sudo systemctl restart avahi-daemon

echo "Installed base Pi dependencies."
echo
echo "Next steps:"
echo "  1. Test RTL-SDR with: rtl_test"
echo "  2. Install ADS-B stack with: ./scripts/install-adsb-stack.sh"
echo "  3. Install app dependencies with: npm install"