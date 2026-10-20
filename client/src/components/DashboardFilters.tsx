import { X } from 'lucide-react';
import { Segmented } from './ui/Segmented';
import { Button } from './ui/Button';
import styles from './DashboardFilters.module.css';

export type Filters = {
  type: 'all' | 'order' | 'call';
  status: 'all' | 'pending' | 'in_progress'; // Active Queue only
  range: 'all' | 'today' | '7d' | '30d'; // History only
  mine: boolean;
};

export const DEFAULT_FILTERS: Filters = { type: 'all', status: 'all', range: 'all', mine: false };

/** How many filters differ from the defaults, for the tab shown. */
export function activeFilterCount(f: Filters, tab: 'active' | 'history'): number {
  return Number(f.type !== 'all') + Number(f.mine) + Number(tab === 'active' ? f.status !== 'all' : f.range !== 'all');
}

/** Start of the date range as an ISO time ('' = no limit). Days count from local midnight. */
export function rangeStart(range: Filters['range']): string {
  if (range === 'all') return '';
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === '7d') d.setDate(d.getDate() - 6);
  if (range === '30d') d.setDate(d.getDate() - 29);
  return d.toISOString();
}

type Props = {
  tab: 'active' | 'history';
  filters: Filters;
  onChange: (filters: Filters) => void;
  shown: number | null; // results after filtering (null = unknown, e.g. history pages)
  total: number | null;
};

export function DashboardFilters({ tab, filters, onChange, shown, total }: Props) {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => onChange({ ...filters, [key]: value });
  const count = activeFilterCount(filters, tab);

  return (
    <div className={styles.panel} role="group" aria-label="Filters">
      <div className={styles.field}>
        <span className={styles.label}>Type</span>
        <Segmented
          name="filter-type"
          label="Type"
          size="sm"
          value={filters.type}
          onChange={(v) => set('type', v)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'order', label: 'Orders' },
            { value: 'call', label: 'Calls' },
          ]}
        />
      </div>

      {tab === 'active' ? (
        <div className={styles.field}>
          <span className={styles.label}>Status</span>
          <Segmented
            name="filter-status"
            label="Status"
            size="sm"
            value={filters.status}
            onChange={(v) => set('status', v)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'in_progress', label: 'In progress' },
            ]}
          />
        </div>
      ) : (
        <div className={styles.field}>
          <span className={styles.label}>Completed</span>
          <Segmented
            name="filter-range"
            label="Completed"
            size="sm"
            value={filters.range}
            onChange={(v) => set('range', v)}
            options={[
              { value: 'today', label: 'Today' },
              { value: '7d', label: '7 days' },
              { value: '30d', label: '30 days' },
              { value: 'all', label: 'All time' },
            ]}
          />
        </div>
      )}

      <label className={styles.mine}>
        <input type="checkbox" checked={filters.mine} onChange={(e) => set('mine', e.target.checked)} />
        Only my requests
      </label>

      <div className={styles.footer}>
        <span className={styles.count} aria-live="polite">
          {shown !== null && total !== null && (count > 0 ? `Showing ${shown} of ${total}` : `${total} total`)}
        </span>
        {count > 0 && (
          <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => onChange(DEFAULT_FILTERS)}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
