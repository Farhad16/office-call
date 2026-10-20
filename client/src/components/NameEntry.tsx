import { useState, type FormEvent } from 'react';
import { cleanName, validateName, MAX_NAME_LENGTH } from '../../../shared/names.js';
import styles from './NameEntry.module.css';

type Props = {
  initialName?: string;
  /** Resolves to an error message to show, or null on success. */
  onSubmit: (name: string) => Promise<string | null>;
  onCancel?: () => void;
  onSwitchUser?: () => void;
};

export function NameEntry({ initialName = '', onSubmit, onCancel, onSwitchUser }: Props) {
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const renaming = initialName !== '';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const name = cleanName(value);
    const problem = validateName(name);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const serverError = await onSubmit(name);
    setBusy(false);
    if (serverError) setError(serverError);
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit} noValidate>
      <h1 className={styles.title}>☕ Office Call</h1>
      <label htmlFor="name" className={styles.label}>
        {renaming ? 'Change your name' : 'What is your name?'}
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
        <p id="name-error" className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <p id="name-hint" className={styles.hint}>
          {renaming
            ? 'Your presets move to the new name.'
            : 'This name is spoken on the office speaker. No password needed.'}
        </p>
      )}
      <div className={styles.actions}>
        {onCancel && (
          <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? 'Please wait…' : renaming ? 'Save' : 'Continue'}
        </button>
      </div>
      {onSwitchUser && (
        <button type="button" className={styles.link} onClick={onSwitchUser} disabled={busy}>
          Not you? Switch user
        </button>
      )}
    </form>
  );
}
