#!/usr/bin/env bash
# Installs a systemd service that starts the Office Call server at boot and restarts it
# if it crashes. Run from the project folder:  bash deploy/install-service.sh
set -euo pipefail
cd "$(dirname "$0")/.."
APP_DIR=$(pwd)
NODE_BIN=$(command -v node || true)
RUN_USER=$(id -un)
PORT=${PORT:-3000}

if [ -z "$NODE_BIN" ]; then
  echo "node not found in PATH. Install Node.js 20+ first."
  exit 1
fi
if [ ! -f server/dist/server/src/index.js ] || [ ! -d client/dist ]; then
  echo "Build first:  npm install && npm run build"
  exit 1
fi

sudo tee /etc/systemd/system/office-call.service >/dev/null <<UNIT
[Unit]
Description=Office Call server
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=$NODE_BIN $APP_DIR/server/dist/server/src/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now office-call
sleep 2
systemctl --no-pager status office-call | head -15
echo
echo "Installed. Logs:  journalctl -u office-call -f"
