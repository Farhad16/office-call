import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  BellRing,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  History,
  LayoutDashboard,
  LoaderCircle,
  Megaphone,
  Play,
  Settings2,
  TriangleAlert,
  Volume2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { Catalog, OfficeRequest } from '../../../shared/types.js';
import { buildAnnouncement, type AnnounceLanguage } from '../../../shared/announce.js';
import { errorMessage, getJson } from '../lib/api';
import { socket } from '../lib/socket';
import { AnnouncementQueue } from '../lib/announcementQueue';
import {
  isBengali,
  loadVoices,
  pickVoice,
  playChime,
  speak,
  speechSupported,
  type VoicePreference,
} from '../lib/speech';
import { readStored, writeStored } from '../lib/storage';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Segmented } from '../components/ui/Segmented';
import { Switch } from '../components/ui/Switch';
import styles from './ReceiverPage.module.css';

type ItemState = 'waiting' | 'queued' | 'speaking' | 'announced' | 'skipped' | 'deleted' | 'failed';
type HistoryItem = { request: OfficeRequest; state: ItemState; error?: string };

type Settings = { language: VoicePreference; voiceURI: string; rate: number; repeat: boolean; chime: boolean };
const SETTINGS_KEY = 'officeCall.receiverSettings';
const DEFAULT_SETTINGS: Settings = { language: 'auto', voiceURI: '', rate: 0.95, repeat: false, chime: true };

const LANGUAGES: { id: VoicePreference; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'bn', label: 'বাংলা' },
  { id: 'en', label: 'English' },
];
const HISTORY_LIMIT = 50;

const STATE_LABEL: Record<ItemState, string> = {
  waiting: 'Waiting',
  queued: 'In queue',
  speaking: 'Speaking…',
  announced: 'Announced',
  skipped: 'Done before announced',
  deleted: 'Deleted',
  failed: 'Failed',
};

const STATE_TONE = {
  waiting: 'neutral',
  queued: 'info',
  speaking: 'accent',
  announced: 'success',
  skipped: 'neutral',
  deleted: 'neutral',
  failed: 'danger',
} as const;

const SAMPLE_ORDER: OfficeRequest['selection'] = {
  drinks: [{ itemId: 'tea', qty: 1, options: { sugar: 'less', milk: false, ginger: true, lemon: true } }],
  snacks: [
    { itemId: 'chanachur-makha', qty: 1 },
    { itemId: 'biscuit', qty: 2 },
  ],
  custom: '',
};

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const AUTOSTART = new URLSearchParams(window.location.search).get('autostart') === '1';
let testId = 0; // test announcements use negative ids and are never sent to the server

export function ReceiverPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);
  const [settings, setSettings] = useState<Settings>(() => readStored(SETTINGS_KEY, DEFAULT_SETTINGS));
  const [started, setStarted] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoBlocked, setAutoBlocked] = useState(false);
  const [historyRef] = useAutoAnimate<HTMLUListElement>();

  // A voice picked by hand wins; otherwise the best voice for the chosen language.
  const autoVoice = pickVoice(voices ?? [], settings.language);
  const voice = voices?.find((v) => v.voiceURI === settings.voiceURI) ?? autoVoice;
  // Auto: speak Bengali text only when the voice can speak Bengali.
  const lang: AnnounceLanguage = settings.language === 'auto' ? (isBengali(voice) ? 'bn' : 'en') : settings.language;
  const hasBengali = !!voices?.some((v) => isBengali(v));

  // The queue runs outside React renders, so it reads the latest values from this ref.
  const latest = useRef({ catalog, voice, lang, settings });
  useEffect(() => {
    latest.current = { catalog, voice, lang, settings };
  });
  const audioCtx = useRef<AudioContext | null>(null);
  const queue = useRef<AnnouncementQueue<OfficeRequest> | null>(null);

  useEffect(() => {
    getJson<Catalog>('/api/items')
      .then(setCatalog)
      .catch((err) => setError(errorMessage(err)));
    loadVoices().then(setVoices);
  }, []);

  useEffect(() => writeStored(SETTINGS_KEY, settings), [settings]);

  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);

  /** Adds or updates a history row (newest first). */
  function upsert(request: OfficeRequest, patch: Partial<HistoryItem>) {
    setHistory((list) => {
      const index = list.findIndex((h) => h.request.id === request.id);
      if (index === -1) {
        const item: HistoryItem = { request, state: 'queued', ...patch };
        return [item, ...list].slice(0, HISTORY_LIMIT);
      }
      const next = [...list];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  async function announce(request: OfficeRequest) {
    const { catalog, voice, lang, settings } = latest.current;
    if (!catalog) throw new Error('Menu not loaded');
    const text = buildAnnouncement(request, catalog, lang);
    upsert(request, { state: 'speaking', error: undefined });
    try {
      if (settings.chime && audioCtx.current) await playChime(audioCtx.current);
      await speak(text, voice, settings.rate);
      if (settings.repeat) {
        await pause(700);
        await speak(text, voice, settings.rate);
      }
      upsert(request, { state: 'announced' });
      if (request.id > 0) socket.emit('request:announced', { id: request.id });
    } catch (err) {
      upsert(request, { state: 'failed', error: errorMessage(err) });
    }
    await pause(400); // small gap between announcements
  }

  function enqueue(request: OfficeRequest) {
    const q = queue.current;
    if (!q || q.has(request.id)) return;
    upsert(request, { state: 'queued' });
    q.add(request);
  }

  /**
   * Turns on sound and starts listening. Browsers only allow sound after a click, so this
   * normally runs from the Start button. With `auto` (from ?autostart=1) it gives up quietly
   * if the browser still blocks sound, and the Start button stays visible.
   */
  async function start(auto = false) {
    let ctx: AudioContext | null;
    try {
      const Ctx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      // resume() never settles while sound is blocked, so don't wait forever.
      await Promise.race([ctx.resume(), pause(800)]);
    } catch {
      ctx = null; // chime off, speech may still work
    }
    if (auto && ctx?.state !== 'running') {
      ctx?.close().catch(() => {});
      setAutoBlocked(true);
      return;
    }
    audioCtx.current = ctx;
    setError(null);
    queue.current = new AnnouncementQueue(announce);
    try {
      const recent = await getJson<OfficeRequest[]>('/api/requests/recent?limit=30');
      setHistory(
        recent.map((request) => ({
          request,
          state: request.announced ? 'announced' : request.status === 'done' ? 'skipped' : 'waiting',
        })),
      );
    } catch (err) {
      setError(`Could not load history: ${errorMessage(err)}`);
    }
    setStarted(true);
  }

  // ?autostart=1: try to start as soon as the menu and voices are ready.
  const [autoTried, setAutoTried] = useState(false);
  const ready = catalog !== null && voices !== null;
  useEffect(() => {
    if (!AUTOSTART || autoTried || !ready) return;
    const timer = setTimeout(() => {
      setAutoTried(true);
      start(true);
    }, 0);
    return () => clearTimeout(timer);
    // start only touches refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, autoTried]);

  // Once started: register as receiver (again after every reconnect) and listen for requests.
  useEffect(() => {
    if (!started) return;
    const join = () => socket.emit('receiver:join', (pending) => pending.forEach(enqueue));
    const onNew = (request: OfficeRequest) => enqueue(request);
    // Status changes are never announced. If staff finished a request before it was
    // spoken, take it out of the queue.
    const onUpdated = (request: OfficeRequest) => {
      if (request.status === 'done' && queue.current?.remove(request.id)) upsert(request, { state: 'skipped' });
    };
    // Deleted by the sender before it was spoken: don't announce it.
    const onDeleted = ({ ids }: { ids: number[] }) => {
      for (const id of ids) {
        const waiting = queue.current?.remove(id);
        setHistory((list) =>
          list.map((h) =>
            h.request.id === id && (waiting || h.state !== 'speaking') ? { ...h, state: 'deleted' } : h,
          ),
        );
      }
    };
    socket.on('connect', join);
    socket.on('request:new', onNew);
    socket.on('request:updated', onUpdated);
    socket.on('request:deleted', onDeleted);
    if (socket.connected) join();
    return () => {
      socket.off('connect', join);
      socket.off('request:new', onNew);
      socket.off('request:updated', onUpdated);
      socket.off('request:deleted', onDeleted);
    };
    // enqueue only touches refs and state setters, so it is safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Ask the OS not to sleep the screen while the receiver runs (works on localhost/HTTPS).
  useEffect(() => {
    if (!started || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      if (document.visibilityState === 'visible') {
        navigator.wakeLock
          .request('screen')
          .then((l) => (lock = l))
          .catch(() => {});
      }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      lock?.release().catch(() => {});
    };
  }, [started]);

  function test(type: 'order' | 'call') {
    const now = new Date().toISOString();
    enqueue({
      id: --testId,
      userId: 0,
      userName: 'Farhad',
      type,
      selection: type === 'order' ? SAMPLE_ORDER : null,
      status: 'pending',
      announced: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      completedBy: null,
    });
  }

  const textOf = (r: OfficeRequest) => (catalog ? buildAnnouncement(r, catalog, lang) : '…');
  const speaking = history.find((h) => h.state === 'speaking');
  const queued = history.filter((h) => h.state === 'queued').length;
  const sortedVoices = [...(voices ?? [])].sort((a, b) => Number(isBengali(b)) - Number(isBengali(a)));

  const languagePicker = (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>Announcement language</span>
      <Segmented
        name="language"
        label="Announcement language"
        value={settings.language}
        // Changing language goes back to the automatic voice for that language.
        onChange={(language) => setSettings({ ...settings, language, voiceURI: '' })}
        options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
      />
    </div>
  );

  const callout = (tone: 'good' | 'warn' | 'bad' | 'muted', content: ReactNode) => (
    <p className={styles.callout} data-tone={tone}>
      {tone === 'good' ? (
        <CircleCheck size={16} aria-hidden />
      ) : tone === 'muted' ? (
        <LoaderCircle size={16} className="spin" aria-hidden />
      ) : (
        <TriangleAlert size={16} aria-hidden />
      )}
      <span>{content}</span>
    </p>
  );

  const voiceInfo = !speechSupported
    ? callout('bad', 'This browser cannot speak. Use Google Chrome.')
    : voices === null
      ? callout('muted', 'Checking voices…')
      : voices.length === 0
        ? callout(
            'bad',
            <>
              No voices installed. On Linux run <code>sudo apt install speech-dispatcher espeak-ng</code> and restart
              Chrome.
            </>,
          )
        : lang === 'bn' && !isBengali(voice)
          ? callout(
              'bad',
              `বাংলা is selected, but “${voice?.name}” cannot speak Bengali. Install a Bengali voice (README → Voice) or choose English.`,
            )
          : lang === 'en' && settings.language === 'auto' && !hasBengali
            ? callout('warn', `Speaking English with “${voice?.name}”: no Bengali voice found. See README → Voice.`)
            : callout('good', `Speaking ${lang === 'bn' ? 'বাংলা' : 'English'} with “${voice?.name}” (${voice?.lang})`);

  const statusPill = (
    <span className={styles.pill} data-ok={connected && started} data-bad={!connected || undefined}>
      {connected ? <Wifi size={14} aria-hidden /> : <WifiOff size={14} aria-hidden />}
      {!connected ? 'Disconnected, reconnecting…' : started ? 'Listening' : 'Not started'}
    </span>
  );

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.brand}>
            <span className={styles.logo} aria-hidden>
              <Megaphone size={17} strokeWidth={2.4} />
            </span>
            Office Call · Speaker
          </span>
          <span className={styles.headerRight}>
            {statusPill}
            {/* New tab, so this speaker tab keeps running. */}
            <a href="/dashboard" target="_blank" rel="noopener" className={styles.dashLink}>
              <LayoutDashboard size={15} aria-hidden /> Open dashboard <ExternalLink size={13} aria-hidden />
            </a>
          </span>
        </div>
      </header>

      <main className={styles.page}>
        {error && callout('bad', error)}

        {!started ? (
          <section className={`${styles.startCard} fade-in`}>
            <span className={styles.startIcon} aria-hidden>
              <Volume2 size={30} />
            </span>
            <h1>Start the speaker</h1>
            <p className={styles.muted}>
              Keep this page open on the office computer with the speaker on. Click once to turn on sound.
            </p>
            {languagePicker}
            {voiceInfo}
            {autoBlocked &&
              callout(
                'warn',
                'The browser blocked automatic sound. Click Start once (or see docs/DEPLOY.md to allow it).',
              )}
            <Button
              variant="primary"
              size="lg"
              block
              icon={<Volume2 size={18} />}
              onClick={() => start()}
              disabled={!catalog}
            >
              Start speaker
            </Button>
          </section>
        ) : (
          <div className={styles.grid}>
            <div className={styles.column}>
              <section className={styles.now} data-speaking={!!speaking || undefined} aria-live="polite">
                <div className={styles.wave} aria-hidden>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                {speaking ? (
                  <>
                    <p className={styles.nowLabel}>Now speaking</p>
                    <p className={styles.nowText}>{textOf(speaking.request)}</p>
                  </>
                ) : (
                  <p className={styles.nowLabel}>Waiting for requests…</p>
                )}
                {queued > 0 && <Badge tone="info">{queued} more in queue</Badge>}
              </section>

              <section className={`${styles.card} reveal`}>
                <h2>
                  <Settings2 size={17} aria-hidden /> Voice
                </h2>
                {languagePicker}
                {voiceInfo}
                <div className={styles.controls}>
                  <Button icon={<Play size={15} />} onClick={() => test('order')}>
                    Test order
                  </Button>
                  <Button icon={<BellRing size={15} />} onClick={() => test('call')}>
                    Test call
                  </Button>
                </div>
                <details className={styles.details}>
                  <summary>
                    More voice settings <ChevronDown size={16} aria-hidden />
                  </summary>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Voice</span>
                    <select
                      className="input"
                      value={settings.voiceURI}
                      onChange={(e) => setSettings({ ...settings, voiceURI: e.target.value })}
                    >
                      <option value="">Automatic ({autoVoice?.name ?? 'none'})</option>
                      {sortedVoices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      Speed <span className={styles.muted}>{settings.rate.toFixed(2)}×</span>
                    </span>
                    <input
                      type="range"
                      className={styles.range}
                      min={0.6}
                      max={1.4}
                      step={0.05}
                      value={settings.rate}
                      onChange={(e) => setSettings({ ...settings, rate: Number(e.target.value) })}
                    />
                  </label>
                  <div className={styles.switches}>
                    <Switch
                      checked={settings.chime}
                      onChange={(chime) => setSettings({ ...settings, chime })}
                      label="Play a chime first"
                    />
                    <Switch
                      checked={settings.repeat}
                      onChange={(repeat) => setSettings({ ...settings, repeat })}
                      label="Say every announcement twice"
                    />
                  </div>
                </details>
              </section>
            </div>

            <section className={`${styles.card} ${styles.historyCard} fade-in`}>
              <h2>
                <History size={17} aria-hidden /> Recent requests
              </h2>
              {history.length === 0 ? (
                <p className={styles.muted}>No requests yet.</p>
              ) : (
                <ul ref={historyRef} className={styles.history}>
                  {history.map(({ request, state, error }) => (
                    <li key={request.id} data-state={state}>
                      <span className={styles.time}>{timeOf(request.createdAt)}</span>
                      <span className={styles.text}>
                        {textOf(request)}
                        {request.id < 0 && <em className={styles.muted}> (test)</em>}
                        {error && <span className={styles.errorText}> {error}</span>}
                      </span>
                      <Badge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
