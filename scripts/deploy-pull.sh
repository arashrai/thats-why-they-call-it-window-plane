#!/usr/bin/env bash
set -euo pipefail

# Dynamically resolve repository root
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

git pull
chmod +x scripts/*.sh
npm install

sudo systemctl restart windowplane
sudo systemctl restart windowplane-kiosk

sudo systemctl status windowplane --no-pager
sudo systemctl status windowplane-kiosk --no-pager