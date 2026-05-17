#!/usr/bin/env bash
set -euo pipefail

sudo apt update

sudo apt install -y \
  git \
  curl \
  nodejs \
  npm \
  rtl-sdr \
  cage \
  dbus-x11 \
  chromium \
  unclutter

echo "Installed Pi dependencies."