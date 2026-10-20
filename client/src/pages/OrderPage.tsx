import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Catalog, OfficeRequest, RequestType, Selection, User } from '../../../shared/types.js';
import { emptySelection, summarizeSelection } from '../../../shared/selection.js';
import { errorMessage, getJson, postJson } from '../lib/api';
import { newRequestId } from '../lib/ids';
import { socket, useConnection } from '../lib/socket';
import { DrinkSection } from '../components/DrinkSection';
import { SnackSection } from '../components/SnackSection';
import { CustomSection } from '../components/CustomSection';
import { RequestSummary, type Notice } from '../components/RequestSummary';
import { PresetBar } from '../components/PresetBar';
import { ConnectionStatus } from '../components/ConnectionStatus';
import styles from './OrderPage.module.css';

type CreateResponse = { request: OfficeRequest; receiverOnline: boolean };

/** After a successful send, the same button stays disabled this long to stop double taps. */
const COOLDOWN_MS = 4000;

export function OrderPage({ user }: { user: User }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sending, setSending] = useState<RequestType | null>(null);
  const [cooldown, setCooldown] = useState<RequestType | null>(null);
  const [lastSentId, setLastSentId] = useState<number | null>(null);
  const connection = useConnection();

  // Reused when retrying the exact same request, so the server can drop duplicates.
  const pending = useRef<{ key: string; id: string } | null>(null);

  const fetchCatalog = useCallback(() => {
    getJson<Catalog>('/api/items')
      .then(setCatalog)
      .catch((err: Error) => setLoadError(err.message));
  }, []);
  useEffect(fetchCatalog, [fetchCatalog]);

  // When the receiver finishes speaking our last request, say so.
  useEffect(() => {
    if (lastSentId === null) return;
    const onUpdated = (request: OfficeRequest) => {
      if (request.id === lastSentId && request.announced) {
        setNotice({ kind: 'success', text: 'Announced on the office speaker ✓' });
      }
    };
    socket.on('request:updated', onUpdated);
    return () => {
      socket.off('request:updated', onUpdated);
    };
  }, [lastSentId]);

  // End the cooldown after a few seconds.
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(null), COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const summary = useMemo(() => (catalog ? summarizeSelection(selection, catalog) : []), [selection, catalog]);

  function retryCatalog() {
    setLoadError(null);
    fetchCatalog();
  }

  async function send(type: RequestType) {
    if (sending) return;
    const body = { userId: user.id, type, selection: type === 'order' ? selection : undefined };
    const key = JSON.stringify(body);
    if (pending.current?.key !== key) pending.current = { key, id: newRequestId() };

    setSending(type);
    setNotice(null);
    try {
      const res = await postJson<CreateResponse>('/api/requests', { ...body, clientRequestId: pending.current.id });
      pending.current = null;
      setLastSentId(res.request.id);
      setCooldown(type);
      const what = type === 'call' ? 'Call sent' : 'Request sent';
      setNotice(
        res.request.announced
          ? { kind: 'success', text: 'Announced on the office speaker ✓' }
          : res.receiverOnline
            ? { kind: 'success', text: `${what} ✓ Waiting for the speaker…` }
            : {
                kind: 'info',
                text: `${what} and saved, but the speaker is offline. It will be announced when the receiver is opened.`,
              },
      );
    } catch (err) {
      // Not confirmed by the server: never claim it was delivered.
      setNotice({ kind: 'error', text: `Not sent: ${errorMessage(err)} Tap again to retry.` });
    } finally {
      setSending(null);
    }
  }

  if (loadError) {
    return (
      <div className={styles.center}>
        <p className={styles.error}>{loadError}</p>
        <button className={styles.retry} onClick={retryCatalog}>
          Try again
        </button>
      </div>
    );
  }
  if (!catalog) return <p className={styles.center}>Loading menu…</p>;

  return (
    <>
      <ConnectionStatus {...connection} />

      <button
        type="button"
        className={styles.call}
        onClick={() => send('call')}
        disabled={sending !== null || cooldown === 'call'}
      >
        {sending === 'call' ? 'Calling…' : cooldown === 'call' ? 'Called ✓' : '🔔 Call Staff'}
      </button>

      <PresetBar user={user} catalog={catalog} selection={selection} onLoad={setSelection} />

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
      <CustomSection value={selection.custom} onChange={(custom) => setSelection((s) => ({ ...s, custom }))} />
      <RequestSummary
        lines={summary}
        notice={notice}
        sendLabel={sending === 'order' ? 'Sending…' : cooldown === 'order' ? 'Sent ✓' : 'Send Request'}
        disabled={sending !== null || cooldown === 'order'}
        onSend={() => send('order')}
        onClearAll={() => setSelection(emptySelection())}
      />
    </>
  );
}
