#!/usr/bin/env bash
set -euo pipefail

sudo apt update

sudo apt install -y \
  cage \
  dbus-x11 \
  chromium

echo "Installed kiosk/display dependencies."