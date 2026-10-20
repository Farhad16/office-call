import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ActiveResponse, OfficeRequest, RequestStatus, User } from '../../../shared/types.js';
import { errorMessage, getJson, patchJson } from './api';
import { socket } from './socket';
import { startOfToday } from './format';

const STATUS_TEXT: Record<RequestStatus, string> = { pending: 'Pending', in_progress: 'In Progress', done: 'Done' };

const byCreated = (a: OfficeRequest, b: OfficeRequest) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id;

/** Inserts or replaces by id; an older copy never overwrites a newer one. */
function upsert(list: OfficeRequest[], request: OfficeRequest): OfficeRequest[] {
  const i = list.findIndex((r) => r.id === request.id);
  if (i === -1) return [...list, request];
  if (list[i].updatedAt > request.updatedAt) return list;
  const next = [...list];
  next[i] = request;
  return next;
}

export type ActiveQueue = {
  active: OfficeRequest[] | null; // pending + in progress, oldest first (null = loading)
  completedToday: number;
  error: string | null;
  reload: () => void;
  /** Apply a new/changed request now (e.g. right after our own status change). */
  apply: (request: OfficeRequest) => void;
  /** Drop deleted requests now, without waiting for the server's event. */
  remove: (ids: number[]) => void;
};

/**
 * The live Active Queue, shared by the dashboard and the speaker page.
 * Loads once, then follows request:new / request:updated / request:deleted, and reloads
 * after a reconnect so nothing missed while offline is lost.
 */
export function useActiveQueue(): ActiveQueue {
  const [active, setActive] = useState<OfficeRequest[] | null>(null);
  const [completedToday, setCompletedToday] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Ids already counted in "completed today", so a repeated event never counts twice.
  const counted = useRef(new Set<number>());
  const since = useRef(startOfToday());

  const reload = useCallback(() => {
    since.current = startOfToday();
    getJson<ActiveResponse>(`/api/requests/active?since=${encodeURIComponent(since.current)}`)
      .then((res) => {
        counted.current = new Set();
        setActive(res.requests);
        setCompletedToday(res.completedToday);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const apply = useCallback((request: OfficeRequest) => {
    if (request.status === 'done') {
      setActive((list) => list?.filter((r) => r.id !== request.id) ?? list);
      if (request.completedAt && request.completedAt >= since.current && !counted.current.has(request.id)) {
        counted.current.add(request.id);
        setCompletedToday((n) => n + 1);
      }
    } else {
      setActive((list) => (list ? upsert(list, request).sort(byCreated) : list));
    }
  }, []);

  const remove = useCallback((ids: number[]) => {
    const gone = new Set(ids);
    setActive((list) => list?.filter((r) => !gone.has(r.id)) ?? list);
  }, []);

  useEffect(() => {
    reload();
    // Deleted anywhere: drop it, and reload counts ("completed today" may change).
    const onDeleted = ({ ids }: { ids: number[] }) => {
      remove(ids);
      reload();
    };
    socket.on('request:new', apply);
    socket.on('request:updated', apply);
    socket.on('request:deleted', onDeleted);
    socket.on('connect', reload);
    return () => {
      socket.off('request:new', apply);
      socket.off('request:updated', apply);
      socket.off('request:deleted', onDeleted);
      socket.off('connect', reload);
    };
  }, [apply, reload, remove]);

  return { active, completedToday, error, reload, apply, remove };
}

/**
 * Status buttons for receivers. One update per request at a time; on any error the queue
 * is reloaded so it shows the real state (someone else may have changed it).
 */
export function useStatusChange(
  user: User | null,
  queue: Pick<ActiveQueue, 'apply' | 'reload'>,
  onUpdated?: (r: OfficeRequest) => void,
) {
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const inFlight = useRef(new Set<number>()); // checked synchronously, so a double click can't slip through
  const { apply, reload } = queue;

  const changeStatus = useCallback(
    async (request: OfficeRequest, to: RequestStatus) => {
      if (!user || inFlight.current.has(request.id)) return;
      inFlight.current.add(request.id);
      setBusy(new Set(inFlight.current));
      try {
        const updated = await patchJson<OfficeRequest>(`/api/requests/${request.id}/status`, {
          userId: user.id,
          status: to,
        });
        apply(updated);
        onUpdated?.(updated);
        toast.success(STATUS_TEXT[to], { description: `${request.userName}'s request` });
      } catch (err) {
        toast.error(errorMessage(err));
        reload();
      } finally {
        inFlight.current.delete(request.id);
        setBusy(new Set(inFlight.current));
      }
    },
    [user, apply, reload, onUpdated],
  );

  return { busy, changeStatus };
}
