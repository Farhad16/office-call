import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Check, LoaderCircle, RefreshCw, WifiOff } from 'lucide-react';
import type { Catalog, OfficeRequest, RequestType, Selection, User } from '../../../shared/types.js';
import { emptySelection, summarizeSelection } from '../../../shared/selection.js';
import { errorMessage, getJson, postJson } from '../lib/api';
import { newRequestId } from '../lib/ids';
import { socket, useConnection } from '../lib/socket';
import { DrinkSection } from '../components/DrinkSection';
import { SnackSection } from '../components/SnackSection';
import { CustomSection } from '../components/CustomSection';
import { RequestSummary } from '../components/RequestSummary';
import { PresetBar } from '../components/PresetBar';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { Button } from '../components/ui/Button';
import styles from './OrderPage.module.css';

type CreateResponse = { request: OfficeRequest; receiverOnline: boolean };

/** After a successful send, the same button stays disabled this long to stop double taps. */
const COOLDOWN_MS = 4000;

export function OrderPage({ user }: { user: User }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [sending, setSending] = useState<RequestType | null>(null);
  const [cooldown, setCooldown] = useState<RequestType | null>(null);
  const [lastSent, setLastSent] = useState<{ id: number; toastId: string } | null>(null);
  const connection = useConnection();

  // Reused when retrying the exact same request, so the server can drop duplicates.
  const pending = useRef<{ key: string; id: string } | null>(null);

  const fetchCatalog = useCallback(() => {
    getJson<Catalog>('/api/items')
      .then(setCatalog)
      .catch((err: Error) => setLoadError(err.message));
  }, []);
  useEffect(fetchCatalog, [fetchCatalog]);

  // When the speaker finishes our last request, update its toast.
  useEffect(() => {
    if (!lastSent) return;
    const onUpdated = (request: OfficeRequest) => {
      if (request.id === lastSent.id && request.announced) {
        toast.success('Announced on the office speaker', { id: lastSent.toastId, description: undefined });
      }
    };
    socket.on('request:updated', onUpdated);
    return () => {
      socket.off('request:updated', onUpdated);
    };
  }, [lastSent]);

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
    const toastId = `send-${pending.current.id}`;

    setSending(type);
    toast.loading(type === 'call' ? 'Calling staff…' : 'Sending your request…', { id: toastId });
    try {
      const res = await postJson<CreateResponse>('/api/requests', { ...body, clientRequestId: pending.current.id });
      pending.current = null;
      setLastSent({ id: res.request.id, toastId });
      setCooldown(type);
      const what = type === 'call' ? 'Staff called' : 'Request sent';
      if (res.request.announced) toast.success('Announced on the office speaker', { id: toastId });
      else if (res.receiverOnline) toast.success(what, { id: toastId, description: 'Waiting for the speaker…' });
      else
        toast.warning(`${what}, speaker offline`, {
          id: toastId,
          description: 'Saved. It will be announced when the speaker page is opened.',
          duration: 7000,
        });
    } catch (err) {
      // Not confirmed by the server: never claim it was delivered.
      toast.error('Not sent', { id: toastId, description: `${errorMessage(err)} Tap again to retry.`, duration: 8000 });
    } finally {
      setSending(null);
    }
  }

  if (loadError) {
    return (
      <div className={styles.center}>
        <span className={styles.centerIcon} aria-hidden>
          <WifiOff size={24} />
        </span>
        <p>{loadError}</p>
        <Button variant="primary" icon={<RefreshCw size={16} />} onClick={retryCatalog}>
          Try again
        </Button>
      </div>
    );
  }
  if (!catalog) {
    return (
      <div className={styles.center}>
        <LoaderCircle className="spin" size={26} aria-hidden />
        <p>Loading menu…</p>
      </div>
    );
  }

  const calling = sending === 'call';
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.hero}>
          <div>
            <h1 className={styles.greeting}>Hi {user.name.split(' ')[0]} 👋</h1>
            <ConnectionStatus {...connection} />
          </div>
          <Button
            variant="secondary"
            size="lg"
            className={styles.call}
            onClick={() => send('call')}
            loading={calling}
            disabled={sending !== null || cooldown === 'call'}
            icon={cooldown === 'call' ? <Check size={18} /> : <BellRing size={18} />}
          >
            {calling ? 'Calling…' : cooldown === 'call' ? 'Called' : 'Call Staff'}
          </Button>
        </div>

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
      </div>

      <RequestSummary
        lines={summary}
        sending={sending === 'order'}
        sent={cooldown === 'order'}
        disabled={sending !== null || cooldown === 'order'}
        onSend={() => send('order')}
        onClearAll={() => setSelection(emptySelection())}
      />
    </div>
  );
}
