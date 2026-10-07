#!/usr/bin/env bash
set -euo pipefail

# Dynamically resolve repository root
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

git pull
chmod +x scripts/*.sh
npm install

./scripts/install-systemd-services.sh

echo "Waiting for services to settle..."
sleep 2

sudo systemctl status windowplane --no-pager
echo
sudo systemctl status windowplane-kiosk --no-pager