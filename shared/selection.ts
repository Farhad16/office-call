import type { Catalog, DrinkLine, ItemDef, OptionDef, OptionValue, Selection, SnackLine } from './types.js';

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

/** A drink's name including name-modifier choices, e.g. { label: 'Milk Tea', bn: 'দুধ চা' }. */
export function drinkName(item: ItemDef, line: DrinkLine, catalog: Catalog): { label: string; bn: string } {
  let label = item.label;
  let bn = item.bn;
  for (const option of itemOptions(item, catalog)) {
    if (option.kind !== 'choice' || !option.nameModifier) continue;
    const choice = option.choices.find((c) => c.id === line.options[option.id]);
    if (!choice) continue;
    label = `${choice.label} ${label}`;
    if (choice.bn) bn = `${choice.bn} ${bn}`;
  }
  return { label, bn };
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
        if (option.nameModifier) continue; // already in the name
        const choice = option.choices.find((c) => c.id === v);
        if (choice) details.push(choice.label.toLowerCase());
      } else if (v === true) {
        details.push(`with ${option.label.toLowerCase()}`);
      }
    }
    const name = drinkName(item, line, catalog).label;
    lines.push(`${line.qty} × ${name}${details.length ? ` (${details.join(', ')})` : ''}`);
  }
  for (const line of sel.snacks) {
    const item = findItem(catalog.snacks, line.itemId);
    if (item) lines.push(`${line.qty} × ${item.label}`);
  }
  const custom = cleanText(sel.custom);
  if (custom) lines.push(`“${custom}”`);
  return lines;
}

/** True when two selections would produce the same request. */
export function sameSelection(a: Selection, b: Selection): boolean {
  const norm = (s: Selection) => JSON.stringify({ drinks: s.drinks, snacks: s.snacks, custom: cleanText(s.custom) });
  return norm(a) === norm(b);
}

export type DescribedItem = { label: string; qty: number; details: string[] };

/**
 * Item-by-item description for request cards, e.g.
 * [{ label: 'Tea', qty: 1, details: ['Less sugar', 'Ginger and lemon'] }, { label: 'Chanachur Makha', qty: 1 }]
 */
export function describeSelection(sel: Selection, catalog: Catalog): { items: DescribedItem[]; custom: string } {
  const items: DescribedItem[] = [];
  for (const line of sel.drinks) {
    const item = findItem(catalog.drinks, line.itemId);
    if (!item) continue;
    const details: string[] = [];
    const toggles: string[] = [];
    for (const option of itemOptions(item, catalog)) {
      const v = line.options[option.id];
      if (option.kind === 'choice') {
        if (option.nameModifier) continue; // already in the name
        const choice = option.choices.find((c) => c.id === v);
        if (choice) details.push(choice.label);
      } else if (v === true) {
        toggles.push(option.label.toLowerCase());
      }
    }
    if (toggles.length) {
      const text = toggles.length === 1 ? toggles[0] : `${toggles.slice(0, -1).join(', ')} and ${toggles.at(-1)}`;
      details.push(text[0].toUpperCase() + text.slice(1));
    }
    items.push({ label: drinkName(item, line, catalog).label, qty: line.qty, details });
  }
  for (const line of sel.snacks) {
    const item = findItem(catalog.snacks, line.itemId);
    if (item) items.push({ label: item.label, qty: line.qty, details: [] });
  }
  return { items, custom: cleanText(sel.custom) };
}

// ---------- Drink variants (one tile each) ----------

/**
 * A pickable drink tile. A drink with a name-modifier option becomes one tile per choice
 * ("Black Tea", "Milk Tea"), so the type is picked with the same tap as the drink.
 */
export type DrinkVariant = {
  key: string; // 'tea:milk' or 'black-coffee'
  item: ItemDef;
  label: string;
  emoji: string;
  fixed: Record<string, OptionValue>; // option values set by the tile itself
};

function modifierOption(item: ItemDef, catalog: Catalog) {
  return itemOptions(item, catalog).find((o) => o.kind === 'choice' && o.nameModifier);
}

export function drinkVariants(catalog: Catalog): DrinkVariant[] {
  const variants: DrinkVariant[] = [];
  for (const item of catalog.drinks) {
    const mod = modifierOption(item, catalog);
    if (mod?.kind === 'choice') {
      for (const choice of mod.choices) {
        variants.push({
          key: `${item.id}:${choice.id}`,
          item,
          label: `${choice.label} ${item.label}`,
          emoji: choice.emoji ?? item.emoji,
          fixed: { [mod.id]: choice.id },
        });
      }
    } else {
      variants.push({ key: item.id, item, label: item.label, emoji: item.emoji, fixed: {} });
    }
  }
  return variants;
}

/** Which tile a drink line belongs to. */
export function variantKeyOf(line: DrinkLine, catalog: Catalog): string {
  const item = findItem(catalog.drinks, line.itemId);
  const mod = item && modifierOption(item, catalog);
  if (!mod) return line.itemId;
  return `${line.itemId}:${line.options[mod.id] ?? mod.default}`;
}

export function newVariantLine(variant: DrinkVariant, catalog: Catalog): DrinkLine {
  const base = newDrinkLine(variant.item, catalog);
  return { ...base, options: visibleValues(variant.item, { ...base.options, ...variant.fixed }, catalog) };
}

// ---------- Combining presets ----------

const maxQtyOf = (list: ItemDef[], id: string) => findItem(list, id)?.maxQty ?? 1;

/** Adds `extra` to `base` (used when picking a preset): same drinks/snacks add up. */
export function addSelections(base: Selection, extra: Selection, catalog: Catalog): Selection {
  const drinks = base.drinks.map((d) => ({ ...d, options: { ...d.options } }));
  for (const line of extra.drinks) {
    const key = variantKeyOf(line, catalog);
    const same = drinks.find((d) => variantKeyOf(d, catalog) === key);
    if (same) same.qty = Math.min(same.qty + line.qty, maxQtyOf(catalog.drinks, line.itemId));
    else drinks.push({ ...line, options: { ...line.options } });
  }
  const snacks: SnackLine[] = base.snacks.map((s) => ({ ...s }));
  for (const line of extra.snacks) {
    const same = snacks.find((s) => s.itemId === line.itemId);
    if (same) same.qty = Math.min(same.qty + line.qty, maxQtyOf(catalog.snacks, line.itemId));
    else snacks.push({ ...line });
  }
  const order = catalog.snacks.map((s) => s.id);
  snacks.sort((a, b) => order.indexOf(a.itemId) - order.indexOf(b.itemId));
  const a = cleanText(base.custom);
  const b = cleanText(extra.custom);
  const custom = !b || a.includes(b) ? a : a ? `${a}, ${b}` : b;
  return { drinks, snacks, custom };
}

/** Takes `extra` back out of `base` (used when un-picking a preset). */
export function subtractSelection(base: Selection, extra: Selection, catalog: Catalog): Selection {
  const drinks = base.drinks.map((d) => ({ ...d }));
  for (const line of extra.drinks) {
    const key = variantKeyOf(line, catalog);
    const same = drinks.find((d) => variantKeyOf(d, catalog) === key);
    if (same) same.qty -= line.qty;
  }
  const snacks = base.snacks.map((s) => ({ ...s }));
  for (const line of extra.snacks) {
    const same = snacks.find((s) => s.itemId === line.itemId);
    if (same) same.qty -= line.qty;
  }
  const b = cleanText(extra.custom);
  const custom = b
    ? cleanText(base.custom.replace(b, ''))
        .replace(/^,\s*|,\s*$/g, '')
        .replace(/,\s*,/g, ',')
    : base.custom;
  return { drinks: drinks.filter((d) => d.qty > 0), snacks: snacks.filter((s) => s.qty > 0), custom };
}

/**
 * Short one-line description for compact cards, e.g.
 * "Black Tea, less sugar, ginger & lemon · 2 Biscuits · “Room 4”". Default choices are left out.
 */
export function shortSummary(sel: Selection, catalog: Catalog): string {
  const parts: string[] = [];
  for (const line of sel.drinks) {
    const item = findItem(catalog.drinks, line.itemId);
    if (!item) continue;
    let text = `${line.qty > 1 ? `${line.qty} ` : ''}${drinkName(item, line, catalog).label}`;
    const addOns: string[] = [];
    for (const option of itemOptions(item, catalog)) {
      if (option.kind === 'toggle') {
        if (line.options[option.id] === true) addOns.push(option.label.toLowerCase());
        continue;
      }
      if (option.nameModifier) continue;
      const choice = option.choices.find((c) => c.id === line.options[option.id]);
      if (choice && choice.id !== option.default) text += `, ${choice.label.toLowerCase()}`;
    }
    if (addOns.length) text += `, ${addOns.join(' & ')}`;
    parts.push(text);
  }
  for (const line of sel.snacks) {
    const item = findItem(catalog.snacks, line.itemId);
    if (item) parts.push(`${line.qty > 1 ? `${line.qty} ` : ''}${item.label}`);
  }
  const custom = cleanText(sel.custom);
  if (custom) parts.push(`“${custom}”`);
  return parts.join(' · ');
}

/** Emoji of what's inside (drinks first), for compact cards. */
export function selectionEmojis(sel: Selection, catalog: Catalog, max = 3): string[] {
  const variants = drinkVariants(catalog);
  const out: string[] = [];
  for (const line of sel.drinks) {
    const v = variants.find((x) => x.key === variantKeyOf(line, catalog));
    if (v) out.push(v.emoji);
  }
  for (const line of sel.snacks) {
    const item = findItem(catalog.snacks, line.itemId);
    if (item) out.push(item.emoji);
  }
  if (out.length === 0 && cleanText(sel.custom)) out.push('📝');
  return [...new Set(out)].slice(0, max);
}
