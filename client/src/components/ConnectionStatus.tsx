import type { Connection } from '../lib/socket';
import styles from './ConnectionStatus.module.css';

export function ConnectionStatus({ connected, receiverOnline }: Connection) {
  const [tone, text] = !connected
    ? (['bad', 'Not connected to the office server. Reconnecting…'] as const)
    : receiverOnline
      ? (['good', 'Speaker online'] as const)
      : (['warn', 'Speaker offline: requests are saved but not announced yet'] as const);
  return (
    <p className={styles.status} data-tone={tone} role="status">
      <span className={styles.dot} aria-hidden />
      {text}
    </p>
  );
}
