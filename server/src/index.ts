import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { DEFAULT_CATALOG } from '../../shared/catalog.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0'; // 0.0.0.0 = reachable from other devices on the LAN

const app = express();
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Drinks, snacks and options shown in the app.
app.get('/api/items', (_req, res) => {
  res.json(DEFAULT_CATALOG);
});

// Unknown API routes return JSON, not the React page.
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

// In production, serve the built React app from client/dist.
// Walks up from this file until it finds client/dist (works from src/ and dist/).
function findClientDist(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = path.join(dir, 'client', 'dist');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
const clientDist = findClientDist();
if (clientDist) {
  app.use(express.static(clientDist));
  // Any other path (e.g. /receiver) loads index.html; React decides what to show.
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, HOST, () => {
  console.log(`Office Call server running on http://${HOST}:${PORT}`);
});
