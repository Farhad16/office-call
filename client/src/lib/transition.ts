import { flushSync } from 'react-dom';

/**
 * Runs a state change inside a View Transition, so the old and new screens crossfade
 * instead of jumping. Browsers without View Transitions (or with reduced motion on)
 * just apply the change.
 */
export function withTransition(update: () => void): void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || reduce) {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}
