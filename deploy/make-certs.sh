#!/usr/bin/env bash
# Creates HTTPS certificates for the office network with mkcert.
# Run on the office computer from the project folder:  bash deploy/make-certs.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v mkcert >/dev/null; then
  echo "mkcert is not installed. Install it with:"
  echo "  sudo apt install mkcert libnss3-tools"
  exit 1
fi

# Every IPv4 address of this PC, plus its hostname, so phones can use either.
IPS=$(hostname -I 2>/dev/null || true)
HOST=$(hostname)
NAMES="localhost 127.0.0.1 ::1 $HOST $HOST.local $IPS"

mkcert -install                     # trust the local CA on this PC (for the receiver tab)
mkdir -p certs
mkcert -key-file certs/key.pem -cert-file certs/cert.pem $NAMES
cp "$(mkcert -CAROOT)/rootCA.pem" certs/rootCA.pem   # public part only, for phones

echo
echo "Done. Certificates are in ./certs (valid for: $NAMES)"
echo "Restart the server. Then on each phone open  https://<this-pc-ip>:3000/ca.pem  (accept the warning once) and install it: see docs/DEPLOY.md"
echo "Never share certs/key.pem or the rootCA-key.pem file inside $(mkcert -CAROOT)."
