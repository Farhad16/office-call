import type { Catalog, DrinkLine, OptionValue } from '../../../shared/types.js';
import { findItem, isOptionVisible, itemOptions, newDrinkLine, visibleValues } from '../../../shared/selection.js';
import { QtyStepper } from './QtyStepper';
import styles from './sections.module.css';

type Props = {
  catalog: Catalog;
  value: DrinkLine | null;
  onChange: (value: DrinkLine | null) => void;
};

export function DrinkSection({ catalog, value, onChange }: Props) {
  const selected = value ? findItem(catalog.drinks, value.itemId) : undefined;

  function setOption(id: string, v: OptionValue) {
    if (!value || !selected) return;
    onChange({ ...value, options: visibleValues(selected, { ...value.options, [id]: v }, catalog) });
  }

  return (
    <section className={styles.section} aria-labelledby="drinks-title">
      <div className={styles.sectionHead}>
        <h2 id="drinks-title">Drinks</h2>
        {value && (
          <button type="button" className={styles.clear} onClick={() => onChange(null)}>Clear</button>
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
              <span className={styles.emoji} aria-hidden>{item.emoji}</span>
              {item.label}
            </button>
          );
        })}
      </div>

      {value && selected && (
        <div className={styles.options}>
          {itemOptions(selected, catalog)
            .filter((option) => isOptionVisible(option, value.options))
            .map((option) =>
              option.kind === 'choice' ? (
                <fieldset key={option.id} className={styles.fieldset}>
                  <legend>{option.label}</legend>
                  <div className={styles.segmented}>
                    {option.choices.map((choice) => (
                      <label key={choice.id} className={styles.chip}>
                        <input
                          type="radio"
                          name={option.id}
                          checked={value.options[option.id] === choice.id}
                          onChange={() => setOption(option.id, choice.id)}
                        />
                        <span>{choice.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <label key={option.id} className={styles.chip}>
                  <input
                    type="checkbox"
                    checked={value.options[option.id] === true}
                    onChange={(e) => setOption(option.id, e.target.checked)}
                  />
                  <span>{option.label}</span>
                </label>
              ),
            )}
          <div className={styles.qtyRow}>
            <span>Cups</span>
            <QtyStepper
              value={value.qty}
              min={1}
              max={selected.maxQty}
              label={selected.label}
              onChange={(qty) => onChange({ ...value, qty })}
            />
          </div>
        </div>
      )}
    </section>
  );
}
