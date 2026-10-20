import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CATALOG } from '../../shared/catalog.js';
import { summarizeSelection } from '../../shared/selection.js';
import {
  NEXT_STATUSES,
  type OfficeRequest,
  type Preset,
  type RequestStatus,
  type RequestType,
  type Selection,
  type User,
} from '../../shared/types.js';

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

const REQUESTS_TABLE = (name: string) => `
  CREATE TABLE ${name} (
    id                INTEGER PRIMARY KEY,
    client_request_id TEXT NOT NULL UNIQUE,
    user_id           INTEGER NOT NULL REFERENCES users(id),
    user_name         TEXT NOT NULL,              -- requester's name at the time of the request
    type              TEXT NOT NULL CHECK (type IN ('order', 'call')),
    selection         TEXT,                       -- JSON, NULL for 'call'
    search_text       TEXT NOT NULL DEFAULT '',   -- lowercase name + summary, for history search
    status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
    created_at        TEXT NOT NULL DEFAULT ${NOW},
    updated_at        TEXT NOT NULL DEFAULT ${NOW},
    announced_at      TEXT,                       -- NULL until the receiver has spoken it
    completed_at      TEXT,
    completed_by      TEXT                        -- staff display name
  )`;

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    name_key   TEXT NOT NULL UNIQUE,
    is_staff   INTEGER NOT NULL DEFAULT 0,
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
`);

const hasColumn = (table: string, column: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === column);
const hasTable = (table: string) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);

// Schema version 2 adds the dashboard fields. Older databases are upgraded once.
const SCHEMA_VERSION = 2;
if ((db.pragma('user_version', { simple: true }) as number) < SCHEMA_VERSION) {
  db.transaction(() => {
    if (!hasColumn('users', 'is_staff')) db.exec('ALTER TABLE users ADD COLUMN is_staff INTEGER NOT NULL DEFAULT 0');
    if (!hasTable('requests')) {
      db.exec(REQUESTS_TABLE('requests'));
    } else if (!hasColumn('requests', 'completed_at')) {
      // Old table: status meant "announced or not". Requests from before the dashboard
      // existed are treated as done, so they show in History, not in the queue.
      db.exec(REQUESTS_TABLE('requests_v2'));
      db.exec(`
        INSERT INTO requests_v2 (id, client_request_id, user_id, user_name, type, selection, status,
                                 created_at, updated_at, announced_at, completed_at)
        SELECT r.id, r.client_request_id, r.user_id, u.name, r.type, r.selection, 'done',
               r.created_at, r.created_at, r.announced_at, COALESCE(r.announced_at, r.created_at)
        FROM requests r JOIN users u ON u.id = r.user_id;
        DROP TABLE requests;
        ALTER TABLE requests_v2 RENAME TO requests;
      `);
    }
    db.exec(`
      DROP INDEX IF EXISTS idx_requests_created;
      CREATE INDEX IF NOT EXISTS idx_requests_status_created ON requests(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_requests_completed ON requests(completed_at);
    `);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
}

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

type UserRow = { id: number; name: string; is_staff: number };
const toUser = (row: UserRow): User => ({ id: row.id, name: row.name, isStaff: row.is_staff === 1 });

const findUserByKey = db.prepare<[string], UserRow>('SELECT id, name, is_staff FROM users WHERE name_key = ?');
const findUserById = db.prepare<[number], UserRow>('SELECT id, name, is_staff FROM users WHERE id = ?');
const insertUser = db.prepare<[string, string, number]>(
  'INSERT INTO users (name, name_key, is_staff) VALUES (?, ?, ?)',
);
const updateUserName = db.prepare<[string, string, number]>('UPDATE users SET name = ?, name_key = ? WHERE id = ?');
const updateUserStaff = db.prepare<[number, number]>('UPDATE users SET is_staff = ? WHERE id = ?');

export function getUser(id: number): User | undefined {
  const row = findUserById.get(id);
  return row && toUser(row);
}

/**
 * Finds the user with this name, or creates them. The display name follows the latest
 * spelling. `staff: true` turns staff mode on; false leaves it as it was.
 */
export function getOrCreateUser(name: string, key: string, staff: boolean): User {
  const existing = findUserByKey.get(key);
  if (existing) {
    if (existing.name !== name) updateUserName.run(name, key, existing.id);
    if (staff && !existing.is_staff) updateUserStaff.run(1, existing.id);
    return getUser(existing.id)!;
  }
  const info = insertUser.run(name, key, staff ? 1 : 0);
  return getUser(Number(info.lastInsertRowid))!;
}

/** Renames a user (keeping presets) and/or changes staff mode. Fails if the name is taken. */
export function updateUser(id: number, changes: { name?: string; key?: string; isStaff?: boolean }): User {
  if (!getUser(id)) throw new UserError('User not found.', 404);
  try {
    db.transaction(() => {
      if (changes.name && changes.key) updateUserName.run(changes.name, changes.key, id);
      if (changes.isStaff !== undefined) updateUserStaff.run(changes.isStaff ? 1 : 0, id);
    })();
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError('Someone already uses this name. Pick another one.', 409);
    throw err;
  }
  return getUser(id)!;
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

// ---------- requests ----------

type RequestRow = {
  id: number;
  user_id: number;
  user_name: string;
  type: RequestType;
  selection: string | null;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
  announced_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
};

function toRequest(row: RequestRow): OfficeRequest {
  return {
    id: row.id,
    userName: row.user_name,
    type: row.type,
    selection: row.selection ? (JSON.parse(row.selection) as Selection) : null,
    status: row.status,
    announced: row.announced_at !== null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
  };
}

const COLUMNS = `id, user_id, user_name, type, selection, status, created_at, updated_at,
  announced_at, completed_at, completed_by`;

const insertRequestRow = db.prepare<[string, number, string, RequestType, string | null, string]>(
  `INSERT INTO requests (client_request_id, user_id, user_name, type, selection, search_text)
   VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (client_request_id) DO NOTHING`,
);
const getRequestByClientId = db.prepare<[string], RequestRow>(
  `SELECT ${COLUMNS} FROM requests WHERE client_request_id = ?`,
);
const getRequestById = db.prepare<[number], RequestRow>(`SELECT ${COLUMNS} FROM requests WHERE id = ?`);
const countRecentByUser = db.prepare<[number], { n: number }>(
  `SELECT COUNT(*) AS n FROM requests WHERE user_id = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')`,
);
const markAnnouncedRow = db.prepare<[number]>(
  `UPDATE requests SET announced_at = ${NOW}, updated_at = ${NOW} WHERE id = ? AND announced_at IS NULL`,
);
const listUnannouncedRows = db.prepare<[], RequestRow>(
  `SELECT ${COLUMNS} FROM requests WHERE announced_at IS NULL AND status != 'done'
   AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes') ORDER BY id`,
);
const listRecentRows = db.prepare<[number], RequestRow>(`SELECT ${COLUMNS} FROM requests ORDER BY id DESC LIMIT ?`);
const listActiveRows = db.prepare<[], RequestRow>(
  `SELECT ${COLUMNS} FROM requests WHERE status IN ('pending', 'in_progress') ORDER BY created_at, id`,
);
const countCompletedSince = db.prepare<[string], { n: number }>(
  `SELECT COUNT(*) AS n FROM requests WHERE status = 'done' AND completed_at >= ?`,
);
const listHistoryRows = db.prepare<[string, string, number, number], RequestRow>(
  `SELECT ${COLUMNS} FROM requests
   WHERE status = 'done' AND (? = '' OR search_text LIKE ? ESCAPE '\\')
   ORDER BY completed_at DESC, id DESC LIMIT ? OFFSET ?`,
);
// Changes status only if it is still `from`, so a stale update can never overwrite a newer one.
const setStatusRow = db.prepare<{ to: RequestStatus; from: RequestStatus; staff: string; id: number }>(
  `UPDATE requests SET
     status = @to,
     updated_at = ${NOW},
     completed_at = CASE WHEN @to = 'done' THEN ${NOW} ELSE completed_at END,
     completed_by = CASE WHEN @to = 'done' THEN @staff ELSE completed_by END
   WHERE id = @id AND status = @from`,
);

const STATUS_LABEL: Record<RequestStatus, string> = { pending: 'pending', in_progress: 'in progress', done: 'done' };

export const MAX_REQUESTS_PER_MINUTE = 10;

/** Text searched in History: requester name + English summary, lowercase. */
function searchTextOf(userName: string, type: RequestType, selection: Selection | null): string {
  const parts = [
    userName,
    type === 'call' ? 'call staff' : '',
    ...(selection ? summarizeSelection(selection, DEFAULT_CATALOG) : []),
  ];
  return parts.join(' ').toLocaleLowerCase();
}

// Fill search text for rows that don't have it yet (e.g. after the upgrade).
const setSearchText = db.prepare<[string, number]>('UPDATE requests SET search_text = ? WHERE id = ?');
for (const row of db.prepare<[], RequestRow>(`SELECT ${COLUMNS} FROM requests WHERE search_text = ''`).all()) {
  const sel = row.selection ? (JSON.parse(row.selection) as Selection) : null;
  setSearchText.run(searchTextOf(row.user_name, row.type, sel), row.id);
}

/**
 * Saves a request. If this clientRequestId was already saved (a retry), returns the
 * existing row with `created: false` so it is not announced twice.
 */
export function createRequest(
  clientRequestId: string,
  user: User,
  type: RequestType,
  selection: Selection | null,
): { request: OfficeRequest; created: boolean } {
  const existing = getRequestByClientId.get(clientRequestId);
  if (existing) {
    if (existing.user_id !== user.id) throw new UserError('Invalid request id.', 409);
    return { request: toRequest(existing), created: false };
  }
  if (countRecentByUser.get(user.id)!.n >= MAX_REQUESTS_PER_MINUTE) {
    throw new UserError('Too many requests. Please wait a minute.', 429);
  }
  insertRequestRow.run(
    clientRequestId,
    user.id,
    user.name,
    type,
    selection ? JSON.stringify(selection) : null,
    searchTextOf(user.name, type, selection),
  );
  return { request: toRequest(getRequestByClientId.get(clientRequestId)!), created: true };
}

export function getRequest(id: number): OfficeRequest | undefined {
  const row = getRequestById.get(id);
  return row && toRequest(row);
}

/** Returns the updated request, or null if it was already announced or does not exist. */
export function markAnnounced(id: number): OfficeRequest | null {
  return markAnnouncedRow.run(id).changes > 0 ? getRequest(id)! : null;
}

/** Not yet spoken, not done, from the last 30 minutes. Older ones are too stale to announce. */
export function listUnannouncedRequests(): OfficeRequest[] {
  return listUnannouncedRows.all().map(toRequest);
}

export function listRecentRequests(limit: number): OfficeRequest[] {
  return listRecentRows.all(limit).map(toRequest);
}

/** Pending + in progress, oldest first. */
export function listActiveRequests(): OfficeRequest[] {
  return listActiveRows.all().map(toRequest);
}

export function countCompletedSinceTime(sinceIso: string): number {
  return countCompletedSince.get(sinceIso)!.n;
}

/** Done requests, most recently completed first. `query` matches name or content. */
export function listHistory(
  query: string,
  limit: number,
  offset: number,
): { requests: OfficeRequest[]; hasMore: boolean } {
  const q = query.toLocaleLowerCase();
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`; // treat % and _ as normal text
  const rows = listHistoryRows.all(q, pattern, limit + 1, offset);
  return { requests: rows.slice(0, limit).map(toRequest), hasMore: rows.length > limit };
}

/**
 * Moves a request to `to` if that is allowed from its current status. The read and the
 * write happen in one transaction, and the write only applies if the status is still the
 * one just read, so when two staff click at the same time the second gets a clear error.
 */
export const setRequestStatus = db.transaction((id: number, to: RequestStatus, staffName: string): OfficeRequest => {
  const row = getRequestById.get(id);
  if (!row) throw new UserError('Request not found.', 404);
  if (!NEXT_STATUSES[row.status].includes(to)) {
    const who = row.status === 'done' && row.completed_by ? ` by ${row.completed_by}` : '';
    throw new UserError(`This request is already ${STATUS_LABEL[row.status]}${who}.`, 409);
  }
  const info = setStatusRow.run({ to, from: row.status, staff: staffName, id });
  if (info.changes === 0) throw new UserError('Someone else just updated this request. Try again.', 409);
  return getRequest(id)!;
});
