import type { ReactNode } from 'react';
import styles from './Switch.module.css';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
};

/** A checkbox that looks like an on/off switch. Still a real checkbox for keyboards and screen readers. */
export function Switch({ checked, onChange, label, hint }: Props) {
  return (
    <label className={styles.row}>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.track} aria-hidden />
    </label>
  );
}
