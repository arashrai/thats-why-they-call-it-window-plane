#!/usr/bin/env bash
set -euo pipefail

# Create a local empty directory to force cursor hiding without crashing libxcursor
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMPTY_CURSOR_DIR="$SCRIPT_DIR/../.empty_cursors"
mkdir -p "$EMPTY_CURSOR_DIR"

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export XCURSOR_PATH="$EMPTY_CURSOR_DIR"
export XCURSOR_THEME=none
export WLR_NO_HARDWARE_CURSORS=1

exec dbus-run-session -- cage -- chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --ozone-platform=wayland \
  http://localhost:3000