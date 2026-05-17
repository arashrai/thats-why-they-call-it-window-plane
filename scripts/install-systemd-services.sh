#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/arash/projects/thats-why-they-call-it-window-plane"

sudo cp "$REPO_DIR/systemd/windowplane.service" /etc/systemd/system/windowplane.service
sudo cp "$REPO_DIR/systemd/windowplane-kiosk.service" /etc/systemd/system/windowplane-kiosk.service

sudo systemctl daemon-reload
sudo systemctl enable windowplane
sudo systemctl enable windowplane-kiosk

sudo systemctl restart windowplane
sudo systemctl restart windowplane-kiosk

sudo systemctl status windowplane --no-pager
sudo systemctl status windowplane-kiosk --no-pager