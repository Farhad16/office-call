import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { User } from '../../../shared/types.js';
import { useReceiverAlerts } from '../lib/useReceiverAlerts';
import { justUnlocked, onSoundReadyChange, soundReady, unlockSound } from '../lib/sounds';
import styles from './AlertToggle.module.css';

/**
 * Receivers only: alert sound for new requests. The button has three looks:
 * on (green), muted (grey), and blocked (amber, pulsing): the browser needs one click
 * before it may play sound, and clicking this button is that click.
 */
export function AlertToggle({ user, onView }: { user: User; onView: () => void }) {
  const [muted, setMuted] = useReceiverAlerts(user, onView);
  const [ready, setReady] = useState(soundReady);
  useEffect(() => onSoundReadyChange(setReady), []);
  const blocked = !muted && !ready;
  const label = blocked
    ? 'Sound is blocked by the browser. Click to turn on'
    : muted
      ? 'Alert sound off. Turn on'
      : 'Alert sound on. Mute';

  return (
    <button
      type="button"
      className={styles.toggle}
      data-muted={muted || undefined}
      data-blocked={blocked || undefined}
      onClick={() => {
        // A click that just switched sound on (the page-wide handler runs first) must not
        // also mute it.
        if (blocked || justUnlocked()) {
          unlockSound();
          return;
        }
        setMuted(!muted);
      }}
      aria-pressed={!muted}
      aria-label={label}
      title={label}
    >
      {muted || blocked ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
      {blocked && <span className={styles.hint}>Click for sound</span>}
    </button>
  );
}
