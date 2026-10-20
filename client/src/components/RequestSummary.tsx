import styles from './sections.module.css';

export type Notice = { kind: 'success' | 'error' | 'info'; text: string };

type Props = {
  lines: string[];
  notice: Notice | null; // result of the last send or call; shown here so it is always on screen
  sendLabel: string;
  disabled: boolean;
  onSend: () => void;
  onClearAll: () => void;
};

export function RequestSummary({ lines, notice, sendLabel, disabled, onSend, onClearAll }: Props) {
  const empty = lines.length === 0;
  return (
    <div className={styles.summaryBar}>
      <div className={styles.summary} aria-live="polite">
        {empty ? (
          <p className={styles.muted}>Nothing selected yet.</p>
        ) : (
          <>
            <div className={styles.sectionHead}>
              <strong>Your request</strong>
              <button type="button" className={styles.clear} onClick={onClearAll}>
                Clear all
              </button>
            </div>
            <ul>
              {lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      {notice && (
        <p className={styles.notice} data-kind={notice.kind} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
      <button type="button" className={styles.send} onClick={onSend} disabled={empty || disabled}>
        {sendLabel}
      </button>
    </div>
  );
}
