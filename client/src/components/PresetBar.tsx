import { useEffect, useState, type FormEvent } from 'react';
import type { Catalog, Preset, Selection, User } from '../../../shared/types.js';
import { isEmptySelection, sameSelection, validateSelection } from '../../../shared/selection.js';
import { cleanName, validateName, MAX_NAME_LENGTH } from '../../../shared/names.js';
import { deleteJson, errorMessage, getJson, postJson, putJson } from '../lib/api';
import styles from './PresetBar.module.css';

type Props = {
  user: User;
  catalog: Catalog;
  selection: Selection;
  onLoad: (selection: Selection) => void;
};

type Form = { mode: 'create' } | { mode: 'rename'; preset: Preset } | null;

export function PresetBar({ user, catalog, selection, onLoad }: Props) {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(null);
  const [formName, setFormName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const base = `/api/users/${user.id}/presets`;
  const active = presets?.find((p) => p.id === activeId) ?? null;
  const modified = active !== null && !sameSelection(active.selection, selection);
  const canSaveSelection = !isEmptySelection(selection);

  useEffect(() => {
    getJson<Preset[]>(base)
      .then(setPresets)
      .catch((err) => setError(`Could not load presets: ${errorMessage(err)}`));
  }, [base]);

  /** Runs a server call with busy + error handling. */
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function sortByName(list: Preset[]) {
    return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }
  function replace(updated: Preset) {
    setPresets((list) => sortByName((list ?? []).map((p) => (p.id === updated.id ? updated : p))));
  }

  function load(preset: Preset) {
    // The catalog may have changed since the preset was saved.
    const result = validateSelection(preset.selection, catalog);
    if (!result.ok) {
      setError(`"${preset.name}" uses items that no longer exist. Delete it and save a new one.`);
      return;
    }
    setError(null);
    setActiveId(preset.id);
    onLoad(result.value);
  }

  function openForm(next: Form) {
    setError(null);
    setForm(next);
    setFormName(next?.mode === 'rename' ? next.preset.name : '');
  }

  function submitForm(e: FormEvent) {
    e.preventDefault();
    const name = cleanName(formName);
    const problem = validateName(name, 'Preset name');
    if (problem) {
      setError(problem);
      return;
    }
    run(async () => {
      if (form?.mode === 'create') {
        const created = await postJson<Preset>(base, { name, selection });
        setPresets((list) => sortByName([...(list ?? []), created]));
        setActiveId(created.id);
      } else if (form?.mode === 'rename') {
        replace(await putJson<Preset>(`${base}/${form.preset.id}`, { name, selection: form.preset.selection }));
      }
      setForm(null);
    });
  }

  function saveChanges() {
    if (!active) return;
    run(async () => replace(await putJson<Preset>(`${base}/${active.id}`, { name: active.name, selection })));
  }

  function remove() {
    if (!active || !window.confirm(`Delete preset "${active.name}"?`)) return;
    run(async () => {
      await deleteJson(`${base}/${active.id}`);
      setPresets((list) => (list ?? []).filter((p) => p.id !== active.id));
      setActiveId(null);
    });
  }

  return (
    <section className={styles.bar} aria-labelledby="presets-title">
      <div className={styles.head}>
        <h2 id="presets-title">My presets</h2>
        {!form && canSaveSelection && (
          <button type="button" className={styles.link} onClick={() => openForm({ mode: 'create' })}>
            + Save current as preset
          </button>
        )}
      </div>

      {presets === null && !error && <p className={styles.muted}>Loading…</p>}
      {presets?.length === 0 && !form && (
        <p className={styles.muted}>No presets yet. Pick items below, then save them as a preset.</p>
      )}

      {presets && presets.length > 0 && (
        <div className={styles.chips}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={styles.chip}
              aria-pressed={preset.id === activeId}
              onClick={() => load(preset)}
              disabled={busy}
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}

      {active && !form && (
        <div className={styles.activeRow}>
          <span className={styles.muted}>
            Loaded <strong>{active.name}</strong>
            {modified && ' (changed)'}
          </span>
          <span className={styles.actions}>
            {modified && canSaveSelection && (
              <button type="button" onClick={saveChanges} disabled={busy}>
                Save changes
              </button>
            )}
            <button type="button" onClick={() => openForm({ mode: 'rename', preset: active })} disabled={busy}>
              Rename
            </button>
            <button type="button" className={styles.danger} onClick={remove} disabled={busy}>
              Delete
            </button>
          </span>
        </div>
      )}

      {form && (
        <form className={styles.form} onSubmit={submitForm} noValidate>
          <input
            value={formName}
            onChange={(e) => {
              setFormName(e.target.value);
              setError(null);
            }}
            maxLength={MAX_NAME_LENGTH + 10}
            placeholder="Preset name, e.g. Morning Coffee"
            aria-label="Preset name"
            autoFocus
          />
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? 'Saving…' : form.mode === 'create' ? 'Save' : 'Rename'}
          </button>
          <button type="button" onClick={() => openForm(null)} disabled={busy}>
            Cancel
          </button>
        </form>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
