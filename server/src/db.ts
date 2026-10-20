import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Preset, Selection, User } from '../../shared/types.js';

// Database file: server/data/office.db (override with DB_PATH).
const here = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(
  here,
  here.includes(`${path.sep}dist${path.sep}`) ? '../../../data' : '../data',
  'office.db',
);
const dbPath = process.env.DB_PATH ?? defaultPath;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL'); // safer writes, readers don't block writers
db.pragma('foreign_keys = ON');

// ISO-8601 UTC timestamp, e.g. 2026-10-20T09:15:00.000Z
const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    name_key   TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE IF NOT EXISTS presets (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    selection  TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW},
    UNIQUE (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS requests (
    id                INTEGER PRIMARY KEY,
    client_request_id TEXT NOT NULL UNIQUE,
    user_id           INTEGER NOT NULL REFERENCES users(id),
    type              TEXT NOT NULL CHECK (type IN ('order', 'call')),
    selection         TEXT,
    status            TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'announced')),
    created_at        TEXT NOT NULL DEFAULT ${NOW},
    announced_at      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at);
`);

console.log(`Database: ${dbPath}`);

/** Thrown for errors the user can fix; the message is shown to them. */
export class UserError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

// ---------- users ----------

const findUserByKey = db.prepare<[string], User>('SELECT id, name FROM users WHERE name_key = ?');
const findUserById = db.prepare<[number], User>('SELECT id, name FROM users WHERE id = ?');
const insertUser = db.prepare<[string, string]>('INSERT INTO users (name, name_key) VALUES (?, ?)');
const updateUserName = db.prepare<[string, string, number]>('UPDATE users SET name = ?, name_key = ? WHERE id = ?');

export function getUser(id: number): User | undefined {
  return findUserById.get(id);
}

/** Finds the user with this name, or creates them. The display name follows the latest spelling. */
export function getOrCreateUser(name: string, key: string): User {
  const existing = findUserByKey.get(key);
  if (existing) {
    if (existing.name !== name) updateUserName.run(name, key, existing.id);
    return { id: existing.id, name };
  }
  const info = insertUser.run(name, key);
  return { id: Number(info.lastInsertRowid), name };
}

/** Renames a user and keeps their presets. Fails if another user already has the name. */
export function renameUser(id: number, name: string, key: string): User {
  try {
    const info = updateUserName.run(name, key, id);
    if (info.changes === 0) throw new UserError('User not found.', 404);
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError('Someone already uses this name. Pick another one.', 409);
    throw err;
  }
  return { id, name };
}

// ---------- presets ----------

type PresetRow = { id: number; name: string; selection: string; updated_at: string };

function toPreset(row: PresetRow): Preset {
  return { id: row.id, name: row.name, selection: JSON.parse(row.selection) as Selection, updatedAt: row.updated_at };
}

const listPresetRows = db.prepare<[number], PresetRow>(
  'SELECT id, name, selection, updated_at FROM presets WHERE user_id = ? ORDER BY name COLLATE NOCASE',
);
const getPresetRow = db.prepare<[number, number], PresetRow>(
  'SELECT id, name, selection, updated_at FROM presets WHERE id = ? AND user_id = ?',
);
const insertPreset = db.prepare<[number, string, string]>(
  'INSERT INTO presets (user_id, name, selection) VALUES (?, ?, ?)',
);
const updatePresetRow = db.prepare<[string, string, number, number]>(
  `UPDATE presets SET name = ?, selection = ?, updated_at = ${NOW} WHERE id = ? AND user_id = ?`,
);
const deletePresetRow = db.prepare<[number, number]>('DELETE FROM presets WHERE id = ? AND user_id = ?');

const DUPLICATE_PRESET = 'You already have a preset with this name.';

export function listPresets(userId: number): Preset[] {
  return listPresetRows.all(userId).map(toPreset);
}

export function createPreset(userId: number, name: string, selection: Selection): Preset {
  try {
    const info = insertPreset.run(userId, name, JSON.stringify(selection));
    return toPreset(getPresetRow.get(Number(info.lastInsertRowid), userId)!);
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError(DUPLICATE_PRESET, 409);
    throw err;
  }
}

/** Only updates presets owned by `userId`. */
export function updatePreset(userId: number, id: number, name: string, selection: Selection): Preset {
  try {
    const info = updatePresetRow.run(name, JSON.stringify(selection), id, userId);
    if (info.changes === 0) throw new UserError('Preset not found.', 404);
    return toPreset(getPresetRow.get(id, userId)!);
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError(DUPLICATE_PRESET, 409);
    throw err;
  }
}

/** Only deletes presets owned by `userId`. */
export function deletePreset(userId: number, id: number): void {
  const info = deletePresetRow.run(id, userId);
  if (info.changes === 0) throw new UserError('Preset not found.', 404);
}
