#!/usr/bin/env bash
set -euo pipefail

# Dynamically resolve repository root
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_USER="$(whoami)"
USER_HOME="$HOME"

echo "Installing systemd services..."
echo "Repository Directory: $REPO_DIR"
echo "Target User: $CURRENT_USER"
echo "User Home: $USER_HOME"

# Create temp files with replacements
TEMP_WP=$(mktemp)
TEMP_KIOSK=$(mktemp)

# Replace User=arash and /home/arash/... paths
sed -e "s|User=arash|User=$CURRENT_USER|g" \
    -e "s|/home/arash/projects/thats-why-they-call-it-window-plane|$REPO_DIR|g" \
    "$REPO_DIR/systemd/windowplane.service" > "$TEMP_WP"

sed -e "s|User=arash|User=$CURRENT_USER|g" \
    -e "s|/home/arash/projects/thats-why-they-call-it-window-plane|$REPO_DIR|g" \
    -e "s|HOME=/home/arash|HOME=$USER_HOME|g" \
    "$REPO_DIR/systemd/windowplane-kiosk.service" > "$TEMP_KIOSK"

sudo cp "$TEMP_WP" /etc/systemd/system/windowplane.service
sudo cp "$TEMP_KIOSK" /etc/systemd/system/windowplane-kiosk.service

rm "$TEMP_WP" "$TEMP_KIOSK"

sudo systemctl daemon-reload
sudo systemctl enable windowplane
sudo systemctl enable windowplane-kiosk

sudo systemctl restart windowplane
sudo systemctl restart windowplane-kiosk

echo "Service installation complete. Status:"
sudo systemctl status windowplane --no-pager
echo
sudo systemctl status windowplane-kiosk --no-pager