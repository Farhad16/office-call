import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Bookmark, Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import type { Catalog, Preset, Selection, User } from '../../../shared/types.js';
import {
  addSelections,
  emptySelection,
  isEmptySelection,
  selectionEmojis,
  shortSummary,
  subtractSelection,
  validateSelection,
} from '../../../shared/selection.js';
import { cleanName, validateName, MAX_NAME_LENGTH } from '../../../shared/names.js';
import { deleteJson, errorMessage, getJson, postJson, putJson } from '../lib/api';
import { Button } from './ui/Button';
import { useConfirm } from './ui/Confirm';
import styles from './PresetBar.module.css';

type Props = {
  user: User;
  catalog: Catalog;
  selection: Selection;
  onChange: (selection: Selection) => void;
};

/**
 * Presets as a full-width list, one row each. Tap a row to add its items to the order, tap
 * again to take them out; several can be combined. Rename / Update / Delete are on each row.
 */
export function PresetBar({ user, catalog, selection, onChange }: Props) {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set());
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false); // "Save order" name field open
  const [busy, setBusy] = useState(false);
  const [listRef] = useAutoAnimate<HTMLUListElement>();
  const confirm = useConfirm();

  const base = `/api/users/${user.id}/presets`;
  const orderEmpty = isEmptySelection(selection);
  // An emptied order (Clear all, or after sending) means nothing is picked any more.
  const picked = orderEmpty ? new Set<number>() : pickedIds;

  useEffect(() => {
    getJson<Preset[]>(base)
      .then(setPresets)
      .catch((err) => setLoadError(`Could not load presets: ${errorMessage(err)}`));
  }, [base]);

  async function run(action: () => Promise<void>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      await action();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const sortByName = (list: Preset[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const replace = (updated: Preset) =>
    setPresets((list) => sortByName((list ?? []).map((p) => (p.id === updated.id ? updated : p))));
  const unpick = (id: number) =>
    setPickedIds((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });

  function toggle(preset: Preset) {
    if (picked.has(preset.id)) {
      onChange(subtractSelection(selection, preset.selection, catalog));
      unpick(preset.id);
      return;
    }
    // The catalog may have changed since the preset was saved.
    const result = validateSelection(preset.selection, catalog);
    if (!result.ok) {
      toast.error(`“${preset.name}” uses items that no longer exist`, { description: 'Delete it and save a new one.' });
      return;
    }
    onChange(addSelections(orderEmpty ? emptySelection() : selection, result.value, catalog));
    setPickedIds((s) => new Set(orderEmpty ? [] : s).add(preset.id));
  }

  async function saveNew(name: string): Promise<string | null> {
    let error: string | null = null;
    await run(async () => {
      try {
        const created = await postJson<Preset>(base, { name, selection });
        setPresets((list) => sortByName([...(list ?? []), created]));
        setPickedIds((s) => new Set(s).add(created.id)); // it matches the order, so it's "picked"
        setSaving(false);
        toast.success(`Saved “${created.name}”`);
      } catch (err) {
        error = errorMessage(err);
      }
    });
    return error;
  }

  async function rename(preset: Preset, name: string): Promise<string | null> {
    if (name === preset.name) {
      setRenamingId(null);
      return null;
    }
    let error: string | null = null;
    await run(async () => {
      try {
        replace(await putJson<Preset>(`${base}/${preset.id}`, { name, selection: preset.selection }));
        setRenamingId(null);
      } catch (err) {
        error = errorMessage(err);
      }
    });
    return error;
  }

  function updateWithOrder(preset: Preset) {
    run(async () => {
      replace(await putJson<Preset>(`${base}/${preset.id}`, { name: preset.name, selection }));
      toast.success(`Updated “${preset.name}”`, { description: shortSummary(selection, catalog) });
    });
  }

  async function remove(preset: Preset) {
    const ok = await confirm({
      title: `Delete “${preset.name}”?`,
      description: 'This preset will be removed from all your devices.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    run(async () => {
      await deleteJson(`${base}/${preset.id}`);
      setPresets((list) => (list ?? []).filter((p) => p.id !== preset.id));
      unpick(preset.id);
      toast.success(`Deleted “${preset.name}”`);
    });
  }

  return (
    <section className={`${styles.section} reveal`} aria-labelledby="presets-title">
      <div className={styles.head}>
        <h2 id="presets-title">
          <span className={styles.icon} aria-hidden>
            <Bookmark size={16} />
          </span>
          My presets
        </h2>
        {!orderEmpty && !saving && (
          <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setSaving(true)}>
            Save order
          </Button>
        )}
      </div>

      {saving && (
        <NameForm
          placeholder="Name this preset, e.g. Morning Tea"
          submitLabel="Save"
          busy={busy}
          onSubmit={saveNew}
          onCancel={() => setSaving(false)}
        />
      )}

      {loadError && <p className={styles.error}>{loadError}</p>}
      {presets === null && !loadError && (
        <div className={styles.list}>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      )}
      {presets?.length === 0 && !saving && (
        <p className={styles.empty}>
          {orderEmpty
            ? 'Pick your usual order below, then save it here for one-tap ordering.'
            : 'Save this order as a preset to reorder it with one tap.'}
        </p>
      )}

      {presets && presets.length > 0 && (
        <ul ref={listRef} className={styles.list}>
          {presets.map((preset) => {
            const on = picked.has(preset.id);
            const renaming = renamingId === preset.id;
            return (
              <li key={preset.id} className={styles.row} data-on={on || undefined}>
                {renaming ? (
                  <div className={styles.renameBox}>
                    <NameForm
                      initial={preset.name}
                      submitLabel="Save"
                      busy={busy}
                      compact
                      onSubmit={(name) => rename(preset, name)}
                      onCancel={() => setRenamingId(null)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.pick}
                    aria-pressed={on}
                    onClick={() => toggle(preset)}
                    disabled={busy}
                    title={on ? 'Tap to take it out of the order' : 'Tap to add to the order'}
                  >
                    <span className={styles.emojis} aria-hidden>
                      {on ? (
                        <span className={styles.check}>
                          <Check size={16} strokeWidth={3} />
                        </span>
                      ) : (
                        selectionEmojis(preset.selection, catalog).map((e) => <span key={e}>{e}</span>)
                      )}
                    </span>
                    <span className={styles.name}>{preset.name}</span>
                    <span className={styles.summary}>{shortSummary(preset.selection, catalog)}</span>
                  </button>
                )}

                {!renaming && (
                  <span className={styles.actions}>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RefreshCw size={15} />}
                      onClick={() => updateWithOrder(preset)}
                      disabled={orderEmpty || busy}
                      aria-label={`Update ${preset.name} with the current order`}
                      title={orderEmpty ? 'Pick items first' : 'Replace this preset with your current order'}
                    >
                      <span className={styles.actionText}>Update</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Pencil size={15} />}
                      onClick={() => setRenamingId(preset.id)}
                      disabled={busy}
                      aria-label={`Rename ${preset.name}`}
                      title="Rename"
                    >
                      <span className={styles.actionText}>Rename</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="dangerGhost"
                      icon={<Trash2 size={15} />}
                      onClick={() => remove(preset)}
                      disabled={busy}
                      aria-label={`Delete ${preset.name}`}
                      title="Delete"
                    >
                      <span className={styles.actionText}>Delete</span>
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Small inline name field: Enter saves, Esc cancels, errors shown underneath. */
function NameForm({
  initial = '',
  placeholder,
  submitLabel,
  busy,
  compact = false,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  placeholder?: string;
  submitLabel: string;
  busy: boolean;
  compact?: boolean;
  onSubmit: (name: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = cleanName(value);
    const problem = validateName(name, 'Preset name');
    if (problem) {
      setError(problem);
      return;
    }
    const serverError = await onSubmit(name);
    if (serverError) setError(serverError);
  }

  return (
    <form className={compact ? styles.nameFormCompact : styles.nameForm} onSubmit={submit} noValidate>
      <input
        ref={input}
        className="input"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        maxLength={MAX_NAME_LENGTH + 10}
        placeholder={placeholder}
        aria-label="Preset name"
        aria-invalid={error ? true : undefined}
        autoFocus
      />
      <Button type="submit" variant="primary" size="sm" loading={busy}>
        {submitLabel}
      </Button>
      <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={onCancel} aria-label="Cancel" />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
