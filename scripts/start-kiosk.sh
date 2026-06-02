#!/usr/bin/env bash
set -euo pipefail

export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export XCURSOR_PATH=/dev/null
export XCURSOR_THEME=none

exec dbus-run-session -- cage -- chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --ozone-platform=wayland \
  http://localhost:3000