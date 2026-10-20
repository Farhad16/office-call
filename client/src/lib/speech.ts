// Browser text-to-speech helpers (Web Speech API).

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Voices load asynchronously in most browsers; wait up to 3s for them. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener('voiceschanged', done);
      clearTimeout(timer);
      resolve(speechSynthesis.getVoices());
    };
    const timer = setTimeout(done, 3000);
    speechSynthesis.addEventListener('voiceschanged', done);
  });
}

export const isBengali = (voice: SpeechSynthesisVoice | null) => !!voice?.lang.toLowerCase().startsWith('bn');

/** Best default: Bangladesh Bengali, then any Bengali, then English, then anything. */
export function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const lang = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  return (
    voices.find((v) => lang(v) === 'bn-bd') ??
    voices.find((v) => lang(v).startsWith('bn')) ??
    voices.find((v) => lang(v).startsWith('en')) ??
    voices[0] ??
    null
  );
}

// Chrome can garbage-collect an utterance mid-speech and never fire `end`; keep a reference.
let current: SpeechSynthesisUtterance | null = null;

/** Speaks text and resolves when finished. Rejects if the browser reports an error. */
export function speak(text: string, voice: SpeechSynthesisVoice | null, rate = 1): Promise<void> {
  if (!speechSupported) return Promise.reject(new Error('This browser cannot speak.'));
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = rate;
    // Safety net: some engines never fire `end`. Allow ~150ms per character, minimum 8s.
    const timer = setTimeout(finish, Math.max(8000, (text.length * 150) / rate));
    function finish() {
      clearTimeout(timer);
      current = null;
      resolve();
    }
    utterance.onend = finish;
    utterance.onerror = (e) => {
      clearTimeout(timer);
      current = null;
      // 'interrupted'/'canceled' happen when we cancel on purpose.
      if (e.error === 'interrupted' || e.error === 'canceled') resolve();
      else reject(new Error(`Speech failed: ${e.error}`));
    };
    current = utterance;
    speechSynthesis.speak(current);
  });
}

/** A short two-note "ding-dong" so people notice before the voice starts. */
export function playChime(ctx: AudioContext): Promise<void> {
  const notes = [880, 660];
  const t0 = ctx.currentTime + 0.05;
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    const start = t0 + i * 0.35;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.55);
  });
  return new Promise((resolve) => setTimeout(resolve, 1000));
}
