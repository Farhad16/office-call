import type { ReactNode } from 'react';
import styles from './Segmented.module.css';

type Option<T extends string> = { value: T; label: ReactNode };
type Props<T extends string> = {
  name: string;
  label: string; // for screen readers
  options: Option<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
};

/** Pick-one buttons in a row (radio group underneath). */
export function Segmented<T extends string>({ name, label, options, value, onChange, size = 'md' }: Props<T>) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={label} data-size={size}>
      {options.map((o) => (
        <label key={o.value} className={styles.option}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
