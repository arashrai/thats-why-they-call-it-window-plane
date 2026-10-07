#!/usr/bin/env bash
set -euo pipefail

# Create a local empty directory to force cursor hiding without crashing libxcursor
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMPTY_CURSOR_DIR="$SCRIPT_DIR/../.empty_cursors"
mkdir -p "$EMPTY_CURSOR_DIR"

# Ensure XDG_RUNTIME_DIR exists with proper permissions
USER_ID="$(id -u)"
XDG_DIR="/run/user/$USER_ID"
if [ ! -d "$XDG_DIR" ]; then
  mkdir -p "$XDG_DIR"
fi
chmod 0700 "$XDG_DIR" 2>/dev/null || true
export XDG_RUNTIME_DIR="$XDG_DIR"

export XCURSOR_PATH="$EMPTY_CURSOR_DIR"
export XCURSOR_THEME=none
export WLR_NO_HARDWARE_CURSORS=1
export WLR_LIBINPUT_NO_DEVICES=1

# Chromium user profile & lock cleanup
PROFILE_DIR="/tmp/windowplane-chromium-kiosk"
mkdir -p "$PROFILE_DIR"
rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonSocket" "$PROFILE_DIR/SingletonCookie"

# Wait for local web server to become available
echo "Waiting for http://localhost:3000 to become available..."
until curl -s http://localhost:3000 >/dev/null 2>&1; do
  sleep 1
done
echo "Web server is online. Starting kiosk display..."

exec dbus-run-session -- cage -- chromium \
  --user-data-dir="$PROFILE_DIR" \
  --incognito \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --no-first-run \
  --ozone-platform=wayland \
  --enable-features=UseOzonePlatform \
  http://localhost:3000