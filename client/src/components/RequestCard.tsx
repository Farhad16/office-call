import { BellRing, CircleCheck, Clock, Play, Trash2 } from 'lucide-react';
import type { Catalog, OfficeRequest, RequestStatus } from '../../../shared/types.js';
import { NEXT_STATUSES } from '../../../shared/types.js';
import { describeSelection } from '../../../shared/selection.js';
import { formatTime } from '../lib/format';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import styles from './RequestCard.module.css';

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Done',
};
const STATUS_TONE = { pending: 'warning', in_progress: 'info', done: 'success' } as const;
const ACTION: Record<RequestStatus, { label: string; icon: React.ReactNode }> = {
  pending: { label: '', icon: null },
  in_progress: { label: 'Start', icon: <Play size={14} /> },
  done: { label: 'Mark done', icon: <CircleCheck size={15} /> },
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

type Props = {
  request: OfficeRequest;
  catalog: Catalog;
  /** Only passed for receivers; without it no status buttons are shown. */
  onChangeStatus?: (request: OfficeRequest, to: RequestStatus) => void;
  busy?: boolean;
  /** Only passed when the viewer may delete this request. */
  selection?: { selected: boolean; onToggle: () => void; onDelete: () => void };
  /** 'row' = compact one-line list item, 'card' = tile for the grid view. */
  layout?: 'card' | 'row';
};

export function RequestCard({ request, catalog, onChangeStatus, busy = false, selection, layout = 'card' }: Props) {
  const details = request.selection ? describeSelection(request.selection, catalog) : null;
  const actions = onChangeStatus ? NEXT_STATUSES[request.status] : [];
  const showFooter = actions.length > 0 || selection;
  const initial = request.userName.trim()[0]?.toUpperCase() ?? '?';

  const checkbox = selection && (
    <input
      type="checkbox"
      className={styles.select}
      checked={selection.selected}
      onChange={selection.onToggle}
      aria-label={`Select ${request.userName}'s request from ${formatTime(request.createdAt)}`}
    />
  );
  const statusButtons = actions.map((to) => (
    <Button
      key={to}
      size="sm"
      variant={to === actions[0] ? 'primary' : 'secondary'}
      icon={ACTION[to].icon}
      loading={busy && to === actions[0]}
      disabled={busy}
      onClick={() => onChangeStatus?.(request, to)}
    >
      {ACTION[to].label}
    </Button>
  ));
  const completed = request.status === 'done' && request.completedAt && (
    <p className={styles.meta}>
      <CircleCheck size={13} aria-hidden /> Completed {formatTime(request.completedAt)}
      {request.completedBy && ` by ${request.completedBy}`}
    </p>
  );

  if (layout === 'row') {
    return (
      <article
        className={styles.row}
        data-status={request.status}
        data-selected={selection?.selected || undefined}
        aria-busy={busy || undefined}
      >
        <span className={styles.rowSelect}>{checkbox}</span>
        <span className={styles.avatar} aria-hidden>
          {initial}
        </span>
        <div className={styles.who}>
          <h3>{request.userName}</h3>
          <span className={styles.time}>
            <Clock size={12} aria-hidden /> {formatTime(request.createdAt)}
          </span>
        </div>
        <div className={styles.rowItems}>
          {request.type === 'call' || !details ? (
            <span className={styles.rowCall}>
              <BellRing size={15} aria-hidden /> Call staff
            </span>
          ) : (
            <p className={styles.rowText}>
              {details.items.map((item, i) => (
                <span key={i} className={styles.rowItem}>
                  <strong>{item.label}</strong>
                  {(item.qty > 1 || item.details.length === 0) && <span className={styles.qty}>× {item.qty}</span>}
                  {item.details.length > 0 && <span className={styles.rowDetails}> · {item.details.join(', ')}</span>}
                </span>
              ))}
              {details.custom && <span className={styles.rowCustom}>“{details.custom}”</span>}
            </p>
          )}
          {completed}
        </div>
        <span className={styles.rowStatus}>
          <StatusBadge status={request.status} />
        </span>
        <div className={styles.rowActions}>
          {selection && (
            <Button
              size="sm"
              variant="dangerGhost"
              icon={<Trash2 size={15} />}
              aria-label="Delete"
              title="Delete"
              disabled={busy}
              onClick={selection.onDelete}
            />
          )}
          {statusButtons}
        </div>
      </article>
    );
  }

  return (
    <article
      className={`${styles.card} reveal`}
      data-status={request.status}
      data-selected={selection?.selected || undefined}
      aria-busy={busy || undefined}
    >
      <header className={styles.head}>
        {checkbox}
        <span className={styles.avatar} aria-hidden>
          {initial}
        </span>
        <div className={styles.who}>
          <h3>{request.userName}</h3>
          <span className={styles.time}>
            <Clock size={12} aria-hidden /> {formatTime(request.createdAt)}
          </span>
        </div>
        <StatusBadge status={request.status} />
      </header>

      {request.type === 'call' || !details ? (
        <p className={styles.call}>
          <BellRing size={16} aria-hidden /> Call staff
        </p>
      ) : (
        <ul className={styles.items}>
          {details.items.map((item, i) => (
            <li key={i}>
              <span className={styles.itemName}>
                {item.label}
                {(item.qty > 1 || item.details.length === 0) && <span className={styles.qty}>× {item.qty}</span>}
              </span>
              {item.details.length > 0 && (
                <span className={styles.details}>
                  {item.details.map((d) => (
                    <span key={d} className={styles.detail}>
                      {d}
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
          {details.custom && <li className={styles.custom}>“{details.custom}”</li>}
        </ul>
      )}

      {completed}

      {showFooter && (
        <div className={styles.actions}>
          {selection && (
            <Button
              size="sm"
              variant="dangerGhost"
              className={styles.delete}
              icon={<Trash2 size={14} />}
              disabled={busy}
              onClick={selection.onDelete}
            >
              Delete
            </Button>
          )}
          {statusButtons}
        </div>
      )}
    </article>
  );
}
