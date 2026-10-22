import { Check, MessageSquareText, ReceiptText, Send, X } from 'lucide-react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { CUSTOM_MAX_LENGTH } from '../../../shared/selection.js';
import { Button } from './ui/Button';
import styles from './RequestSummary.module.css';

type Props = {
  lines: string[]; // drinks and snacks (the note is edited here, not listed)
  note: string;
  onNoteChange: (note: string) => void;
  sending: boolean;
  sent: boolean; // short "Sent" state after success
  disabled: boolean;
  onSend: () => void;
  onClearAll: () => void;
};

/**
 * Always on screen: a panel on the right (desktop) or a bar at the bottom (phones).
 * The note field lives here, right above Send, so typing never needs scrolling.
 */
export function RequestSummary({ lines, note, onNoteChange, sending, sent, disabled, onSend, onClearAll }: Props) {
  const empty = lines.length === 0 && note.trim() === '';
  const [listRef] = useAutoAnimate<HTMLUListElement>();

  return (
    <aside className={`${styles.panel} fade-in`} aria-label="Your request">
      <div className={styles.head}>
        <h2>
          <ReceiptText size={18} aria-hidden /> Your request
          {lines.length > 0 && <span className={styles.count}>{lines.length}</span>}
        </h2>
        {!empty && (
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={onClearAll}>
            Clear all
          </Button>
        )}
      </div>
      <div className={styles.body} aria-live="polite">
        {lines.length === 0 ? (
          <p className={styles.empty}>Tap a drink, snacks or a preset, or just write a note.</p>
        ) : (
          <ul ref={listRef} className={styles.lines}>
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
      <label className={styles.note}>
        <MessageSquareText size={16} aria-hidden />
        <input
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          maxLength={CUSTOM_MAX_LENGTH}
          placeholder="Add a note: glass of water, HDMI cable…"
          aria-label="Note or custom request"
          enterKeyHint="send"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !empty && !disabled) onSend();
          }}
        />
        {note && (
          <button type="button" className={styles.noteClear} onClick={() => onNoteChange('')} aria-label="Clear note">
            <X size={14} />
          </button>
        )}
      </label>
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
