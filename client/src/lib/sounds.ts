// Short alert sounds made with Web Audio (no audio files, works offline).
// Browsers only allow sound after the user clicked or typed on the page, so the
// AudioContext is created or resumed on the first click/key press.

let ctx: AudioContext | null = null;
const listeners = new Set<(ready: boolean) => void>();

function notify() {
  const ready = soundReady();
  listeners.forEach((fn) => fn(ready));
}

// True while an in-app speaker is running; its own chime is enough then.
let speakerActive = false;
export function setSpeakerActive(active: boolean) {
  speakerActive = active;
}
export function isSpeakerActive(): boolean {
  return speakerActive;
}

export function soundReady(): boolean {
  return ctx?.state === 'running';
}

/** Called with true/false whenever sound becomes allowed or blocked. Returns an unsubscribe. */
export function onSoundReadyChange(fn: (ready: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Creates/resumes the AudioContext. Only works inside a click or key handler. */
export function unlockSound(): void {
  try {
    if (!ctx) {
      const Ctx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctx();
      ctx.addEventListener('statechange', notify);
    }
    ctx.resume().then(notify, notify);
  } catch {
    // no Web Audio: alerts stay silent, toasts still show
  }
}

// Any click or key press anywhere unlocks sound.
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockSound, { capture: true });
  window.addEventListener('keydown', unlockSound, { capture: true });
}

function tone(freq: number, start: number, length: number, volume = 0.35, type: OscillatorType = 'sine') {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

/** Soft "ding-dong" for a new order. */
export function playOrderSound(): boolean {
  if (!soundReady()) return false;
  const t = ctx!.currentTime + 0.02;
  tone(988, t, 0.45);
  tone(740, t + 0.28, 0.6);
  return true;
}

/** Louder ring (three quick double beeps) for "Call Staff". */
export function playCallSound(): boolean {
  if (!soundReady()) return false;
  const t = ctx!.currentTime + 0.02;
  for (let i = 0; i < 3; i++) {
    tone(1320, t + i * 0.42, 0.14, 0.4, 'triangle');
    tone(1320, t + i * 0.42 + 0.17, 0.14, 0.4, 'triangle');
  }
  return true;
}
