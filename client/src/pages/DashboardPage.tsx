import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActiveResponse,
  Catalog,
  HistoryResponse,
  OfficeRequest,
  RequestStatus,
  User,
} from '../../../shared/types.js';
import { errorMessage, getJson, patchJson } from '../lib/api';
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

  // Live updates from every device. After a reconnect, reload to catch anything missed.
  useEffect(() => {
    const onConnect = () => {
      loadActive();
      if (tab === 'history') loadHistory(queryRef.current, 0);
    };
    socket.on('request:new', apply);
    socket.on('request:updated', apply);
    socket.on('connect', onConnect);
    return () => {
      socket.off('request:new', apply);
      socket.off('request:updated', apply);
      socket.off('connect', onConnect);
    };
  }, [apply, loadActive, loadHistory, tab]);

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

  const inProgress = active?.filter((r) => r.status === 'in_progress').length ?? 0;
  const onChangeStatus = user.isStaff ? changeStatus : undefined;

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
            onClick={() => setTab(t)}
          >
            {t === 'active' ? `Active Queue${active ? ` (${active.length})` : ''}` : 'History'}
          </button>
        ))}
      </div>

      {!user.isStaff && (
        <p className={styles.muted}>View only. Staff can update status (tick “I am staff” when signing in).</p>
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
            <ol className={styles.list}>
              {active.map((r) => (
                <li key={r.id}>
                  <RequestCard request={r} catalog={catalog} onChangeStatus={onChangeStatus} busy={busy.has(r.id)} />
                </li>
              ))}
            </ol>
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
              <ol className={styles.list}>
                {history.map((r) => (
                  <li key={r.id}>
                    <RequestCard request={r} catalog={catalog} />
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
