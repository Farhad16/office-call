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
