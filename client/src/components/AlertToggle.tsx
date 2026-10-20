import { Volume2, VolumeX } from 'lucide-react';
import type { User } from '../../../shared/types.js';
import { useReceiverAlerts } from '../lib/useReceiverAlerts';
import styles from './AlertToggle.module.css';

/** Receivers only: alert sound for new requests, with a mute button for the header. */
export function AlertToggle({ user, onView }: { user: User; onView: () => void }) {
  const [muted, setMuted] = useReceiverAlerts(user, onView);
  return (
    <button
      type="button"
      className={styles.toggle}
      data-muted={muted || undefined}
      onClick={() => setMuted(!muted)}
      aria-pressed={!muted}
      aria-label={muted ? 'Alert sound off. Turn on' : 'Alert sound on. Mute'}
      title={muted ? 'Alert sound off' : 'Alert sound on'}
    >
      {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
    </button>
  );
}
