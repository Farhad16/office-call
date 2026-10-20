import styles from './sections.module.css';

type Props = {
  value: number;
  min: number;
  max: number;
  label: string; // for screen readers, e.g. "Biscuits"
  onChange: (value: number) => void;
};

export function QtyStepper({ value, min, max, label, onChange }: Props) {
  return (
    <div className={styles.stepper} role="group" aria-label={`${label} quantity`}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Less ${label}`}>
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label}`}>
        +
      </button>
    </div>
  );
}
