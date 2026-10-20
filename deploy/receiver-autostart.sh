#!/usr/bin/env bash
# Opens the receiver page in Chrome every time you log in to the office computer.
# Run as the user who logs in:  bash deploy/receiver-autostart.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-3000}

CHROME=""
for c in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$c" >/dev/null; then CHROME=$(command -v "$c"); break; fi
done
if [ -z "$CHROME" ]; then
  echo "Google Chrome or Chromium not found. Install Chrome first."
  exit 1
fi

SCHEME=http
[ -f certs/cert.pem ] && SCHEME=https
URL="$SCHEME://localhost:$PORT/receiver?autostart=1"

# --enable-speech-dispatcher: use Linux system voices (espeak-ng etc.)
# --autoplay-policy=...: allow sound without a click, so the receiver starts by itself
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/office-call-receiver.desktop <<DESKTOP
[Desktop Entry]
Type=Application
Name=Office Call Receiver
Exec=sh -c 'sleep 10; "$CHROME" --enable-speech-dispatcher --autoplay-policy=no-user-gesture-required --new-window "$URL"'
X-GNOME-Autostart-enabled=true
DESKTOP

echo "Installed: ~/.config/autostart/office-call-receiver.desktop"
echo "At next login Chrome opens $URL"
echo "Note: Chrome flags only apply when Chrome was fully closed before. If Chrome is already"
echo "running, close all Chrome windows first, or just click Start on the receiver page."
