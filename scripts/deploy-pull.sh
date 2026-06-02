#!/usr/bin/env bash
set -euo pipefail

cd /home/arash/projects/thats-why-they-call-it-window-plane

git pull
chmod +x scripts/*.sh
npm install

sudo systemctl restart windowplane
sudo systemctl restart windowplane-kiosk

sudo systemctl status windowplane --no-pager
sudo systemctl status windowplane-kiosk --no-pager