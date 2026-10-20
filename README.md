# Office Call

Request tea, coffee, snacks or help with one tap. The office computer announces it in Bengali.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design, schema and events.

## Requirements

- Node.js 20+ (`node -v`)

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

- App: http://localhost:5173 (other devices: `http://<office-pc-ip>:5173`)
- API: http://localhost:3000/api/health

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

The receiver uses the voices built into the browser and picks one in this order:
Bengali (bn-BD) → any Bengali → English. **Voice settings** lets you choose the voice,
speed, a chime, and saying each announcement twice. A Bengali voice speaks Bengali
sentences. Any other voice speaks English sentences.

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

## Data

- Database file: `server/data/office.db` (SQLite). Change with `DB_PATH=/path/to/file.db`.
- Back up by copying the file while the server is stopped.
- Add or change drinks/snacks in `shared/catalog.ts`, then rebuild and restart.

## Code checks

```bash
npm run lint          # ESLint: finds bugs and bad patterns
npm run format        # Prettier: auto-formats all files
npm run check         # lint + format check + build (run before committing)
```

## Production (office computer)

```bash
npm run build
npm start
```

Open `http://<office-pc-ip>:3000`. Find the IP with `hostname -I`.
