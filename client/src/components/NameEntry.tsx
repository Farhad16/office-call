import { useState, type FormEvent } from 'react';
import { cleanName, validateName, MAX_NAME_LENGTH } from '../lib/identity';
import styles from './NameEntry.module.css';

type Props = {
  initialName?: string;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
};

export function NameEntry({ initialName = '', onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = cleanName(value);
    const problem = validateName(name);
    if (problem) {
      setError(problem);
      return;
    }
    onSubmit(name);
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit} noValidate>
      <h1 className={styles.title}>☕ Office Call</h1>
      <label htmlFor="name" className={styles.label}>
        {initialName ? 'Change your name' : 'What is your name?'}
      </label>
      <input
        id="name"
        className={styles.input}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        maxLength={MAX_NAME_LENGTH + 10}
        autoComplete="name"
        autoFocus
        placeholder="e.g. Farhad"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'name-error' : 'name-hint'}
      />
      {error ? (
        <p id="name-error" className={styles.error} role="alert">{error}</p>
      ) : (
        <p id="name-hint" className={styles.hint}>
          This name is spoken on the office speaker. No password needed.
        </p>
      )}
      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={styles.secondary} onClick={onCancel}>Cancel</button>
        )}
        <button type="submit" className={styles.primary}>Continue</button>
      </div>
    </form>
  );
}
