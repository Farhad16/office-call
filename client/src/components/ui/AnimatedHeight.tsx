import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Smoothly animates its height when the content grows or shrinks (rows added/removed),
 * instead of making everything below jump. Measures the content with a ResizeObserver.
 */
export function AnimatedHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    setHeight(el.offsetHeight);
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      style={{
        height,
        overflow: 'hidden',
        transition: 'height 0.28s var(--ease)',
        // room for focus rings and shadows that would otherwise be clipped
        margin: '-4px',
        padding: '4px',
        boxSizing: 'content-box',
      }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
