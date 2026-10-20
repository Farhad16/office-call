// Types shared by the client and the server.

/** A pick-one option, e.g. sugar level. */
export type ChoiceOption = {
  id: string;
  kind: 'choice';
  label: string;
  default: string;
  choices: { id: string; label: string; bn: string }[]; // bn '' = say nothing (the normal case)
  showIf?: Record<string, string | boolean>; // only shown when other options have these values
};

/** A yes/no option, e.g. ginger. */
export type ToggleOption = {
  id: string;
  kind: 'toggle';
  label: string;
  bn: string;
  default: boolean;
  showIf?: Record<string, string | boolean>;
};

export type OptionDef = ChoiceOption | ToggleOption;
export type OptionValue = string | boolean;

export type ItemDef = {
  id: string;
  label: string;
  bn: string;
  emoji: string;
  maxQty: number;
  options?: string[]; // option ids from Catalog.options, in display order
};

export type Catalog = {
  drinks: ItemDef[];
  snacks: ItemDef[];
  options: Record<string, OptionDef>;
};

export type DrinkLine = { itemId: string; qty: number; options: Record<string, OptionValue> };
export type SnackLine = { itemId: string; qty: number };

/** What the user picked. Stored as JSON in presets and requests. */
export type Selection = {
  drinks: DrinkLine[];
  snacks: SnackLine[];
  custom: string;
};

/**
 * isStaff: a "receiver", who handles requests (change status, delete done orders).
 * Name-based, so NOT real security (see docs).
 */
export type User = { id: number; name: string; isStaff: boolean };

export type Preset = {
  id: number;
  name: string;
  selection: Selection;
  updatedAt: string;
};

/** Error body returned by every failing API call. */
export type ApiErrorBody = { ok: false; error: string };

export type RequestType = 'order' | 'call';
/** Work status, changed by staff: pending → in_progress → done. */
export type RequestStatus = 'pending' | 'in_progress' | 'done';

/** Allowed status changes. `done` is final. */
export const NEXT_STATUSES: Record<RequestStatus, RequestStatus[]> = {
  pending: ['in_progress', 'done'],
  in_progress: ['done'],
  done: [],
};

/** A saved request, as sent to the receiver, the requester and the dashboard. */
export type OfficeRequest = {
  id: number;
  userId: number; // requester
  userName: string; // requester's name at the time of the request
  type: RequestType;
  selection: Selection | null; // null for 'call'
  status: RequestStatus;
  announced: boolean; // spoken by the receiver
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedBy: string | null; // staff display name
};

/** GET /api/requests/active */
export type ActiveResponse = { requests: OfficeRequest[]; completedToday: number };
/** DELETE /api/requests: what was erased and what was not allowed. */
export type DeleteResponse = { deleted: number[]; skipped: { id: number; reason: string }[] };

/**
 * Who may erase a request: the sender, unless it is in progress; a receiver, once it is done.
 * Used by the UI to show checkboxes. The server checks the same rule.
 */
export function canDelete(request: Pick<OfficeRequest, 'userId' | 'status'>, user: User): boolean {
  if (request.userId === user.id && request.status !== 'in_progress') return true;
  return user.isStaff && request.status === 'done';
}

/** GET /api/requests/history */
export type HistoryResponse = { requests: OfficeRequest[]; hasMore: boolean };

/** Body of POST /api/requests. */
export type CreateRequestBody = {
  clientRequestId: string; // random id from the client; the same id is never saved twice
  userId: number;
  type: RequestType;
  selection?: Selection;
};

// Socket.IO events (see docs/ARCHITECTURE.md).
export interface ServerToClientEvents {
  'request:new': (request: OfficeRequest) => void;
  /** Sent after any change: announced, or a status change by staff. Never re-announced. */
  'request:updated': (request: OfficeRequest) => void;
  /** Requests erased for good. */
  'request:deleted': (update: { ids: number[] }) => void;
  'receiver:status': (status: { online: boolean }) => void;
}

export interface ClientToServerEvents {
  /** Receiver registers; the ack returns requests not yet announced. */
  'receiver:join': (ack: (pending: OfficeRequest[]) => void) => void;
  'request:announced': (update: { id: number }) => void;
}
