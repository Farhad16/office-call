# Office Call — Architecture

## Overview

```
 Phones / laptops (PWA)                 Office computer (Linux)
 ┌──────────────────┐   HTTP + WS      ┌──────────────────────────────┐
 │ React app        │ ───────────────▶ │ Node + Express + Socket.IO   │
 │ - name entry     │                  │ - REST API (/api/*)          │
 │ - drinks/snacks  │ ◀─── events ──── │ - SQLite (data/office.db)    │
 │ - presets        │                  │ - serves built React app     │
 └──────────────────┘                  └──────────────┬───────────────┘
                                                      │ Socket.IO
                                       ┌──────────────▼───────────────┐
                                       │ Speaker page (/receiver)    │
                                       │ open in browser on same PC   │
                                       │ → Bengali text → speaker     │
                                       └──────────────────────────────┘
```

- One server, one port (3000). In production the server also serves the built frontend,
  so the app, API and Socket.IO share one address. All URLs in the app are relative.
- Creating a request is a normal HTTP `POST`. The server saves it first, then pushes it to
  the receiver over Socket.IO. The user sees "sent" only after the server says it saved it.
- The receiver turns structured request data into a Bengali sentence and speaks it.
  Announcements go through a queue, so one never cuts off another.

## Folder structure

```
office-call/
├── package.json            # npm workspaces + root scripts
├── docs/                   # ARCHITECTURE.md, DEPLOY.md
├── deploy/                 # make-certs.sh, install-service.sh, receiver-autostart.sh
├── certs/                  # HTTPS files (created on the office PC, not in git)
├── client/                 # React + TypeScript + Vite (PWA)
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx, App.tsx
│       ├── components/     # NameEntry, DrinkSection, SnackSection, ...
│       ├── pages/          # OrderPage, ReceiverPage (/receiver)
│       └── lib/            # api, socket, speech, announcement queue
├── shared/                 # used by client AND server
│   ├── catalog.ts          # default drinks/snacks/options
│   ├── selection.ts        # validation + summary
│   ├── announce.ts         # Bengali/English sentence builder
│   └── names.ts            # name rules
└── server/                 # Express + Socket.IO + SQLite
    ├── data/               # office.db lives here (created at runtime)
    └── src/
        ├── index.ts        # HTTP server, static files, Socket.IO
        ├── db.ts           # schema + queries
        └── routes/         # users + presets, requests
```

## UI

- CSS Modules plus design tokens (colors, radius, shadows) on `:root` in
  `client/src/index.css`, with a dark theme via `prefers-color-scheme`.
- Shared pieces in `client/src/components/ui/`: `Button`, `Badge`, `Switch`,
  `Segmented`, `Confirm` (styled dialog via `useConfirm()`).
- Libraries: `sonner` (toasts), `lucide-react` (icons), `@formkit/auto-animate`
  (list animations), `@fontsource-variable/inter` + `@fontsource/noto-sans-bengali`
  (fonts bundled, so they work offline and on Linux PCs without Bengali fonts).

## Identity

- A user is identified by their **name only**. The server stores a normalised key
  (`trim` + lowercase + single spaces), so "Farhad" and " farhad " are the same person.
- The name is remembered on the device in `localStorage`.
- Presets are tied to the user on the server, so the same name on another device sees
  the same presets.

**Limitations (by design, internal tool only):**

- Anyone can type anyone's name and see or edit that person's presets.
- Two people with the same name share one identity. Use a nickname to avoid this.
- Never store anything private in presets or custom requests.
- **Change name** renames you and keeps your presets. It fails if the new name is taken.
- **Switch user** forgets the name on this device so someone else can sign in.
- After a rename, other devices still remember the old name. Signing in there with the
  old name creates a new, empty user. Sign in with the new name instead.

### Receivers (staff) and senders

Anyone who sends a request is a **sender**. A **receiver** is a staff member who handles
requests. (In code and the database this is `isStaff` / `users.is_staff`.)

- Ticking **I am a receiver** when signing in turns it on for that name. Signing in later
  without ticking it does **not** turn it off. To turn it off, click your name in the header
  and untick it.
- The **server** checks every rule, not only the UI:

| Action                      | Sender                | Receiver          |
| --------------------------- | --------------------- | ----------------- |
| View dashboard              | ✅                    | ✅                |
| Change status               | ❌ (`403`)            | ✅                |
| Delete own order            | ✅ if Pending or Done | ✅ same as sender |
| Delete someone else's order | ❌                    | ✅ only if Done   |

- **Delete erases the order permanently.** It can't be undone.
- **This is not real security.** Anyone can tick the box or type a receiver's name. It
  only stops mistakes. Real protection would need a PIN or password checked by the server.

## Database schema (SQLite)

Item definitions (drinks, snacks, options) live in a config file (`shared/catalog.ts`),
not the database. Adding an item means editing one file and restarting. A DB table can
replace it later if an admin screen is needed.

```sql
CREATE TABLE users (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,              -- display name as typed
  name_key   TEXT NOT NULL UNIQUE,       -- normalised, used for lookup
  is_staff   INTEGER NOT NULL DEFAULT 0, -- may change request status
  created_at TEXT NOT NULL
);

CREATE TABLE presets (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  selection  TEXT NOT NULL,              -- JSON, see "Selection" below
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE requests (
  id                INTEGER PRIMARY KEY,
  client_request_id TEXT NOT NULL UNIQUE,  -- stops duplicate submissions
  user_id           INTEGER NOT NULL REFERENCES users(id),
  user_name         TEXT NOT NULL,         -- requester's name at the time of the request
  type              TEXT NOT NULL CHECK (type IN ('order', 'call')),
  selection         TEXT,                  -- JSON, NULL for 'call'
  search_text       TEXT NOT NULL,         -- lowercase name + summary, for history search
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'done')),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,         -- any change (status or announced)
  announced_at      TEXT,                  -- NULL until the receiver has spoken it
  completed_at      TEXT,                  -- set when status becomes 'done'
  completed_by      TEXT                   -- staff display name
);
CREATE INDEX idx_requests_status_created ON requests(status, created_at);
CREATE INDEX idx_requests_completed ON requests(completed_at);
```

All times are ISO-8601 UTC strings. Done requests are never deleted, so History is
just `status = 'done'`.

**Upgrades:** `PRAGMA user_version` holds the schema version (now 2). On start, an older
database is upgraded once, inside a transaction. Requests made before version 2 become
`done`, so they appear in History and not in the queue.

### Selection (JSON stored in `presets.selection` and `requests.selection`)

```json
{
  "drinks": [{ "itemId": "tea", "qty": 1, "options": { "sugar": "less", "ginger": true, "lemon": true } }],
  "snacks": [
    { "itemId": "chanachur", "qty": 1 },
    { "itemId": "biscuit", "qty": 2 }
  ],
  "custom": "এক গ্লাস পানি"
}
```

Item IDs point into the config. Unknown IDs are rejected by the server.

## API

| Method | Path                           | Purpose                                                       |
| ------ | ------------------------------ | ------------------------------------------------------------- |
| GET    | /api/health                    | Server alive check                                            |
| GET    | /api/items                     | Drinks, snacks and their options                              |
| POST   | /api/users                     | Sign in by name; `isStaff: true` = staff                      |
| PATCH  | /api/users/:userId             | Change name and/or `isStaff`                                  |
| GET    | /api/users/:userId/presets     | List this user's presets                                      |
| POST   | /api/users/:userId/presets     | Create preset                                                 |
| PUT    | /api/users/:userId/presets/:id | Edit preset (only if it belongs to user)                      |
| DELETE | /api/users/:userId/presets/:id | Delete preset (only if it belongs to user)                    |
| POST   | /api/requests                  | Create order or call; returns saved row                       |
| GET    | /api/requests/recent           | Recent requests (receiver page)                               |
| GET    | /api/requests/active?since=    | Pending + in progress, oldest first; done count since `since` |
| GET    | /api/requests/history?q=       | Done, newest first; search name/content; `limit`, `offset`    |
| PATCH  | /api/requests/:id/status       | Staff only. Body `{ userId, status }`                         |

Errors always come back as `{ "ok": false, "error": "<message for the user>" }`.

## Socket.IO events

| Event               | Direction            | Payload                          | Meaning                                             |
| ------------------- | -------------------- | -------------------------------- | --------------------------------------------------- |
| `receiver:join`     | receiver → server    | — (ack returns pending requests) | Receiver registers; gets anything not yet announced |
| `request:new`       | server → all clients | full request                     | Receiver announces it; dashboards add it            |
| `request:announced` | receiver → server    | `{ id }`                         | Receiver finished speaking it                       |
| `request:updated`   | server → all clients | full request                     | Announced or status changed. **Never announced.**   |
| `receiver:status`   | server → all clients | `{ online: boolean }`            | Shows if the speaker is listening                   |

Socket.IO reconnects by itself after network drops. On reconnect the receiver sends
`receiver:join` again and picks up any requests it missed.

### Delivery rules

- `POST /api/requests` body: `{ clientRequestId, userId, type: "order" | "call", selection? }`.
  Response: `{ request, receiverOnline }`.
- The server saves first, then emits `request:new`. The app shows "sent" only after a
  successful response.
- `clientRequestId` is random per request. A retry of the same request reuses it, so a
  lost response never creates a duplicate.
- After a successful send the button is disabled for 4 seconds (stops double taps).
- At most 10 requests per user per minute (`429` after that).
- When a receiver joins, it gets requests not yet announced from the **last 30 minutes**.
  Older ones are too stale to announce, but still appear in history.
- Open **one** receiver tab only. Every receiver tab announces every request.

### Dashboard rules (`/dashboard`)

- Status moves forward only: `pending → in_progress → done`. `pending → done` is also
  allowed. `done` is final.
- Concurrent clicks are safe: the read and the write happen in one transaction, and the
  write only applies `WHERE status = <the status just read>`. The second click gets
  `409 This request is already done by Karim.`
- Dashboards apply `request:new` / `request:updated` directly and reload after a
  reconnect. "Completed today" counts from the viewer's local midnight.
- If a request is marked done or deleted before the speaker has said it, the speaker
  drops it from its queue ("Done before announced" / "Deleted").
- Bulk delete: tick cards, or **Select all I can delete**, then **Delete selected**. Only
  cards the viewer may delete get a checkbox. The server deletes what is allowed, in one
  transaction, and reports the rest. If an order moves to In Progress while it is ticked,
  its checkbox disappears.

## Announcements

`shared/announce.ts` builds the sentence from the request data and the catalog's `bn`
words. Nothing is hard-coded per combination:

- Drinks: `<name> <count> <drink> চেয়েছে, <choice words>, <toggles> দিয়ে।`
- Snacks after drinks: `সাথে <a>, <b> আর <c>।`. Snacks only: `<name> <list> চেয়েছে।`
- Custom text: `আরও বলেছে: <text>।`, or `<name> বলেছে: <text>।` when it is the only thing.
- Call: `<name> ডাকছে।`

A new option only needs `bn` text in the catalog. The receiver plays a chime, then speaks.
Requests wait in a queue and are spoken one at a time; the same id is never spoken twice.

## Implementation plan

1. **Setup + name entry** — workspaces, Vite app, Express skeleton, remember name.
2. **Request builder** — drinks with options, snacks with quantities, custom text, summary.
3. **SQLite + presets** — schema, users, preset CRUD API and UI.
4. **Real-time delivery** — `POST /api/requests`, duplicate guard, Socket.IO push.
5. **Receiver** — Bengali sentence generator, voice detection, queue, history, test button.
6. **PWA + LAN** — manifest, service worker, HTTPS with mkcert, systemd service, docs.
