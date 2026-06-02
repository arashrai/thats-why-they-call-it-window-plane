#!/usr/bin/env bash
set -euo pipefail

sudo bash -c "$(curl -L -o - https://github.com/wiedehopf/adsb-scripts/raw/master/readsb-install.sh)"
sudo bash -c "$(curl -L -o - https://github.com/wiedehopf/tar1090/raw/master/install.sh)"

sudo systemctl enable readsb
sudo systemctl restart readsb

echo "Installed ADS-B stack."
echo
echo "Check readsb:"
echo "  sudo systemctl status readsb --no-pager"
echo
echo "Check JSON:"
echo "  cat /run/readsb/aircraft.json | python3 -m json.tool | head -80"
echo
echo "Open tar1090:"
echo "  http://windowplane.local/tar1090/"