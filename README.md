````markdown
# That's Why They Call It Window Plane

A local-first aircraft HUD for showing nearby planes using a Raspberry Pi and RTL-SDR dongle.

This project receives ADS-B aircraft broadcasts locally, decodes them with `readsb`, and serves a custom web UI from the Raspberry Pi.

## Current setup

This README covers setup through the stable base stage:

- Raspberry Pi is reachable over SSH
- RTL-SDR dongle is detected
- `readsb` is running
- `tar1090` is available as a local debug map
- The custom Window Plane app can be run manually

## Hardware

Required:

- Raspberry Pi 5
- microSD card with Raspberry Pi OS Lite 64-bit
- USB-C power supply for Raspberry Pi
- RTL-SDR Blog dongle or compatible RTL2832U SDR
- 1090 MHz antenna or adjustable RTL-SDR dipole antenna
- Optional: USB-A extension cable for better antenna placement

Physical ADS-B connection:

```text
Antenna
  ↓
RTL-SDR dongle
  ↓ USB-A / USB extension
Raspberry Pi
  ↓ Wi-Fi
Local web UI
````

For ADS-B at 1090 MHz, start with the antenna vertical near a window.

If using a dipole kit, set each antenna arm to roughly:

```text
~2.7 inches / ~6.9 cm per side
```

## Raspberry Pi OS setup

Use Raspberry Pi Imager.

Recommended settings:

```text
Device: Raspberry Pi 5
OS: Raspberry Pi OS Lite 64-bit
Hostname: windowplane
Username: arash
Enable SSH: yes
SSH password authentication: yes
Wi-Fi: main home Wi-Fi, not guest Wi-Fi
Wireless LAN country: US
Timezone: America/Los_Angeles
Raspberry Pi Connect: disabled
```

After flashing, boot the Pi and wait 1–2 minutes.

SSH in from a Mac:

```bash
ssh arash@windowplane.local
```

If the Pi was reflashed and macOS complains that the host key changed:

```bash
ssh-keygen -R windowplane.local
ssh-keygen -R windowplane.lan
ssh-keygen -R windowplane
```

Then retry:

```bash
ssh arash@windowplane.local
```

## First network checkpoint

Before installing anything else, confirm SSH and Wi-Fi are healthy:

```bash
hostname
hostname -I
iwgetid
sudo systemctl status ssh --no-pager
```

Expected:

```text
hostname       → windowplane
hostname -I    → 192.168.86.xxx or similar
iwgetid        → main Wi-Fi SSID
ssh.service    → active (running)
```

Reboot once and confirm SSH still works:

```bash
sudo reboot
```

After 60–90 seconds:

```bash
ssh arash@windowplane.local
```

Do not proceed until SSH survives a reboot.

## System update

```bash
sudo apt update
sudo apt upgrade -y
sudo reboot
```

Reconnect:

```bash
ssh arash@windowplane.local
```

## Install base packages

```bash
sudo apt install -y git curl rtl-sdr nodejs npm
```

## RTL-SDR setup

Plug in the RTL-SDR dongle.

Check that the Pi sees it:

```bash
lsusb
```

You should see something like:

```text
Realtek Semiconductor Corp. RTL2838 DVB-T
```

Test the dongle:

```bash
rtl_test
```

If it works, stop it with:

```text
Ctrl+C
```

If you get a permissions error like:

```text
usb_open error -3
Please fix the device permissions
```

add udev rules:

```bash
sudo tee /etc/udev/rules.d/20-rtl-sdr.rules > /dev/null <<'EOF'
SUBSYSTEM=="usb", ATTRS{idVendor}=="0bda", ATTRS{idProduct}=="2832", GROUP="plugdev", MODE="0666", SYMLINK+="rtl_sdr"
SUBSYSTEM=="usb", ATTRS{idVendor}=="0bda", ATTRS{idProduct}=="2838", GROUP="plugdev", MODE="0666", SYMLINK+="rtl_sdr"
EOF

sudo udevadm control --reload-rules
sudo udevadm trigger
sudo usermod -aG plugdev arash
sudo reboot
```

Reconnect and test again:

```bash
rtl_test
```

Stop with:

```text
Ctrl+C
```

Important: only one process can use the SDR at a time. Stop `rtl_test` before starting `readsb`.

## Install readsb

Install `readsb`:

```bash
bash -c "$(curl -L -o - https://github.com/wiedehopf/adsb-scripts/raw/master/readsb-install.sh)"
```

Check status:

```bash
sudo systemctl status readsb --no-pager
```

Expected:

```text
active (running)
```

Check the aircraft JSON:

```bash
cat /run/readsb/aircraft.json | python3 -m json.tool | head -80
```

This file is the local aircraft feed used by the Window Plane app.

## Install tar1090

Install `tar1090`:

```bash
bash -c "$(curl -L -o - https://github.com/wiedehopf/tar1090/raw/master/install.sh)"
```

Open the debug map from a browser on your Mac:

```text
http://windowplane.local/tar1090/
```

This is not the custom Window Plane UI. It is a local debug map for verifying that aircraft reception works.

## ADS-B checkpoint

Confirm all of these work before continuing:

```bash
sudo systemctl status readsb --no-pager
cat /run/readsb/aircraft.json | python3 -m json.tool | head -80
```

From Mac browser:

```text
http://windowplane.local/tar1090/
```

Then reboot once:

```bash
sudo reboot
```

After reboot, confirm SSH and `tar1090` still work:

```bash
ssh arash@windowplane.local
sudo systemctl status readsb --no-pager
```

Browser:

```text
http://windowplane.local/tar1090/
```

## Clone the Window Plane repo

```bash
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/arashrai/thats-why-they-call-it-window-plane.git
cd thats-why-they-call-it-window-plane
```

If the repo already exists:

```bash
cd ~/projects/thats-why-they-call-it-window-plane
git pull
```

## Install app dependencies

```bash
npm install
```

## Run the app manually

```bash
npm start
```

From a browser on your Mac, open:

```text
http://windowplane.local:3000
```

You should see the Window Plane UI.

To stop the manual server:

```text
Ctrl+C
```

## Current software architecture

```text
Aircraft ADS-B broadcasts
  ↓
1090 MHz antenna
  ↓
RTL-SDR dongle
  ↓
readsb
  ↓
/run/readsb/aircraft.json
  ↓
Window Plane Node app
  ↓
http://windowplane.local:3000
```

Debug map:

```text
http://windowplane.local/tar1090/
```

Custom app:

```text
http://windowplane.local:3000
```

## Useful commands

Check network:

```bash
hostname
hostname -I
iwgetid
```

Check SSH:

```bash
sudo systemctl status ssh --no-pager
```

Check SDR:

```bash
rtl_test
```

If `rtl_test` says the device is busy, stop `readsb` first:

```bash
sudo systemctl stop readsb
rtl_test
sudo systemctl start readsb
```

Check `readsb`:

```bash
sudo systemctl status readsb --no-pager
journalctl -u readsb -n 100 --no-pager
```

Check aircraft JSON:

```bash
cat /run/readsb/aircraft.json | python3 -m json.tool | head -80
```

Restart `readsb`:

```bash
sudo systemctl restart readsb
```

Run app manually:

```bash
cd ~/projects/thats-why-they-call-it-window-plane
npm start
```

## Development workflow

Develop locally on Mac:

```bash
git add .
git commit -m "Update Window Plane"
git push
```

Pull on Pi:

```bash
ssh arash@windowplane.local
cd ~/projects/thats-why-they-call-it-window-plane
git pull
npm install
npm start
```

## Notes

ADS-B provides local aircraft state such as:

* callsign / flight number
* altitude
* speed
* heading
* latitude / longitude, when available
* signal age
* RSSI

ADS-B does not provide origin/destination route information.
