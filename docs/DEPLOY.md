# Deploying Office Call on the office computer (Linux)

The office computer runs the server **and** the receiver page (speaker). Phones and laptops
on the office Wi-Fi open the app in a browser.

```
Phone ──Wi-Fi──▶ office PC :3000 (server) ──▶ Chrome tab /receiver ──▶ speaker
```

## 1. Install

```bash
# Node.js 20+ and Chrome must be installed
node -v
cd ~/office-call            # wherever you copied the project
npm install
npm run build
```

## 2. Give the office PC a fixed IP address

Phones connect to the PC's IP address, for example `192.168.1.20`. If the IP changes, phones
can't find the server. In the office router settings, reserve an IP for this PC. Routers
call this a "DHCP reservation" or "static lease".

Find the current IP with `hostname -I`.

## 3. HTTPS (needed to install the app on phones)

Without HTTPS the app still works at `http://<pc-ip>:3000`, but phones can't install it as an
app. Browsers only allow installing from secure pages.

```bash
sudo apt install mkcert libnss3-tools
bash deploy/make-certs.sh
```

This creates `certs/key.pem`, `certs/cert.pem` and `certs/rootCA.pem`. The server
switches to HTTPS automatically when they exist. **Run it again if the PC's IP changes.**

`certs/` is ignored by git. Never share `certs/key.pem`, or the `rootCA-key.pem` file in the
folder shown by `mkcert -CAROOT`.

## 4. Run the server as a service (starts at boot)

```bash
bash deploy/install-service.sh
```

| Task             | Command                              |
| ---------------- | ------------------------------------ |
| Status           | `systemctl status office-call`       |
| Live logs        | `journalctl -u office-call -f`       |
| Restart          | `sudo systemctl restart office-call` |
| Stop             | `sudo systemctl stop office-call`    |
| Remove from boot | `sudo systemctl disable office-call` |

At startup the log prints the addresses to use, for example `Phones / laptops: https://192.168.1.20:3000`.

## 5. Receiver and speaker

```bash
sudo apt install speech-dispatcher espeak-ng   # Linux voices, includes Bengali
spd-say -l bn "পরীক্ষা"                         # should speak through the speaker
bash deploy/receiver-autostart.sh              # open the receiver at every login
```

After the next login, Chrome opens `/receiver?autostart=1` and starts by itself. If it
shows **"The browser blocked automatic sound"**, click **Start receiver** once. That happens
when Chrome was already running before login, because then Chrome ignores the startup
settings that allow sound without a click.

Check it with **Test order** and **Test call**. Choose **বাংলা / English / Auto** on the
receiver page. Keep the tab open and don't minimise it.

Turn off screen sleep and suspend in the Linux power settings, so the PC stays awake
during office hours.

## 6. Phones

1. Connect to the office Wi-Fi.
2. **With HTTPS only:** trust the office certificate once per phone:
   - Open `https://<pc-ip>:3000/ca.pem`. Accept the security warning this one time.
   - **Android:** Settings → Security → More security settings → Encryption & credentials →
     Install a certificate → **CA certificate** → pick `office-call-ca.pem`.
     The exact menu names differ by phone; search Settings for "certificate".
   - **iPhone:** Allow the download. Then Settings → **Profile Downloaded** → Install. Then
     Settings → General → About → **Certificate Trust Settings** → turn on the mkcert entry.
3. Open `https://<pc-ip>:3000` (or `http://` without HTTPS) and enter your name.
4. Install the app:
   - **Android Chrome:** menu ⋮ → **Install app** (or **Add to Home screen**).
   - **iPhone Safari:** Share → **Add to Home Screen**.

Laptops: open the same address. To install the app, add `rootCA.pem` to the system's
trusted certificates. Otherwise just use it in the browser.

## 7. Updating

```bash
cd ~/office-call
git pull            # or copy the new files
npm install
npm run build
sudo systemctl restart office-call
```

Then reload the receiver tab and click Start. Installed phone apps update themselves the
next time they are opened.

To add drinks or snacks, edit `shared/catalog.ts`, then rebuild and restart as above.

## 8. Backups

All data (users, presets, request history) is in `server/data/office.db`.

```bash
sudo systemctl stop office-call
cp server/data/office.db ~/office-call-backup-$(date +%F).db
sudo systemctl start office-call
```

## 9. Outside the office network

The server is only reachable on the office LAN or Wi-Fi. Using it from home or mobile
data needs extra setup, which this project doesn't include:

- a VPN into the office network (e.g. WireGuard or Tailscale), or
- hosting the server on the internet with a real domain and certificate, plus proper
  login. Name-only identity is not safe on the internet.

## 10. Troubleshooting

| Problem                                         | Fix                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone can't open the app                        | Same Wi-Fi as the PC? Check the IP with `hostname -I`. Check the firewall: `sudo ufw allow 3000/tcp`. Check `systemctl status office-call`. Some guest Wi-Fi networks block devices from reaching each other. |
| "Not connected to the office server" in the app | Server stopped or Wi-Fi dropped. It reconnects by itself. Check `journalctl -u office-call -f`.                                                                                                               |
| App says "Speaker offline"                      | Receiver tab is closed or not started. Open `/receiver` on the PC and click Start.                                                                                                                            |
| No sound                                        | Check the speaker and volume. Run `spd-say "test"`. Click **Test call** on the receiver. Make sure the tab has not been muted (right-click the tab).                                                          |
| "No Bengali voice found"                        | `sudo apt install speech-dispatcher espeak-ng`, then fully restart Chrome. If Chrome lists no voices at all, start it with `google-chrome --enable-speech-dispatcher`.                                        |
| "বাংলা is selected, but … cannot speak Bengali" | Same as above, or choose **English**.                                                                                                                                                                         |
| Every request is announced twice                | Two receiver tabs are open. Close one. Or "Say every announcement twice" is turned on.                                                                                                                        |
| Phone shows a certificate warning               | Install the CA on the phone (step 6). If the PC's IP changed, run `bash deploy/make-certs.sh` again and restart the server.                                                                                   |
| "Port 3000 is already in use"                   | The server is already running (maybe as the service). Check `systemctl status office-call`.                                                                                                                   |
| "Someone already uses this name"                | Pick a different name, e.g. add an initial.                                                                                                                                                                   |
| Old version still showing on a phone            | Close the app completely and open it again.                                                                                                                                                                   |

## Limitations (by design)

- Identity is **name only**. Anyone can type any name and use that person's presets. This
  is fine for an internal office tool. Don't store anything private.
- Two people with the same name share one identity. Use nicknames or initials.
- One receiver, on the office PC. Requests sent while it is off are announced when it
  starts, if they are less than 30 minutes old. Older ones only appear in history.
