import type { Catalog, OfficeRequest, RequestStatus } from '../../../shared/types.js';
import { NEXT_STATUSES } from '../../../shared/types.js';
import { describeSelection } from '../../../shared/selection.js';
import { formatTime } from '../lib/format';
import styles from './RequestCard.module.css';

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Done',
};
const ACTION_LABEL: Record<RequestStatus, string> = { pending: '', in_progress: 'Start', done: 'Mark done' };

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={styles.badge} data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

type Props = {
  request: OfficeRequest;
  catalog: Catalog;
  /** Only passed for staff; without it no status buttons are shown. */
  onChangeStatus?: (request: OfficeRequest, to: RequestStatus) => void;
  busy?: boolean;
};

export function RequestCard({ request, catalog, onChangeStatus, busy = false }: Props) {
  const details = request.selection ? describeSelection(request.selection, catalog) : null;
  const actions = onChangeStatus ? NEXT_STATUSES[request.status] : [];

  return (
    <article className={styles.card} data-status={request.status} aria-busy={busy || undefined}>
      <header className={styles.head}>
        <h3>
          {request.userName} <span className={styles.time}>· {formatTime(request.createdAt)}</span>
        </h3>
        <StatusBadge status={request.status} />
      </header>

      {request.type === 'call' || !details ? (
        <p className={styles.call}>🔔 Call staff</p>
      ) : (
        <ul className={styles.items}>
          {details.items.map((item, i) => (
            <li key={i}>
              <strong>
                {item.label}
                {(item.qty > 1 || item.details.length === 0) && ` × ${item.qty}`}
              </strong>
              {item.details.map((d) => (
                <span key={d} className={styles.detail}>
                  {d}
                </span>
              ))}
            </li>
          ))}
          {details.custom && <li className={styles.custom}>“{details.custom}”</li>}
        </ul>
      )}

      {request.status === 'done' && request.completedAt && (
        <p className={styles.meta}>
          Completed {formatTime(request.completedAt)}
          {request.completedBy && ` by ${request.completedBy}`}
        </p>
      )}

      {actions.length > 0 && (
        <div className={styles.actions}>
          {actions.map((to) => (
            <button
              key={to}
              type="button"
              data-primary={to === actions[0] || undefined}
              disabled={busy}
              onClick={() => onChangeStatus?.(request, to)}
            >
              {busy ? 'Saving…' : ACTION_LABEL[to]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
