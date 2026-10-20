# Office Call

Request tea, coffee, snacks or help with one tap. The office computer announces it in Bengali.

- **Office PC setup, phones, HTTPS, troubleshooting:** [docs/DEPLOY.md](docs/DEPLOY.md)
- **Design, schema, API and events:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Quick start (office computer)

```bash
npm install
npm run build
npm start                          # prints the addresses for phones
```

- App: `http://<office-pc-ip>:3000`. Find the IP with `hostname -I`.
- Receiver (speaker): `http://localhost:3000/receiver` in Chrome on the office PC.
- Dashboard: the **Dashboard** tab (`/dashboard`) shows the live queue and history.
  Tick **I am staff** when signing in to change request status.

For start-at-boot, HTTPS and installing the app on phones, follow [docs/DEPLOY.md](docs/DEPLOY.md).

## Requirements

- Node.js 20+ (`node -v`)
- Google Chrome on the office PC (for the receiver)

## Development

```bash
npm run dev
```

- App: http://localhost:5173 (other devices: `http://<office-pc-ip>:5173`)
- API: http://localhost:3000/api/health
- The installable-app files (service worker) are only made by `npm run build`, so test
  installing with `npm start`, not `npm run dev`.

## Receiver (office speaker)

1. On the office computer, open **Google Chrome** at `http://localhost:3000/receiver`
   (dev: `http://localhost:5173/receiver`). Plug in the speaker.
2. Click **🔊 Start receiver** once. Browsers block sound until you click on the page.
3. Click **Test order** and **Test call** to check the voice.
4. Leave the tab open and visible all day. Open only **one** receiver tab: every tab
   announces every request.

If the page is reloaded or the network drops, it reconnects by itself. Requests from the
last 30 minutes that were not announced yet get announced after it reconnects.

## Voice

The receiver uses the voices built into the browser. Pick the **Announcement language**
on the receiver page:

- **Auto** (default): Bengali if a Bengali voice is installed, otherwise English.
- **বাংলা**: always Bengali. A red warning appears if no Bengali voice is installed.
- **English**: always English.

The choice is saved in that browser. **Voice settings** also lets you pick a specific
voice, the speed, a chime, and saying each announcement twice. Changing the language
switches back to the automatic voice for that language.

**Linux:** Chrome has no Bengali voice of its own. Install the system speech engine:

```bash
sudo apt install speech-dispatcher espeak-ng
spd-say -l bn "পরীক্ষা"     # should speak; if silent, check the speaker/volume
```

Restart Chrome and reload the receiver. It should say "Bengali voice found". If Chrome
lists no voices at all, start it with `google-chrome --enable-speech-dispatcher`.

espeak-ng works offline, but the voice sounds robotic. For a natural Bengali voice later:

- Add a server endpoint, e.g. `GET /api/tts?text=...`, that returns an audio file made by a
  better engine:
  - Cloud engines need internet and an account: Azure (`bn-BD-NabanitaNeural`) or Google Cloud TTS.
  - Offline: Meta MMS-TTS (`facebook/mms-tts-ben`), running in Python.
- In the receiver, change `speak()` in `client/src/lib/speech.ts` so it plays that audio
  with an `<audio>` element. The queue, sentence builder and everything else stay the same.

## Configuration

| Setting                 | How                                                            |
| ----------------------- | -------------------------------------------------------------- |
| Port                    | `PORT=3000` (default)                                          |
| Database file           | `DB_PATH=/path/to/office.db` (default `server/data/office.db`) |
| HTTPS                   | put `key.pem` + `cert.pem` in `certs/` (or set `CERT_DIR`)     |
| Drinks, snacks, options | edit `shared/catalog.ts`, then rebuild and restart             |

## Code checks

```bash
npm run lint          # ESLint: finds bugs and bad patterns
npm run format        # Prettier: auto-formats all files
npm run check         # lint + format check + build (run before committing)
```
