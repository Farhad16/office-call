import { Cookie } from 'lucide-react';
import type { Catalog, SnackLine } from '../../../shared/types.js';
import { QtyStepper } from './QtyStepper';
import { Button } from './ui/Button';
import styles from './sections.module.css';

type Props = {
  catalog: Catalog;
  value: SnackLine[];
  onChange: (value: SnackLine[]) => void;
};

export function SnackSection({ catalog, value, onChange }: Props) {
  function qtyOf(itemId: string): number {
    return value.find((line) => line.itemId === itemId)?.qty ?? 0;
  }

  // Keeps catalog order and drops lines that reach 0.
  function setQty(itemId: string, qty: number) {
    const next = catalog.snacks
      .map((item) => ({ itemId: item.id, qty: item.id === itemId ? qty : qtyOf(item.id) }))
      .filter((line) => line.qty > 0);
    onChange(next);
  }

  return (
    <section className={styles.section} aria-labelledby="snacks-title">
      <div className={styles.sectionHead}>
        <h2 id="snacks-title">
          <span className={styles.sectionIcon} aria-hidden>
            <Cookie size={17} />
          </span>
          Snacks
        </h2>
        {value.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>
            Clear
          </Button>
        )}
      </div>
      <ul className={styles.snacks}>
        {catalog.snacks.map((item) => {
          const qty = qtyOf(item.id);
          return (
            <li key={item.id} className={styles.snack} data-active={qty > 0 || undefined}>
              <span className={styles.snackName}>
                <span className={styles.snackEmoji} aria-hidden>
                  {item.emoji}
                </span>
                {item.label}
              </span>
              <QtyStepper
                value={qty}
                min={0}
                max={item.maxQty}
                label={item.label}
                onChange={(q) => setQty(item.id, q)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
