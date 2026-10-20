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
                                       │ Receiver page (/receiver)    │
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
├── docs/ARCHITECTURE.md
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

## Database schema (SQLite)

Item definitions (drinks, snacks, options) live in a config file (`shared/catalog.ts`),
not the database. Adding an item means editing one file and restarting. A DB table can
replace it later if an admin screen is needed.

```sql
CREATE TABLE users (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,              -- display name as typed
  name_key   TEXT NOT NULL UNIQUE,       -- normalised, used for lookup
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE presets (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  selection  TEXT NOT NULL,              -- JSON, see "Selection" below
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);

CREATE TABLE requests (
  id                INTEGER PRIMARY KEY,
  client_request_id TEXT NOT NULL UNIQUE,  -- stops duplicate submissions
  user_id           INTEGER NOT NULL REFERENCES users(id),
  type              TEXT NOT NULL CHECK (type IN ('order', 'call')),
  selection         TEXT,                  -- JSON, NULL for 'call'
  status            TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received', 'announced')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  announced_at      TEXT
);
CREATE INDEX idx_requests_created ON requests(created_at);
```

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

| Method | Path                           | Purpose                                    |
| ------ | ------------------------------ | ------------------------------------------ |
| GET    | /api/health                    | Server alive check                         |
| GET    | /api/items                     | Drinks, snacks and their options           |
| POST   | /api/users                     | Sign in: get-or-create user by name        |
| PATCH  | /api/users/:userId             | Change display name (keeps presets)        |
| GET    | /api/users/:userId/presets     | List this user's presets                   |
| POST   | /api/users/:userId/presets     | Create preset                              |
| PUT    | /api/users/:userId/presets/:id | Edit preset (only if it belongs to user)   |
| DELETE | /api/users/:userId/presets/:id | Delete preset (only if it belongs to user) |
| POST   | /api/requests                  | Create order or call; returns saved row    |
| GET    | /api/requests/recent           | Recent history (receiver page)             |

Errors always come back as `{ "ok": false, "error": "<message for the user>" }`.

## Socket.IO events

| Event               | Direction            | Payload                                        | Meaning                                             |
| ------------------- | -------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `receiver:join`     | receiver → server    | — (ack returns pending requests)               | Receiver registers; gets anything not yet announced |
| `request:new`       | server → receivers   | `{ id, userName, type, selection, createdAt }` | New request to announce                             |
| `request:announced` | receiver → server    | `{ id }`                                       | Receiver finished speaking it                       |
| `request:status`    | server → all clients | `{ id, status }`                               | Requester sees "announced"                          |
| `receiver:status`   | server → all clients | `{ online: boolean }`                          | Shows if the speaker is listening                   |

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
