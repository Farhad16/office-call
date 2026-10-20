import { Router } from 'express';
import { DEFAULT_CATALOG } from '../../../shared/catalog.js';
import { validateSelection } from '../../../shared/selection.js';
import {
  NEXT_STATUSES,
  type ActiveResponse,
  type DeleteResponse,
  type CreateRequestBody,
  type HistoryResponse,
  type RequestStatus,
} from '../../../shared/types.js';
import {
  UserError,
  countCompletedSinceTime,
  createRequest,
  getUser,
  listActiveRequests,
  listHistory,
  listRecentRequests,
  deleteRequests,
  setRequestStatus,
} from '../db.js';
import { broadcastDeleted, broadcastNew, broadcastUpdate, receiverOnline } from '../realtime.js';

export const requestsRouter = Router();

const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;

function readUser(value: unknown) {
  const userId = Number(value);
  const user = Number.isInteger(userId) ? getUser(userId) : undefined;
  if (!user) throw new UserError('User not found. Please enter your name again.', 404);
  return user;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

requestsRouter.post('/', (req, res) => {
  const body = (req.body ?? {}) as Partial<CreateRequestBody>;
  if (typeof body.clientRequestId !== 'string' || !CLIENT_ID.test(body.clientRequestId)) {
    throw new UserError('Invalid request id.');
  }
  const user = readUser(body.userId);
  if (body.type !== 'order' && body.type !== 'call') throw new UserError('Invalid request type.');

  let selection = null;
  if (body.type === 'order') {
    const result = validateSelection(body.selection, DEFAULT_CATALOG);
    if (!result.ok) throw new UserError(result.error);
    selection = result.value;
  }

  // Saved first; only then delivered. A retry with the same id is not delivered again.
  const { request, created } = createRequest(body.clientRequestId, user, body.type, selection);
  if (created) broadcastNew(request);
  res.status(created ? 201 : 200).json({ request, receiverOnline: receiverOnline() });
});

requestsRouter.get('/recent', (req, res) => {
  res.json(listRecentRequests(clampInt(req.query.limit, 50, 1, 200)));
});

// Dashboard: pending + in progress (oldest first) and how many were done since `since`.
requestsRouter.get('/active', (req, res) => {
  // `since` is the start of "today" in the viewer's own time zone.
  const since =
    typeof req.query.since === 'string' && !Number.isNaN(Date.parse(req.query.since)) ? req.query.since : '';
  const body: ActiveResponse = {
    requests: listActiveRequests(),
    completedToday: since ? countCompletedSinceTime(new Date(since).toISOString()) : 0,
  };
  res.json(body);
});

// Dashboard history: done requests, newest completion first, optional search.
requestsRouter.get('/history', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const body: HistoryResponse = listHistory(
    q,
    clampInt(req.query.limit, 50, 1, 100),
    clampInt(req.query.offset, 0, 0, 1e6),
  );
  res.json(body);
});

// Receivers (staff) only: move a request forward (pending → in_progress → done).
requestsRouter.patch('/:id/status', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new UserError('Invalid id.');
  const staff = readUser(req.body?.userId);
  // Checked here, not only in the UI. Name-based login, so this is not strong security.
  if (!staff.isStaff) throw new UserError('Only receivers can change request status.', 403);
  const to = req.body?.status as RequestStatus;
  if (!(to in NEXT_STATUSES) || to === 'pending') throw new UserError('Invalid status.');

  const updated = setRequestStatus(id, to, staff.name);
  broadcastUpdate(updated);
  res.json(updated);
});

// Erase one or many requests: body { userId, ids }. Allowed ones are deleted, others reported.
requestsRouter.delete('/', (req, res) => {
  const user = readUser(req.body?.userId);
  const ids: unknown = req.body?.ids;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 200 ||
    !ids.every((id) => Number.isInteger(id) && id > 0)
  ) {
    throw new UserError('Send 1 to 200 request ids.');
  }
  const result: DeleteResponse = deleteRequests(user, ids as number[]);
  if (result.deleted.length) broadcastDeleted(result.deleted);
  res.json(result);
});
