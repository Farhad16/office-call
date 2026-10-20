import { Check, ReceiptText, Send, X } from 'lucide-react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Button } from './ui/Button';
import styles from './RequestSummary.module.css';

type Props = {
  lines: string[];
  sending: boolean;
  sent: boolean; // short "Sent" state after success
  disabled: boolean;
  onSend: () => void;
  onClearAll: () => void;
};

/** Phones: a bar stuck to the bottom. Desktop: a panel that follows you on the right. */
export function RequestSummary({ lines, sending, sent, disabled, onSend, onClearAll }: Props) {
  const empty = lines.length === 0;
  const [listRef] = useAutoAnimate<HTMLUListElement>();

  return (
    <aside className={styles.panel} aria-label="Your request">
      <div className={styles.head}>
        <h2>
          <ReceiptText size={18} aria-hidden /> Your request
          {!empty && <span className={styles.count}>{lines.length}</span>}
        </h2>
        {!empty && (
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={onClearAll}>
            Clear all
          </Button>
        )}
      </div>
      <div className={styles.body} aria-live="polite">
        {empty ? (
          <p className={styles.empty}>Pick a drink, snacks or write a request.</p>
        ) : (
          <ul ref={listRef} className={styles.lines}>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
      <Button
        variant="primary"
        size="lg"
        block
        onClick={onSend}
        disabled={empty || disabled}
        loading={sending}
        icon={sent ? <Check size={18} /> : <Send size={18} />}
      >
        {sending ? 'Sending…' : sent ? 'Sent' : 'Send Request'}
      </Button>
    </aside>
  );
}
