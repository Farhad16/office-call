import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  CircleCheck,
  Hourglass,
  Inbox,
  LayoutGrid,
  List,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
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
import { withTransition } from '../lib/transition';
import { startOfToday } from '../lib/format';
import { RequestCard, STATUS_LABEL } from '../components/RequestCard';
import { Button } from '../components/ui/Button';
import { useConfirm } from '../components/ui/Confirm';
import { Segmented } from '../components/ui/Segmented';
import {
  DashboardFilters,
  DEFAULT_FILTERS,
  activeFilterCount,
  rangeStart,
  type Filters,
} from '../components/DashboardFilters';
import { summarizeSelection } from '../../../shared/selection.js';
import styles from './DashboardPage.module.css';

type Tab = 'active' | 'history';
type View = 'list' | 'cards';

// Remembered per device. localStorage can throw (blocked storage), so it is guarded.
const VIEW_KEY = 'officeCall.dashboardView';
function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list';
  } catch {
    return 'list';
  }
}
function saveView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // ignore
  }
}
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
  const [view, setView] = useState<View>(loadView);
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
  const confirm = useConfirm();
  const [activeListRef] = useAutoAnimate<HTMLOListElement>();
  const [historyListRef] = useAutoAnimate<HTMLOListElement>();

  // Ids already counted in "completed today", so a repeated event never counts twice.
  const counted = useRef(new Set<number>());
  const since = useRef(startOfToday());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  // History is filtered on the server. This key changes whenever its search or filters change.
  const historyParams = { q: query, type: filters.type, mine: filters.mine, range: filters.range };
  const historyKey = JSON.stringify(historyParams);
  const historyRef = useRef(historyParams);
  useEffect(() => {
    historyRef.current = JSON.parse(historyKey);
  }, [historyKey]);

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

  const loadHistory = useCallback(
    (offset: number) => {
      const p = historyRef.current;
      const key = JSON.stringify(p);
      const params = new URLSearchParams({ limit: String(HISTORY_PAGE), offset: String(offset), q: p.q });
      if (p.type !== 'all') params.set('type', p.type);
      if (p.mine) params.set('userId', String(user.id));
      if (p.range !== 'all') params.set('since', rangeStart(p.range));
      getJson<HistoryResponse>(`/api/requests/history?${params}`)
        .then((res) => {
          // Ignore answers to an older search or filter.
          if (key !== JSON.stringify(historyRef.current)) return;
          setHistory((list) => (offset === 0 ? res.requests : [...(list ?? []), ...res.requests]));
          setHasMore(res.hasMore);
          setHistoryError(null);
        })
        .catch((err) => setHistoryError(errorMessage(err)))
        .finally(() => setHistoryLoading(false));
    },
    [user.id],
  );

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

  // Load history when the tab opens or its search/filters change (after the ref is updated).
  useEffect(() => {
    if (tab !== 'history') return;
    const timer = setTimeout(() => loadHistory(0), 0);
    return () => clearTimeout(timer);
  }, [tab, historyKey, loadHistory]);

  /** Applies a new or changed request to every list and the counters. */
  const apply = useCallback(
    (request: OfficeRequest) => {
      if (request.status === 'done') {
        setActive((list) => list?.filter((r) => r.id !== request.id) ?? list);
        if (request.completedAt && request.completedAt >= since.current && !counted.current.has(request.id)) {
          counted.current.add(request.id);
          setCompletedToday((n) => n + 1);
        }
        // New completions go on top of history if they match the current filters.
        const p = historyRef.current;
        const matches =
          p.q === '' &&
          (p.type === 'all' || p.type === request.type) &&
          (!p.mine || request.userId === user.id) &&
          (p.range === 'all' || (request.completedAt ?? '') >= rangeStart(p.range));
        if (matches) {
          setHistory((list) => (list ? [request, ...list.filter((r) => r.id !== request.id)] : list));
        }
      } else {
        setActive((list) => (list ? upsert(list, request).sort(byCreated) : list));
      }
    },
    [user.id],
  );

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
      if (tab === 'history') loadHistory(0);
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

  async function changeStatus(request: OfficeRequest, to: RequestStatus) {
    if (busy.has(request.id)) return; // one update per request at a time
    setBusy((s) => new Set(s).add(request.id));
    try {
      const updated = await patchJson<OfficeRequest>(`/api/requests/${request.id}/status`, {
        userId: user.id,
        status: to,
      });
      apply(updated);
      toast.success(`${STATUS_LABEL[to]}`, { description: `${request.userName}'s request` });
    } catch (err) {
      toast.error(errorMessage(err));
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
    const ok = await confirm({
      title: `Delete ${what}?`,
      description: 'They are erased permanently. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await deleteJson<DeleteResponse>('/api/requests', { userId: user.id, ids });
      removeLocal(res.deleted);
      if (res.deleted.length)
        toast.success(`Deleted ${res.deleted.length} ${res.deleted.length === 1 ? 'order' : 'orders'}`);
      if (res.skipped.length) {
        toast.warning(`${res.skipped.length} not deleted`, { description: res.skipped[0].reason });
      }
    } catch (err) {
      toast.error('Not deleted', { description: errorMessage(err) });
    } finally {
      setDeleting(false);
    }
  }

  function switchTab(next: Tab) {
    withTransition(() => {
      setTab(next);
      setSelected(new Set());
    });
  }

  const inProgress = active?.filter((r) => r.status === 'in_progress').length ?? 0;
  const onChangeStatus = user.isStaff ? changeStatus : undefined;

  // Selection only ever covers requests this viewer may delete in the current tab.
  // Active Queue is all in memory, so it is filtered here.
  const q = query.toLocaleLowerCase();
  const shownActive = (active ?? []).filter((r) => {
    if (filters.type !== 'all' && r.type !== filters.type) return false;
    if (filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.mine && r.userId !== user.id) return false;
    if (!q) return true;
    const text = [
      r.userName,
      r.type === 'call' ? 'call staff' : '',
      ...(r.selection && catalog ? summarizeSelection(r.selection, catalog) : []),
    ];
    return text.join(' ').toLocaleLowerCase().includes(q);
  });
  const filterCount = activeFilterCount(filters, tab) + Number(q !== '');
  const visible = (tab === 'active' ? shownActive : history) ?? [];
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
    <div className={styles.toolbar} data-active={chosen.length > 0 || undefined}>
      <label>
        <input
          type="checkbox"
          checked={allChosen}
          ref={(el) => {
            if (el) el.indeterminate = chosen.length > 0 && !allChosen;
          }}
          onChange={() => setSelected(allChosen ? new Set() : new Set(deletable.map((r) => r.id)))}
        />
        {chosen.length > 0 ? `${chosen.length} selected` : `Select all I can delete (${deletable.length})`}
      </label>
      <Button
        size="sm"
        variant={chosen.length ? 'danger' : 'dangerGhost'}
        icon={<Trash2 size={14} />}
        disabled={chosen.length === 0}
        loading={deleting}
        onClick={() => remove(chosen)}
      >
        Delete selected ({chosen.length})
      </Button>
    </div>
  );

  const stats = [
    { label: 'Active requests', value: active?.length, icon: <ListChecks size={18} />, tone: 'accent' },
    { label: 'In progress', value: active ? inProgress : undefined, icon: <Hourglass size={18} />, tone: 'info' },
    {
      label: 'Completed today',
      value: active ? completedToday : undefined,
      icon: <CircleCheck size={18} />,
      tone: 'success',
    },
  ];

  return (
    <section className={styles.page} aria-label="Dashboard">
      <div className={styles.cards}>
        {stats.map((s) => (
          <div key={s.label} className={`${styles.stat} fade-in`} data-tone={s.tone}>
            <span className={styles.statIcon} aria-hidden>
              {s.icon}
            </span>
            <span className={styles.statValue}>{s.value ?? '–'}</span>
            <span className={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </div>

      <div className={styles.bar}>
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
              {t === 'active' ? 'Active Queue' : 'History'}
              {t === 'active' && active && <span className={styles.tabCount}>{active.length}</span>}
            </button>
          ))}
        </div>
        <div className={styles.barRight}>
          <label className={styles.search}>
            <Search size={16} aria-hidden />
            <input
              type="search"
              placeholder="Search name or item…"
              aria-label={tab === 'active' ? 'Search queue' : 'Search history'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            variant={showFilters ? 'primary' : 'secondary'}
            icon={<SlidersHorizontal size={15} />}
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          >
            Filters
            {activeFilterCount(filters, tab) > 0 && (
              <span className={styles.filterCount}>{activeFilterCount(filters, tab)}</span>
            )}
          </Button>
          <Segmented
            name="view"
            label="View"
            size="sm"
            value={view}
            onChange={(v) => {
              setView(v);
              saveView(v);
            }}
            options={[
              {
                value: 'list',
                label: (
                  <>
                    <List size={15} aria-hidden /> List
                  </>
                ),
              },
              {
                value: 'cards',
                label: (
                  <>
                    <LayoutGrid size={15} aria-hidden /> Cards
                  </>
                ),
              },
            ]}
          />
        </div>
      </div>

      {/* Always rendered so it can slide open and closed; `inert` hides it from keyboard when closed. */}
      <div
        className="collapse"
        data-open={showFilters}
        inert={!showFilters}
        style={{ marginTop: showFilters ? 0 : -16 }}
      >
        <div>
          <DashboardFilters
            tab={tab}
            filters={filters}
            onChange={setFilters}
            shown={tab === 'active' && active ? shownActive.length : null}
            total={tab === 'active' && active ? active.length : null}
          />
        </div>
      </div>

      {!user.isStaff && (
        <p className={styles.note}>
          You can delete your own orders unless they are in progress. Receivers update status (turn on “I am a receiver”
          in your profile).
        </p>
      )}

      {tab === 'active' ? (
        <div id="panel-active" role="tabpanel" aria-labelledby="tab-active" className="fade-in">
          {activeError ? (
            <ErrorState message={activeError} onRetry={loadActive} />
          ) : !active || !catalog ? (
            <Loading />
          ) : active.length === 0 ? (
            <EmptyState title="All caught up" text="No active requests right now ☕" />
          ) : shownActive.length === 0 ? (
            <EmptyState
              title="No matches"
              text={`None of the ${active.length} active requests match your search or filters.`}
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                    setSearch('');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              {toolbar}
              <ol
                ref={activeListRef}
                className={view === 'list' ? styles.rows : styles.list}
                style={{ '--row-actions': user.isStaff ? '260px' : '40px' } as CSSProperties}
              >
                {shownActive.map((r) => (
                  <li key={r.id}>
                    <RequestCard
                      request={r}
                      catalog={catalog}
                      onChangeStatus={onChangeStatus}
                      busy={busy.has(r.id) || deleting}
                      selection={selectionFor(r)}
                      layout={view === 'list' ? 'row' : 'card'}
                    />
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      ) : (
        <div id="panel-history" role="tabpanel" aria-labelledby="tab-history" className="fade-in">
          {historyError ? (
            <ErrorState message={historyError} onRetry={() => loadHistory(0)} />
          ) : !history || !catalog ? (
            <Loading />
          ) : history.length === 0 ? (
            filterCount > 0 ? (
              <EmptyState
                title="No matches"
                text={query ? `Nothing matches “${query}” with these filters.` : 'Nothing matches these filters.'}
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setFilters(DEFAULT_FILTERS);
                      setSearch('');
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState title="No history yet" text="Completed requests show up here." />
            )
          ) : (
            <>
              {toolbar}
              <ol
                ref={historyListRef}
                className={view === 'list' ? styles.rows : styles.list}
                style={{ '--row-actions': '40px' } as CSSProperties}
              >
                {history.map((r) => (
                  <li key={r.id}>
                    <RequestCard
                      request={r}
                      catalog={catalog}
                      busy={deleting}
                      selection={selectionFor(r)}
                      layout={view === 'list' ? 'row' : 'card'}
                    />
                  </li>
                ))}
              </ol>
              {hasMore && (
                <Button
                  className={styles.more}
                  loading={historyLoading}
                  onClick={() => {
                    setHistoryLoading(true);
                    loadHistory(history.length);
                  }}
                >
                  Load more
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Loading() {
  return (
    <div className={`${styles.state} fade-in`}>
      <LoaderCircle className="spin" size={24} aria-hidden />
      <p>Loading…</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className={`${styles.state} fade-in`}>
      <p className={styles.error}>{message}</p>
      <Button icon={<RefreshCw size={15} />} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className={`${styles.state} fade-in`}>
      <span className={styles.emptyIcon} aria-hidden>
        <Inbox size={26} />
      </span>
      <p className={styles.emptyTitle}>{title}</p>
      <p>{text}</p>
      {action}
    </div>
  );
}
