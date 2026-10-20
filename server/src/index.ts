import express, { type ErrorRequestHandler } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CATALOG } from '../../shared/catalog.js';
import { UserError, db } from './db.js';
import { usersRouter } from './routes/users.js';
import { requestsRouter } from './routes/requests.js';
import { closeRealtime, setupRealtime } from './realtime.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0'; // 0.0.0.0 = reachable from other devices on the LAN

// Project root = the folder containing client/ and server/ (works from src/ and dist/).
function findRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!(fs.existsSync(path.join(dir, 'client')) && fs.existsSync(path.join(dir, 'server')))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Cannot find the project folder.');
    dir = parent;
  }
  return dir;
}
const ROOT = findRoot();
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
const CERT_DIR = process.env.CERT_DIR ?? path.join(ROOT, 'certs');
const KEY_FILE = path.join(CERT_DIR, 'key.pem');
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const CA_FILE = path.join(CERT_DIR, 'rootCA.pem'); // public CA certificate for phones (never the key)

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

// Phones download this once to trust the office HTTPS certificate (see docs/DEPLOY.md).
app.get('/ca.pem', (_req, res) => {
  if (!fs.existsSync(CA_FILE)) {
    res.status(404).type('text/plain').send('No CA certificate. See docs/DEPLOY.md.');
    return;
  }
  res.type('application/x-x509-ca-cert').attachment('office-call-ca.pem').sendFile(CA_FILE);
});

// Serve the built React app.
if (fs.existsSync(CLIENT_DIST)) {
  app.use(
    express.static(CLIENT_DIST, {
      setHeaders(res, file) {
        // Hashed files never change; everything else must be re-checked so updates arrive.
        if (file.includes(`${path.sep}assets${path.sep}`))
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  // Any other path (e.g. /receiver) loads index.html; React decides what to show.
  app.get('/{*path}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  console.warn('client/dist not found: run "npm run build" to serve the app from this server.');
}

// HTTPS when certificate files exist, otherwise plain HTTP.
const useHttps = fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE);
const server = useHttps
  ? https.createServer({ key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE) }, app)
  : http.createServer(app);
setupRealtime(server);

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Is the server already running?`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const scheme = useHttps ? 'https' : 'http';
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `${scheme}://${i!.address}:${PORT}`);
  console.log(`Office Call server running (${useHttps ? 'HTTPS' : 'HTTP, no certificates found'})`);
  console.log(`  Receiver (this PC): ${scheme}://localhost:${PORT}/receiver`);
  for (const url of lan) console.log(`  Phones / laptops:   ${url}`);
});

// Close cleanly on Ctrl+C or systemd stop, so the database is not left mid-write.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down…`);
  closeRealtime();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
