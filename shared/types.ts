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

export type User = { id: number; name: string };

export type Preset = {
  id: number;
  name: string;
  selection: Selection;
  updatedAt: string;
};

/** Error body returned by every failing API call. */
export type ApiErrorBody = { ok: false; error: string };

export type RequestType = 'order' | 'call';
export type RequestStatus = 'received' | 'announced';

/** A saved request, as sent to the receiver and the requester. */
export type OfficeRequest = {
  id: number;
  userName: string;
  type: RequestType;
  selection: Selection | null; // null for 'call'
  status: RequestStatus;
  createdAt: string;
};

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
  'request:status': (update: { id: number; status: RequestStatus }) => void;
  'receiver:status': (status: { online: boolean }) => void;
}

export interface ClientToServerEvents {
  /** Receiver registers; the ack returns requests not yet announced. */
  'receiver:join': (ack: (pending: OfficeRequest[]) => void) => void;
  'request:announced': (update: { id: number }) => void;
}
