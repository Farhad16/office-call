import { CUSTOM_MAX_LENGTH } from '../../../shared/selection.js';
import styles from './sections.module.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function CustomSection({ value, onChange }: Props) {
  return (
    <section className={styles.section} aria-labelledby="custom-title">
      <div className={styles.sectionHead}>
        <h2 id="custom-title">Custom request</h2>
        {value && (
          <button type="button" className={styles.clear} onClick={() => onChange('')}>Clear</button>
        )}
      </div>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={CUSTOM_MAX_LENGTH}
        rows={2}
        placeholder="e.g. A glass of water, an HDMI cable…"
        aria-describedby="custom-count"
      />
      <p id="custom-count" className={styles.counter}>{value.length}/{CUSTOM_MAX_LENGTH}</p>
    </section>
  );
}
