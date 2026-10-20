import express, { type ErrorRequestHandler } from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { DEFAULT_CATALOG } from '../../shared/catalog.js';
import { UserError } from './db.js';
import { usersRouter } from './routes/users.js';
import { requestsRouter } from './routes/requests.js';
import { setupRealtime } from './realtime.js';

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

app.use('/api/users', usersRouter);
app.use('/api/requests', requestsRouter);

// Unknown API routes return JSON, not the React page.
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

// Every error becomes a JSON { ok: false, error }. Unexpected errors are logged, not shown.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof UserError) {
    res.status(err.status).json({ ok: false, error: err.message });
  } else if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    res.status(400).json({ ok: false, error: 'Invalid request body.' });
  } else {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Something went wrong on the server.' });
  }
};
app.use('/api', errorHandler);

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

const httpServer = http.createServer(app);
setupRealtime(httpServer);

httpServer.listen(PORT, HOST, () => {
  console.log(`Office Call server running on http://${HOST}:${PORT}`);
});
