import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Bookmark, BookmarkPlus, Check, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import type { Catalog, Preset, Selection, User } from '../../../shared/types.js';
import {
  addSelections,
  isEmptySelection,
  subtractSelection,
  summarizeSelection,
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

type Form = { mode: 'create' } | { mode: 'rename'; preset: Preset } | null;

/**
 * Preset cards that show what's inside. Several can be picked: tapping a card adds its
 * items to the order, tapping it again takes them back out.
 */
export function PresetBar({ user, catalog, selection, onChange }: Props) {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(null);
  const [formName, setFormName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gridRef] = useAutoAnimate<HTMLDivElement>();
  const confirm = useConfirm();

  const base = `/api/users/${user.id}/presets`;
  const orderEmpty = isEmptySelection(selection);
  // An emptied order (Clear all, or after sending) means nothing is picked any more.
  const picked = orderEmpty ? new Set<number>() : pickedIds;
  const editing = presets?.find((p) => p.id === editingId) ?? null;

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

  function toggle(preset: Preset) {
    if (picked.has(preset.id)) {
      onChange(subtractSelection(selection, preset.selection, catalog));
      setPickedIds((s) => {
        const next = new Set(s);
        next.delete(preset.id);
        return next;
      });
      return;
    }
    // The catalog may have changed since the preset was saved.
    const result = validateSelection(preset.selection, catalog);
    if (!result.ok) {
      toast.error(`“${preset.name}” uses items that no longer exist`, { description: 'Delete it and save a new one.' });
      return;
    }
    onChange(addSelections(orderEmpty ? { drinks: [], snacks: [], custom: '' } : selection, result.value, catalog));
    setPickedIds((s) => new Set(orderEmpty ? [] : s).add(preset.id));
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
        toast.success(`Saved preset “${created.name}”`);
      } else if (form?.mode === 'rename') {
        replace(await putJson<Preset>(`${base}/${form.preset.id}`, { name, selection: form.preset.selection }));
        toast.success(`Renamed to “${name}”`);
      }
    });
    if (ok) {
      setForm(null);
      setEditingId(null);
    }
  }

  function updateWithOrder(preset: Preset) {
    run(async () => {
      replace(await putJson<Preset>(`${base}/${preset.id}`, { name: preset.name, selection }));
      setEditingId(null);
      toast.success(`Updated “${preset.name}” with your current order`);
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
      setPickedIds((s) => {
        const next = new Set(s);
        next.delete(preset.id);
        return next;
      });
      setEditingId(null);
      toast.success(`Deleted “${preset.name}”`);
    });
  }

  return (
    <section className={`${styles.bar} reveal`} aria-labelledby="presets-title">
      <div className={styles.head}>
        <h2 id="presets-title">
          <Bookmark size={16} aria-hidden /> My presets
        </h2>
        <span className={styles.hint}>Tap to add · tap again to remove · pick several</span>
      </div>

      {loadError && <p className={styles.error}>{loadError}</p>}
      {presets === null && !loadError && <div className={styles.skeleton} aria-label="Loading presets" />}

      <div ref={gridRef} className={styles.grid}>
        {presets?.map((preset) => {
          const on = picked.has(preset.id);
          const lines = summarizeSelection(preset.selection, catalog);
          return (
            <div key={preset.id} className={styles.card} data-on={on || undefined}>
              <button
                type="button"
                className={styles.cardMain}
                aria-pressed={on}
                onClick={() => toggle(preset)}
                disabled={busy}
                title={on ? 'Tap to remove from the order' : 'Tap to add to the order'}
              >
                <span className={styles.cardTop}>
                  <span className={styles.cardName}>{preset.name}</span>
                  <span className={styles.check} aria-hidden>
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                </span>
                <span className={styles.contents}>
                  {lines.slice(0, 3).map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                  {lines.length > 3 && <span>+{lines.length - 3} more</span>}
                </span>
              </button>
              <button
                type="button"
                className={styles.editButton}
                onClick={() => {
                  setForm(null);
                  setEditingId(editingId === preset.id ? null : preset.id);
                }}
                aria-label={`Edit preset ${preset.name}`}
                aria-expanded={editingId === preset.id}
                title="Edit"
              >
                <Pencil size={13} />
              </button>
            </div>
          );
        })}

        {!form && (
          <button
            type="button"
            className={styles.addCard}
            onClick={() => openForm({ mode: 'create' })}
            disabled={orderEmpty}
            title={orderEmpty ? 'Pick items first, then save them as a preset' : 'Save the current order as a preset'}
          >
            <BookmarkPlus size={18} aria-hidden />
            <span>{orderEmpty ? 'Pick items to save a preset' : 'Save current order'}</span>
          </button>
        )}
      </div>

      {editing && !form && (
        <div className={`${styles.manage} fade-in`}>
          <span className={styles.manageName}>{editing.name}</span>
          <Button size="sm" icon={<Pencil size={14} />} onClick={() => openForm({ mode: 'rename', preset: editing })}>
            Rename
          </Button>
          <Button
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={() => updateWithOrder(editing)}
            disabled={orderEmpty}
            loading={busy}
            title={orderEmpty ? 'Your order is empty' : 'Replace this preset with your current order'}
          >
            Update with current order
          </Button>
          <Button size="sm" variant="dangerGhost" icon={<Trash2 size={14} />} onClick={() => remove(editing)}>
            Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<X size={14} />}
            onClick={() => setEditingId(null)}
            aria-label="Close"
          />
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
