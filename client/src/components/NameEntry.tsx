import { useState, type FormEvent } from 'react';
import { ArrowRight, Coffee, LogOut } from 'lucide-react';
import { cleanName, validateName, MAX_NAME_LENGTH } from '../../../shared/names.js';
import { Button } from './ui/Button';
import { Switch } from './ui/Switch';
import styles from './NameEntry.module.css';

type Props = {
  initialName?: string;
  initialStaff?: boolean;
  /** Resolves to an error message to show, or null on success. */
  onSubmit: (name: string, isStaff: boolean) => Promise<string | null>;
  onCancel?: () => void;
  onSwitchUser?: () => void;
};

export function NameEntry({ initialName = '', initialStaff = false, onSubmit, onCancel, onSwitchUser }: Props) {
  const [value, setValue] = useState(initialName);
  const [staff, setStaff] = useState(initialStaff);
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
    const serverError = await onSubmit(name, staff);
    setBusy(false);
    if (serverError) setError(serverError);
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit} noValidate>
      <span className={styles.logo} aria-hidden>
        <Coffee size={26} strokeWidth={2.2} />
      </span>
      <h1 className={styles.title}>{renaming ? 'Your profile' : 'Welcome to Office Call'}</h1>
      <p className={styles.subtitle}>
        {renaming
          ? 'Your presets move with you if you change your name.'
          : 'Tea, coffee, snacks or help — one tap away.'}
      </p>

      <label htmlFor="name" className={styles.label}>
        {renaming ? 'Your name' : 'What is your name?'}
      </label>
      <input
        id="name"
        className="input"
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
          Spoken on the office speaker. No password needed.
        </p>
      )}

      <div className={styles.switch}>
        <Switch
          checked={staff}
          onChange={setStaff}
          label="I am a receiver"
          hint="Receivers handle requests: change status and delete done orders."
        />
      </div>

      <div className={styles.actions}>
        {onCancel && (
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" loading={busy} icon={!renaming && <ArrowRight size={16} />}>
          {renaming ? 'Save' : 'Continue'}
        </Button>
      </div>
      {onSwitchUser && (
        <Button
          variant="ghost"
          size="sm"
          className={styles.switchUser}
          icon={<LogOut size={14} />}
          onClick={onSwitchUser}
          disabled={busy}
        >
          Not you? Switch user
        </Button>
      )}
    </form>
  );
}
