import { Router, type Request } from 'express';
import { DEFAULT_CATALOG } from '../../../shared/catalog.js';
import { cleanName, nameKey, validateName } from '../../../shared/names.js';
import { validateSelection } from '../../../shared/selection.js';
import type { Selection } from '../../../shared/types.js';
import {
  UserError,
  createPreset,
  deletePreset,
  getOrCreateUser,
  getUser,
  listPresets,
  renameUser,
  updatePreset,
} from '../db.js';

export const usersRouter = Router();

function parseId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new UserError('Invalid id.', 400);
  return id;
}

function readName(value: unknown, what: string): string {
  const name = cleanName(typeof value === 'string' ? value : '');
  const problem = validateName(name, what);
  if (problem) throw new UserError(problem);
  return name;
}

function readSelection(value: unknown): Selection {
  const result = validateSelection(value, DEFAULT_CATALOG);
  if (!result.ok) throw new UserError(result.error);
  return result.value;
}

/** Returns the :userId from the URL after checking the user exists. */
function requireUser(req: Request): number {
  const userId = parseId(req.params.userId);
  if (!getUser(userId)) throw new UserError('User not found. Please enter your name again.', 404);
  return userId;
}

// Sign in: find or create the user by name.
usersRouter.post('/', (req, res) => {
  const name = readName(req.body?.name, 'Name');
  res.json(getOrCreateUser(name, nameKey(name)));
});

// Change display name, keeping presets.
usersRouter.patch('/:userId', (req, res) => {
  const userId = requireUser(req);
  const name = readName(req.body?.name, 'Name');
  res.json(renameUser(userId, name, nameKey(name)));
});

usersRouter.get('/:userId/presets', (req, res) => {
  res.json(listPresets(requireUser(req)));
});

usersRouter.post('/:userId/presets', (req, res) => {
  const userId = requireUser(req);
  const name = readName(req.body?.name, 'Preset name');
  const selection = readSelection(req.body?.selection);
  res.status(201).json(createPreset(userId, name, selection));
});

usersRouter.put('/:userId/presets/:presetId', (req, res) => {
  const userId = requireUser(req);
  const presetId = parseId(req.params.presetId);
  const name = readName(req.body?.name, 'Preset name');
  const selection = readSelection(req.body?.selection);
  res.json(updatePreset(userId, presetId, name, selection));
});

usersRouter.delete('/:userId/presets/:presetId', (req, res) => {
  deletePreset(requireUser(req), parseId(req.params.presetId));
  res.status(204).end();
});
