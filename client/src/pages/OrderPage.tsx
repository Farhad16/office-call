import { useEffect, useMemo, useState } from 'react';
import type { Catalog, Selection } from '../../../shared/types.js';
import { emptySelection, summarizeSelection } from '../../../shared/selection.js';
import { getJson } from '../lib/api';
import { DrinkSection } from '../components/DrinkSection';
import { SnackSection } from '../components/SnackSection';
import { CustomSection } from '../components/CustomSection';
import { RequestSummary } from '../components/RequestSummary';
import styles from './OrderPage.module.css';

type Notice = { kind: 'success' | 'error' | 'info'; text: string } | null;

export function OrderPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [notice, setNotice] = useState<Notice>(null);

  function loadCatalog() {
    setLoadError(null);
    getJson<Catalog>('/api/items')
      .then(setCatalog)
      .catch((err: Error) => setLoadError(err.message));
  }
  useEffect(loadCatalog, []);

  const summary = useMemo(() => (catalog ? summarizeSelection(selection, catalog) : []), [selection, catalog]);

  if (loadError) {
    return (
      <div className={styles.center}>
        <p className={styles.error}>{loadError}</p>
        <button className={styles.retry} onClick={loadCatalog}>Try again</button>
      </div>
    );
  }
  if (!catalog) return <p className={styles.center}>Loading menu…</p>;

  // Sending is connected to the server in Phase 4.
  function handleSend() {
    setNotice({ kind: 'info', text: 'Sending is not connected yet (Phase 4).' });
  }
  function handleCall() {
    setNotice({ kind: 'info', text: 'Call Staff is not connected yet (Phase 4).' });
  }

  return (
    <>
      <button type="button" className={styles.call} onClick={handleCall}>
        🔔 Call Staff
      </button>

      {notice && (
        <p className={styles[notice.kind]} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}

      <DrinkSection
        catalog={catalog}
        value={selection.drinks[0] ?? null}
        onChange={(drink) => setSelection((s) => ({ ...s, drinks: drink ? [drink] : [] }))}
      />
      <SnackSection
        catalog={catalog}
        value={selection.snacks}
        onChange={(snacks) => setSelection((s) => ({ ...s, snacks }))}
      />
      <CustomSection
        value={selection.custom}
        onChange={(custom) => setSelection((s) => ({ ...s, custom }))}
      />
      <RequestSummary
        lines={summary}
        busy={false}
        onSend={handleSend}
        onClearAll={() => setSelection(emptySelection())}
      />
    </>
  );
}
