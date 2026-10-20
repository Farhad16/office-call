import { useState } from 'react';
import { Coffee } from 'lucide-react';
import type { Catalog, DrinkLine, OptionValue } from '../../../shared/types.js';
import { findItem, isOptionVisible, itemOptions, newDrinkLine, visibleValues } from '../../../shared/selection.js';
import { QtyStepper } from './QtyStepper';
import { Segmented } from './ui/Segmented';
import { Button } from './ui/Button';
import styles from './sections.module.css';

type Props = {
  catalog: Catalog;
  value: DrinkLine | null;
  onChange: (value: DrinkLine | null) => void;
};

export function DrinkSection({ catalog, value, onChange }: Props) {
  // Keep showing the last drink's options while the panel slides closed.
  const [shown, setShown] = useState<DrinkLine | null>(value);
  if (value && value !== shown) setShown(value);
  const line = value ?? shown;
  const selected = line ? findItem(catalog.drinks, line.itemId) : undefined;

  function setOption(id: string, v: OptionValue) {
    if (!value || !selected) return;
    onChange({ ...value, options: visibleValues(selected, { ...value.options, [id]: v }, catalog) });
  }

  const options =
    line && selected ? itemOptions(selected, catalog).filter((o) => isOptionVisible(o, line.options)) : [];
  const choices = options.filter((o) => o.kind === 'choice');
  const toggles = options.filter((o) => o.kind === 'toggle');

  return (
    <section className={`${styles.section} reveal`} aria-labelledby="drinks-title">
      <div className={styles.sectionHead}>
        <h2 id="drinks-title">
          <span className={styles.sectionIcon} aria-hidden>
            <Coffee size={17} />
          </span>
          Drinks
        </h2>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Clear
          </Button>
        )}
      </div>

      <div className={styles.grid}>
        {catalog.drinks.map((item) => {
          const active = value?.itemId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={styles.tile}
              aria-pressed={active}
              onClick={() => onChange(active ? null : newDrinkLine(item, catalog))}
            >
              <span className={styles.emoji} aria-hidden>
                {item.emoji}
              </span>
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="collapse" data-open={!!value} inert={!value}>
        <div>
          {line && selected && (
            <div className={styles.options}>
              {choices.map(
                (option) =>
                  option.kind === 'choice' && (
                    <div key={option.id} className={styles.optionRow}>
                      <span className={styles.optionLabel}>{option.label}</span>
                      <Segmented
                        name={option.id}
                        label={option.label}
                        size="sm"
                        value={line.options[option.id] as string}
                        onChange={(v) => setOption(option.id, v)}
                        options={option.choices.map((c) => ({ value: c.id, label: c.label.replace(/ sugar$/i, '') }))}
                      />
                    </div>
                  ),
              )}
              {toggles.length > 0 && (
                <div className={styles.optionRow}>
                  <span className={styles.optionLabel}>Add</span>
                  <div className={styles.chips}>
                    {toggles.map((option) => (
                      <label key={option.id} className={styles.chip}>
                        <input
                          type="checkbox"
                          checked={line.options[option.id] === true}
                          onChange={(e) => setOption(option.id, e.target.checked)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className={styles.optionRow}>
                <span className={styles.optionLabel}>Cups</span>
                <QtyStepper
                  value={line.qty}
                  min={1}
                  max={selected.maxQty}
                  label={selected.label}
                  onChange={(qty) => value && onChange({ ...value, qty })}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
