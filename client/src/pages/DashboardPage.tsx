import { useCallback, useEffect, useRef, useState } from 'react';
import { canDelete } from '../../../shared/types.js';
import type {
  ActiveResponse,
  DeleteResponse,
  Catalog,
  HistoryResponse,
  OfficeRequest,
  RequestStatus,
  User,
} from '../../../shared/types.js';
import { deleteJson, errorMessage, getJson, patchJson } from '../lib/api';
import { socket } from '../lib/socket';
import { startOfToday } from '../lib/format';
import { RequestCard, STATUS_LABEL } from '../components/RequestCard';
import styles from './DashboardPage.module.css';

type Tab = 'active' | 'history';
type Toast = { kind: 'success' | 'error'; text: string } | null;
const HISTORY_PAGE = 50;

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

export function DashboardPage({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('active');
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  const [active, setActive] = useState<OfficeRequest[] | null>(null);
  const [completedToday, setCompletedToday] = useState(0);
  const [activeError, setActiveError] = useState<string | null>(null);

  const [history, setHistory] = useState<OfficeRequest[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // debounced search

  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  // Ids already counted in "completed today", so a repeated event never counts twice.
  const counted = useRef(new Set<number>());
  const since = useRef(startOfToday());
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const loadActive = useCallback(() => {
    since.current = startOfToday();
    getJson<ActiveResponse>(`/api/requests/active?since=${encodeURIComponent(since.current)}`)
      .then((res) => {
        counted.current = new Set();
        setActive(res.requests);
        setCompletedToday(res.completedToday);
        setActiveError(null);
      })
      .catch((err) => setActiveError(errorMessage(err)));
  }, []);

  const loadHistory = useCallback((q: string, offset: number) => {
    getJson<HistoryResponse>(`/api/requests/history?limit=${HISTORY_PAGE}&offset=${offset}&q=${encodeURIComponent(q)}`)
      .then((res) => {
        // Ignore answers to an older search.
        if (q !== queryRef.current) return;
        setHistory((list) => (offset === 0 ? res.requests : [...(list ?? []), ...res.requests]));
        setHasMore(res.hasMore);
        setHistoryError(null);
      })
      .catch((err) => setHistoryError(errorMessage(err)))
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    getJson<Catalog>('/api/items')
      .then(setCatalog)
      .catch((err) => setActiveError(errorMessage(err)));
    loadActive();
  }, [loadActive]);

  // Debounce typing in the search box.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Load history when the tab opens or the search changes.
  useEffect(() => {
    if (tab === 'history') loadHistory(query, 0);
  }, [tab, query, loadHistory]);

  /** Applies a new or changed request to every list and the counters. */
  const apply = useCallback((request: OfficeRequest) => {
    if (request.status === 'done') {
      setActive((list) => list?.filter((r) => r.id !== request.id) ?? list);
      if (request.completedAt && request.completedAt >= since.current && !counted.current.has(request.id)) {
        counted.current.add(request.id);
        setCompletedToday((n) => n + 1);
      }
      // New completions go on top of an unfiltered history; a search is refreshed instead.
      if (queryRef.current === '') {
        setHistory((list) => (list ? [request, ...list.filter((r) => r.id !== request.id)] : list));
      }
    } else {
      setActive((list) => (list ? upsert(list, request).sort(byCreated) : list));
    }
  }, []);

  const removeLocal = useCallback((ids: number[]) => {
    const gone = new Set(ids);
    setActive((list) => list?.filter((r) => !gone.has(r.id)) ?? list);
    setHistory((list) => list?.filter((r) => !gone.has(r.id)) ?? list);
    setSelected((s) => new Set([...s].filter((id) => !gone.has(id))));
  }, []);

  // Live updates from every device. After a reconnect, reload to catch anything missed.
  useEffect(() => {
    const onConnect = () => {
      loadActive();
      if (tab === 'history') loadHistory(queryRef.current, 0);
    };
    // Deleted anywhere: drop it here, and reload counts ("completed today" may change).
    const onDeleted = ({ ids }: { ids: number[] }) => {
      removeLocal(ids);
      loadActive();
    };
    socket.on('request:new', apply);
    socket.on('request:updated', apply);
    socket.on('request:deleted', onDeleted);
    socket.on('connect', onConnect);
    return () => {
      socket.off('request:new', apply);
      socket.off('request:updated', apply);
      socket.off('request:deleted', onDeleted);
      socket.off('connect', onConnect);
    };
  }, [apply, loadActive, loadHistory, removeLocal, tab]);

  // Hide the toast after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.kind === 'error' ? 6000 : 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function changeStatus(request: OfficeRequest, to: RequestStatus) {
    if (busy.has(request.id)) return; // one update per request at a time
    setBusy((s) => new Set(s).add(request.id));
    try {
      const updated = await patchJson<OfficeRequest>(`/api/requests/${request.id}/status`, {
        userId: user.id,
        status: to,
      });
      apply(updated);
      setToast({ kind: 'success', text: `${request.userName}'s request: ${STATUS_LABEL[to]} ✓` });
    } catch (err) {
      setToast({ kind: 'error', text: errorMessage(err) });
      loadActive(); // someone else may have changed it; show the real state
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(request.id);
        return next;
      });
    }
  }

  /** Erases requests after a confirm. The server deletes what is allowed and reports the rest. */
  async function remove(ids: number[]) {
    if (deleting || ids.length === 0) return;
    const what = ids.length === 1 ? 'this order' : `${ids.length} orders`;
    if (!window.confirm(`Delete ${what} permanently? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await deleteJson<DeleteResponse>('/api/requests', { userId: user.id, ids });
      removeLocal(res.deleted);
      const done = res.deleted.length ? `Deleted ${res.deleted.length}.` : '';
      const notDone = res.skipped.length ? ` ${res.skipped.length} not deleted: ${res.skipped[0].reason}` : '';
      setToast({ kind: res.skipped.length ? 'error' : 'success', text: `${done}${notDone}`.trim() });
    } catch (err) {
      setToast({ kind: 'error', text: `Not deleted: ${errorMessage(err)}` });
    } finally {
      setDeleting(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setSelected(new Set());
  }

  const inProgress = active?.filter((r) => r.status === 'in_progress').length ?? 0;
  const onChangeStatus = user.isStaff ? changeStatus : undefined;

  // Selection only ever covers requests this viewer may delete in the current tab.
  const visible = (tab === 'active' ? active : history) ?? [];
  const deletable = visible.filter((r) => canDelete(r, user));
  const chosen = deletable.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allChosen = deletable.length > 0 && chosen.length === deletable.length;

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  const selectionFor = (r: OfficeRequest) =>
    canDelete(r, user)
      ? { selected: selected.has(r.id), onToggle: () => toggle(r.id), onDelete: () => remove([r.id]) }
      : undefined;

  const toolbar = deletable.length > 0 && (
    <div className={styles.toolbar}>
      <label>
        <input
          type="checkbox"
          checked={allChosen}
          ref={(el) => {
            if (el) el.indeterminate = chosen.length > 0 && !allChosen;
          }}
          onChange={() => setSelected(allChosen ? new Set() : new Set(deletable.map((r) => r.id)))}
        />
        Select all I can delete ({deletable.length})
      </label>
      <button type="button" disabled={chosen.length === 0 || deleting} onClick={() => remove(chosen)}>
        {deleting ? 'Deleting…' : `Delete selected (${chosen.length})`}
      </button>
    </div>
  );

  return (
    <section className={styles.page} aria-label="Dashboard">
      <div className={styles.cards}>
        <div className={styles.stat}>
          <span>{active?.length ?? '–'}</span>
          Active requests
        </div>
        <div className={styles.stat}>
          <span>{active ? inProgress : '–'}</span>
          In progress
        </div>
        <div className={styles.stat}>
          <span>{active ? completedToday : '–'}</span>
          Completed today
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Dashboard views">
        {(['active', 'history'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => switchTab(t)}
          >
            {t === 'active' ? `Active Queue${active ? ` (${active.length})` : ''}` : 'History'}
          </button>
        ))}
      </div>

      {!user.isStaff && (
        <p className={styles.muted}>
          You can delete your own orders unless they are in progress. Receivers update status (tick “I am a receiver”
          when signing in).
        </p>
      )}

      {toast && (
        <p className={styles.toast} data-kind={toast.kind} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.text}
        </p>
      )}

      {tab === 'active' ? (
        <div id="panel-active" role="tabpanel" aria-labelledby="tab-active">
          {activeError ? (
            <div className={styles.state}>
              <p className={styles.error}>{activeError}</p>
              <button onClick={loadActive}>Try again</button>
            </div>
          ) : !active || !catalog ? (
            <p className={styles.state}>Loading…</p>
          ) : active.length === 0 ? (
            <p className={styles.state}>No active requests. All caught up ☕</p>
          ) : (
            <>
              {toolbar}
              <ol className={styles.list}>
                {active.map((r) => (
                  <li key={r.id}>
                    <RequestCard
                      request={r}
                      catalog={catalog}
                      onChangeStatus={onChangeStatus}
                      busy={busy.has(r.id) || deleting}
                      selection={selectionFor(r)}
                    />
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      ) : (
        <div id="panel-history" role="tabpanel" aria-labelledby="tab-history">
          <input
            type="search"
            className={styles.search}
            placeholder="Search by name or item, e.g. Farhad, tea, biscuits"
            aria-label="Search history"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {historyError ? (
            <div className={styles.state}>
              <p className={styles.error}>{historyError}</p>
              <button onClick={() => loadHistory(query, 0)}>Try again</button>
            </div>
          ) : !history || !catalog ? (
            <p className={styles.state}>Loading…</p>
          ) : history.length === 0 ? (
            <p className={styles.state}>{query ? `Nothing matches “${query}”.` : 'No completed requests yet.'}</p>
          ) : (
            <>
              {toolbar}
              <ol className={styles.list}>
                {history.map((r) => (
                  <li key={r.id}>
                    <RequestCard request={r} catalog={catalog} busy={deleting} selection={selectionFor(r)} />
                  </li>
                ))}
              </ol>
              {hasMore && (
                <button
                  className={styles.more}
                  onClick={() => {
                    setHistoryLoading(true);
                    loadHistory(query, history.length);
                  }}
                  disabled={historyLoading}
                >
                  {historyLoading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
