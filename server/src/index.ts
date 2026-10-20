import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0'; // 0.0.0.0 = reachable from other devices on the LAN

const app = express();
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Unknown API routes return JSON, not the React page.
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

// In production, serve the built React app from client/dist.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Any other path (e.g. /receiver) loads index.html; React decides what to show.
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, HOST, () => {
  console.log(`Office Call server running on http://${HOST}:${PORT}`);
});
