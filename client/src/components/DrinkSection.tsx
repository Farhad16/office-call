import { Coffee, X } from 'lucide-react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import type { Catalog, DrinkLine, OptionValue } from '../../../shared/types.js';
import {
  drinkVariants,
  findItem,
  isOptionVisible,
  itemOptions,
  newVariantLine,
  variantKeyOf,
  visibleValues,
} from '../../../shared/selection.js';
import { QtyStepper } from './QtyStepper';
import { Segmented } from './ui/Segmented';
import styles from './sections.module.css';

type Props = {
  catalog: Catalog;
  value: DrinkLine[];
  onChange: (value: DrinkLine[]) => void;
};

/**
 * One tile per drink variant (Black Tea, Milk Tea, ...): one tap adds it, another removes it.
 * Each picked drink gets a compact row for its own options and cups.
 */
export function DrinkSection({ catalog, value, onChange }: Props) {
  const variants = drinkVariants(catalog);
  const [linesRef] = useAutoAnimate<HTMLDivElement>();
  const keyOf = (line: DrinkLine) => variantKeyOf(line, catalog);
  const picked = new Set(value.map(keyOf));

  // Keep lines in tile order, so the list doesn't jump around.
  const order = variants.map((v) => v.key);
  const sorted = (lines: DrinkLine[]) => [...lines].sort((a, b) => order.indexOf(keyOf(a)) - order.indexOf(keyOf(b)));

  function toggle(key: string) {
    if (picked.has(key)) onChange(value.filter((l) => keyOf(l) !== key));
    else
      onChange(
        sorted([
          ...value,
          newVariantLine(
            variants.find((v) => v.key === key)!,
            catalog,
          ),
        ]),
      );
  }

  function update(key: string, next: DrinkLine) {
    onChange(value.map((l) => (keyOf(l) === key ? next : l)));
  }

  return (
    <section className={`${styles.section} reveal`} aria-labelledby="drinks-title">
      <div className={styles.sectionHead}>
        <h2 id="drinks-title">
          <span className={styles.sectionIcon} aria-hidden>
            <Coffee size={17} />
          </span>
          Drinks
        </h2>
        {value.length > 0 && <span className={styles.headHint}>Tap again to remove</span>}
      </div>

      <div className={styles.grid}>
        {variants.map((v) => (
          <button
            key={v.key}
            type="button"
            className={styles.tile}
            aria-pressed={picked.has(v.key)}
            onClick={() => toggle(v.key)}
          >
            <span className={styles.emoji} aria-hidden>
              {v.emoji}
            </span>
            {v.label}
          </button>
        ))}
      </div>

      <div ref={linesRef} className={styles.drinkLines}>
        {sorted(value).map((line) => (
          <DrinkLineEditor
            key={keyOf(line)}
            catalog={catalog}
            line={line}
            label={variants.find((v) => v.key === keyOf(line))?.label ?? line.itemId}
            onChange={(next) => update(keyOf(line), next)}
            onRemove={() => toggle(keyOf(line))}
          />
        ))}
      </div>
    </section>
  );
}

function DrinkLineEditor({
  catalog,
  line,
  label,
  onChange,
  onRemove,
}: {
  catalog: Catalog;
  line: DrinkLine;
  label: string;
  onChange: (line: DrinkLine) => void;
  onRemove: () => void;
}) {
  const item = findItem(catalog.drinks, line.itemId);
  if (!item) return null;
  // The tile already decided the name-modifier option (black/milk), so it isn't shown here.
  const options = itemOptions(item, catalog).filter(
    (o) => !(o.kind === 'choice' && o.nameModifier) && isOptionVisible(o, line.options),
  );
  const choices = options.filter((o) => o.kind === 'choice');
  const toggles = options.filter((o) => o.kind === 'toggle');
  const variantKey = variantKeyOf(line, catalog);
  const set = (id: string, v: OptionValue) =>
    onChange({ ...line, options: visibleValues(item, { ...line.options, [id]: v }, catalog) });

  return (
    <div className={styles.drinkLine}>
      <div className={styles.drinkLineHead}>
        <strong>{label}</strong>
        <QtyStepper
          value={line.qty}
          min={1}
          max={item.maxQty}
          label={label}
          onChange={(qty) => onChange({ ...line, qty })}
        />
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          title="Remove"
        >
          <X size={16} />
        </button>
      </div>
      {(choices.length > 0 || toggles.length > 0) && (
        <div className={styles.drinkLineOptions}>
          {choices.map(
            (option) =>
              option.kind === 'choice' && (
                <span key={option.id} className={styles.optGroup}>
                  <span className={styles.optLabel}>{option.label}</span>
                  <Segmented
                    name={`${variantKey}-${option.id}`}
                    label={`${label} ${option.label}`}
                    size="sm"
                    value={line.options[option.id] as string}
                    onChange={(v) => set(option.id, v)}
                    // "Less sugar" reads as "Less" next to the "Sugar" label.
                    options={option.choices.map((c) => ({ value: c.id, label: c.label.replace(/ sugar$/i, '') }))}
                  />
                </span>
              ),
          )}
          {toggles.length > 0 && (
            <span className={styles.optGroup}>
              <span className={styles.optLabel}>Add</span>
              {toggles.map((option) => (
                <label key={option.id} className={styles.chip}>
                  <input
                    type="checkbox"
                    checked={line.options[option.id] === true}
                    onChange={(e) => set(option.id, e.target.checked)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
