import type { Catalog, DrinkLine, ItemDef, OptionDef, OptionValue, Selection } from './types.js';

export const CUSTOM_MAX_LENGTH = 200;

export function emptySelection(): Selection {
  return { drinks: [], snacks: [], custom: '' };
}

export function isEmptySelection(sel: Selection): boolean {
  return sel.drinks.length === 0 && sel.snacks.length === 0 && sel.custom.trim() === '';
}

/** Trim, collapse whitespace, drop control characters. */
export function cleanText(raw: string): string {
  // Control characters are matched on purpose, to strip them.
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\u0000-\u001f\u007f]/g;
  return raw.replace(controlChars, ' ').replace(/\s+/g, ' ').trim();
}

export function findItem(list: ItemDef[], id: string): ItemDef | undefined {
  return list.find((item) => item.id === id);
}

/** Option definitions of an item, in display order. */
export function itemOptions(item: ItemDef, catalog: Catalog): OptionDef[] {
  return (item.options ?? []).map((id) => catalog.options[id]).filter((o): o is OptionDef => !!o);
}

/** True when an option's `showIf` conditions match the current values. */
export function isOptionVisible(option: OptionDef, values: Record<string, OptionValue>): boolean {
  if (!option.showIf) return true;
  return Object.entries(option.showIf).every(([id, expected]) => values[id] === expected);
}

/** A fresh drink line with every option at its default. */
export function newDrinkLine(item: ItemDef, catalog: Catalog): DrinkLine {
  const options: Record<string, OptionValue> = {};
  for (const option of itemOptions(item, catalog)) options[option.id] = option.default;
  return { itemId: item.id, qty: 1, options: visibleValues(item, options, catalog) };
}

/** Keeps only the values of options that are currently visible. */
export function visibleValues(
  item: ItemDef,
  values: Record<string, OptionValue>,
  catalog: Catalog,
): Record<string, OptionValue> {
  const options = itemOptions(item, catalog);
  const full: Record<string, OptionValue> = {};
  for (const option of options) full[option.id] = values[option.id] ?? option.default;
  const result: Record<string, OptionValue> = {};
  for (const option of options) {
    if (isOptionVisible(option, full)) result[option.id] = full[option.id];
  }
  return result;
}

type Result = { ok: true; value: Selection } | { ok: false; error: string };

function isInt(n: unknown, min: number, max: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
}

/**
 * Checks untrusted input (e.g. a request body) against the catalog and returns a
 * clean Selection. Unknown items, bad quantities and bad option values are rejected.
 */
export function validateSelection(input: unknown, catalog: Catalog): Result {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Selection is missing.' };
  const raw = input as Record<string, unknown>;
  const drinksIn = raw.drinks ?? [];
  const snacksIn = raw.snacks ?? [];
  const customIn = raw.custom ?? '';
  if (!Array.isArray(drinksIn) || !Array.isArray(snacksIn) || typeof customIn !== 'string') {
    return { ok: false, error: 'Selection has the wrong shape.' };
  }

  const drinks: DrinkLine[] = [];
  for (const line of drinksIn) {
    const item = findItem(catalog.drinks, line?.itemId);
    if (!item) return { ok: false, error: 'Unknown drink.' };
    if (!isInt(line.qty, 1, item.maxQty)) return { ok: false, error: `Bad quantity for ${item.label}.` };
    const valuesIn = typeof line.options === 'object' && line.options !== null ? line.options : {};
    for (const option of itemOptions(item, catalog)) {
      const v = valuesIn[option.id];
      if (v === undefined) continue;
      const valid = option.kind === 'toggle' ? typeof v === 'boolean' : option.choices.some((c) => c.id === v);
      if (!valid) return { ok: false, error: `Bad value for ${option.label}.` };
    }
    drinks.push({ itemId: item.id, qty: line.qty, options: visibleValues(item, valuesIn, catalog) });
  }

  const snacks = [];
  const seen = new Set<string>();
  for (const line of snacksIn) {
    const item = findItem(catalog.snacks, line?.itemId);
    if (!item) return { ok: false, error: 'Unknown snack.' };
    if (seen.has(item.id)) return { ok: false, error: `${item.label} is listed twice.` };
    if (!isInt(line.qty, 1, item.maxQty)) return { ok: false, error: `Bad quantity for ${item.label}.` };
    seen.add(item.id);
    snacks.push({ itemId: item.id, qty: line.qty });
  }

  const custom = cleanText(customIn);
  if (custom.length > CUSTOM_MAX_LENGTH) {
    return { ok: false, error: `Custom request must be ${CUSTOM_MAX_LENGTH} characters or fewer.` };
  }

  const value = { drinks, snacks, custom };
  if (isEmptySelection(value)) return { ok: false, error: 'Nothing selected.' };
  return { ok: true, value };
}

/** Human-readable English lines for the on-screen summary. */
export function summarizeSelection(sel: Selection, catalog: Catalog): string[] {
  const lines: string[] = [];
  for (const line of sel.drinks) {
    const item = findItem(catalog.drinks, line.itemId);
    if (!item) continue;
    const details: string[] = [];
    for (const option of itemOptions(item, catalog)) {
      const v = line.options[option.id];
      if (option.kind === 'choice') {
        const choice = option.choices.find((c) => c.id === v);
        if (choice) details.push(choice.label.toLowerCase());
      } else if (v === true) {
        details.push(`with ${option.label.toLowerCase()}`);
      }
    }
    lines.push(`${line.qty} × ${item.label}${details.length ? ` (${details.join(', ')})` : ''}`);
  }
  for (const line of sel.snacks) {
    const item = findItem(catalog.snacks, line.itemId);
    if (item) lines.push(`${line.qty} × ${item.label}`);
  }
  const custom = cleanText(sel.custom);
  if (custom) lines.push(`“${custom}”`);
  return lines;
}
