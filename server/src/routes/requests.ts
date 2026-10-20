import { Router } from 'express';
import { DEFAULT_CATALOG } from '../../../shared/catalog.js';
import { validateSelection } from '../../../shared/selection.js';
import type { CreateRequestBody } from '../../../shared/types.js';
import { UserError, createRequest, getUser, listRecentRequests } from '../db.js';
import { deliverRequest, receiverOnline } from '../realtime.js';

export const requestsRouter = Router();

const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;

requestsRouter.post('/', (req, res) => {
  const body = (req.body ?? {}) as Partial<CreateRequestBody>;
  if (typeof body.clientRequestId !== 'string' || !CLIENT_ID.test(body.clientRequestId)) {
    throw new UserError('Invalid request id.');
  }
  const userId = Number(body.userId);
  if (!Number.isInteger(userId) || !getUser(userId)) {
    throw new UserError('User not found. Please enter your name again.', 404);
  }
  if (body.type !== 'order' && body.type !== 'call') throw new UserError('Invalid request type.');

  let selection = null;
  if (body.type === 'order') {
    const result = validateSelection(body.selection, DEFAULT_CATALOG);
    if (!result.ok) throw new UserError(result.error);
    selection = result.value;
  }

  // Saved first; only then delivered. A retry with the same id is not delivered again.
  const { request, created } = createRequest(body.clientRequestId, userId, body.type, selection);
  if (created) deliverRequest(request);
  res.status(created ? 201 : 200).json({ request, receiverOnline: receiverOnline() });
});

requestsRouter.get('/recent', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  res.json(listRecentRequests(limit));
});
