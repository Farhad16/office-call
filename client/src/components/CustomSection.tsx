import { MessageSquareText } from 'lucide-react';
import { CUSTOM_MAX_LENGTH } from '../../../shared/selection.js';
import { Button } from './ui/Button';
import styles from './sections.module.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function CustomSection({ value, onChange }: Props) {
  return (
    <section className={`${styles.section} reveal`} aria-labelledby="custom-title">
      <div className={styles.sectionHead}>
        <h2 id="custom-title">
          <span className={styles.sectionIcon} aria-hidden>
            <MessageSquareText size={17} />
          </span>
          <label htmlFor="custom-text">Custom request</label>
        </h2>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange('')}>
            Clear
          </Button>
        )}
      </div>
      <textarea
        id="custom-text"
        className={`input ${styles.textarea}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={CUSTOM_MAX_LENGTH}
        rows={2}
        placeholder="e.g. A glass of water, an HDMI cable…"
        aria-describedby="custom-count"
      />
      <p id="custom-count" className={styles.counter}>
        {value.length}/{CUSTOM_MAX_LENGTH}
      </p>
    </section>
  );
}
