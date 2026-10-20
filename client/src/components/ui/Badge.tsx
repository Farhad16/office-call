import type { ReactNode } from 'react';
import styles from './Badge.module.css';

type Props = {
  tone?: 'neutral' | 'warning' | 'accent' | 'success' | 'danger' | 'info';
  dot?: boolean;
  children: ReactNode;
};

export function Badge({ tone = 'neutral', dot = false, children }: Props) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {dot && <span className={styles.dot} aria-hidden />}
      {children}
    </span>
  );
}
