import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Bookmark, BookmarkPlus, Pencil, Save, Trash2 } from 'lucide-react';
import type { Catalog, Preset, Selection, User } from '../../../shared/types.js';
import { isEmptySelection, sameSelection, validateSelection } from '../../../shared/selection.js';
import { cleanName, validateName, MAX_NAME_LENGTH } from '../../../shared/names.js';
import { deleteJson, errorMessage, getJson, postJson, putJson } from '../lib/api';
import { Button } from './ui/Button';
import { useConfirm } from './ui/Confirm';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(null);
  const [formName, setFormName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chipsRef] = useAutoAnimate<HTMLDivElement>();
  const confirm = useConfirm();

  const base = `/api/users/${user.id}/presets`;
  const active = presets?.find((p) => p.id === activeId) ?? null;
  const modified = active !== null && !sameSelection(active.selection, selection);
  const canSaveSelection = !isEmptySelection(selection);

  useEffect(() => {
    getJson<Preset[]>(base)
      .then(setPresets)
      .catch((err) => setLoadError(`Could not load presets: ${errorMessage(err)}`));
  }, [base]);

  /** Runs a server call with busy + error toast. Returns true on success. */
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
      toast.error(`“${preset.name}” uses items that no longer exist`, { description: 'Delete it and save a new one.' });
      return;
    }
    setActiveId(preset.id);
    onLoad(result.value);
  }

  function openForm(next: Form) {
    setFormError(null);
    setForm(next);
    setFormName(next?.mode === 'rename' ? next.preset.name : '');
  }

  async function submitForm(e: FormEvent) {
    e.preventDefault();
    const name = cleanName(formName);
    const problem = validateName(name, 'Preset name');
    if (problem) {
      setFormError(problem);
      return;
    }
    const ok = await run(async () => {
      if (form?.mode === 'create') {
        const created = await postJson<Preset>(base, { name, selection });
        setPresets((list) => sortByName([...(list ?? []), created]));
        setActiveId(created.id);
        toast.success(`Saved preset “${created.name}”`);
      } else if (form?.mode === 'rename') {
        replace(await putJson<Preset>(`${base}/${form.preset.id}`, { name, selection: form.preset.selection }));
        toast.success(`Renamed to “${name}”`);
      }
    });
    if (ok) setForm(null);
  }

  function saveChanges() {
    if (!active) return;
    run(async () => {
      replace(await putJson<Preset>(`${base}/${active.id}`, { name: active.name, selection }));
      toast.success(`Updated “${active.name}”`);
    });
  }

  async function remove() {
    if (!active) return;
    const ok = await confirm({
      title: `Delete “${active.name}”?`,
      description: 'This preset will be removed from all your devices.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    run(async () => {
      await deleteJson(`${base}/${active.id}`);
      setPresets((list) => (list ?? []).filter((p) => p.id !== active.id));
      setActiveId(null);
      toast.success(`Deleted “${active.name}”`);
    });
  }

  return (
    <section className={`${styles.bar} reveal`} aria-labelledby="presets-title">
      <div className={styles.head}>
        <h2 id="presets-title">
          <Bookmark size={16} aria-hidden /> My presets
        </h2>
        {!form && canSaveSelection && (
          <Button
            size="sm"
            variant="ghost"
            icon={<BookmarkPlus size={15} />}
            onClick={() => openForm({ mode: 'create' })}
          >
            Save current as preset
          </Button>
        )}
      </div>

      {loadError && <p className={styles.error}>{loadError}</p>}
      {presets === null && !loadError && <div className={styles.skeleton} aria-label="Loading presets" />}
      {presets?.length === 0 && !form && (
        <p className={styles.muted}>No presets yet. Pick items below, then save them for one-tap ordering.</p>
      )}

      <div ref={chipsRef} className={styles.chips}>
        {presets?.map((preset) => (
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

      {active && !form && (
        <div className={`${styles.activeRow} fade-in`}>
          <span className={styles.muted}>
            Loaded <strong>{active.name}</strong>
            {modified && <span className={styles.changed}> · changed</span>}
          </span>
          <span className={styles.actions}>
            {modified && canSaveSelection && (
              <Button size="sm" variant="primary" icon={<Save size={14} />} onClick={saveChanges} loading={busy}>
                Save changes
              </Button>
            )}
            <Button
              size="sm"
              icon={<Pencil size={14} />}
              onClick={() => openForm({ mode: 'rename', preset: active })}
              disabled={busy}
            >
              Rename
            </Button>
            <Button size="sm" variant="dangerGhost" icon={<Trash2 size={14} />} onClick={remove} disabled={busy}>
              Delete
            </Button>
          </span>
        </div>
      )}

      {form && (
        <form className={`${styles.form} fade-in`} onSubmit={submitForm} noValidate>
          <input
            className="input"
            value={formName}
            onChange={(e) => {
              setFormName(e.target.value);
              setFormError(null);
            }}
            maxLength={MAX_NAME_LENGTH + 10}
            placeholder="Preset name, e.g. Morning Coffee"
            aria-label="Preset name"
            aria-invalid={formError ? true : undefined}
            autoFocus
          />
          <Button type="submit" variant="primary" loading={busy}>
            {form.mode === 'create' ? 'Save' : 'Rename'}
          </Button>
          <Button onClick={() => openForm(null)} disabled={busy}>
            Cancel
          </Button>
          {formError && (
            <p className={styles.error} role="alert">
              {formError}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
