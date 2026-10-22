import type { Catalog, DrinkLine, ItemDef, OfficeRequest, SnackLine } from './types.js';
import { cleanText, drinkName, findItem, itemOptions } from './selection.js';

export type AnnounceLanguage = 'bn' | 'en';

// Spoken counters: "একটা চা", "দুটো বিস্কুট".
const BN_COUNT = ['', 'একটা', 'দুটো', 'তিনটা', 'চারটা', 'পাঁচটা', 'ছয়টা', 'সাতটা', 'আটটা', 'নয়টা', 'দশটা'];
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

function bnCount(n: number): string {
  return BN_COUNT[n] ?? `${String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)])}টা`;
}

/** ["a"] → "a"; ["a","b","c"] → "a, b <last> c" */
function joinList(parts: string[], last: string): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')}${last}${parts[parts.length - 1]}`;
}

/** Adds a full stop unless the text already ends with one. */
function sentence(text: string, stop: string): string {
  return /[।.!?]$/.test(text) ? text : `${text}${stop}`;
}

type Words = {
  count: (n: number, item: ItemDef) => string;
  choice: (bn: string, label: string) => string; // '' = say nothing
  toggles: (names: string[]) => string;
  and: string;
  andNext: string; // between two drinks that have their own details
  stop: string;
  wants: (name: string, items: string) => string;
  also: (items: string) => string;
  says: (name: string, text: string) => string;
  alsoSays: (text: string) => string;
  calling: (name: string) => string;
};

const BN: Words = {
  count: (n, item) => `${bnCount(n)} ${item.bn}`,
  choice: (bn) => bn,
  toggles: (names) => `${joinList(names, ' ও ')} দিয়ে`,
  and: ' আর ',
  andNext: ', আর ',
  stop: '।',
  wants: (name, items) => `${name} ${items} চেয়েছে`,
  also: (items) => `সাথে ${items}`,
  says: (name, text) => `${name} বলেছে: ${text}`,
  alsoSays: (text) => `আরও বলেছে: ${text}`,
  calling: (name) => `${name} ডাকছে।`,
};

const EN: Words = {
  count: (n, item) => `${n} ${item.label}`,
  choice: (_bn, label) => (label.toLowerCase().startsWith('normal') ? '' : label.toLowerCase()),
  toggles: (names) => `with ${joinList(names, ' and ')}`,
  and: ' and ',
  andNext: ', and ',
  stop: '.',
  wants: (name, items) => `${name} wants ${items}`,
  also: (items) => `Also ${items}`,
  says: (name, text) => `${name} says: ${text}`,
  alsoSays: (text) => `Also says: ${text}`,
  calling: (name) => `${name} is calling.`,
};

type DrinkPhrase = { head: string; details: string[] };

/** head "একটা চা", details ["চিনি কম", "আদা ও লেবু দিয়ে"]; built from the catalog's option definitions. */
function drinkPhrase(line: DrinkLine, catalog: Catalog, w: Words, lang: AnnounceLanguage): DrinkPhrase | null {
  const item = findItem(catalog.drinks, line.itemId);
  if (!item) return null;
  const details: string[] = [];
  const toggles: string[] = [];
  for (const option of itemOptions(item, catalog)) {
    const value = line.options[option.id];
    if (option.kind === 'choice') {
      if (option.nameModifier) continue; // part of the name ("দুধ চা")
      const choice = option.choices.find((c) => c.id === value);
      const text = choice ? w.choice(choice.bn, choice.label) : '';
      if (text) details.push(text);
    } else if (value === true) {
      toggles.push(lang === 'bn' ? option.bn : option.label.toLowerCase());
    }
  }
  if (toggles.length) details.push(w.toggles(toggles));
  return { head: w.count(line.qty, { ...item, ...drinkName(item, line, catalog) }), details };
}

function withDetails(text: string, details: string[]): string {
  return [text, ...details].join(', ');
}

function snackPhrase(line: SnackLine, catalog: Catalog, w: Words): string | null {
  const item = findItem(catalog.snacks, line.itemId);
  return item ? w.count(line.qty, item) : null;
}

/**
 * Builds the spoken sentence for a request, e.g.
 * "Farhad একটা চা চেয়েছে, চিনি কম, আদা ও লেবু দিয়ে। সাথে একটা চানাচুর মাখা আর দুটো বিস্কুট।"
 */
export function buildAnnouncement(
  request: Pick<OfficeRequest, 'userName' | 'type' | 'selection'>,
  catalog: Catalog,
  lang: AnnounceLanguage,
): string {
  const w = lang === 'bn' ? BN : EN;
  const name = request.userName;
  if (request.type === 'call' || !request.selection) return w.calling(name);

  const { selection } = request;
  const drinks = selection.drinks.map((d) => drinkPhrase(d, catalog, w, lang)).filter((p): p is DrinkPhrase => !!p);
  const snacks = selection.snacks.map((s) => snackPhrase(s, catalog, w)).filter((p): p is string => !!p);
  const custom = cleanText(selection.custom);

  const parts: string[] = [];
  if (drinks.length) {
    // "Farhad একটা চা চেয়েছে, চিনি কম, আর একটা ব্ল্যাক কফি, চিনি ছাড়া।"
    const [first, ...rest] = drinks;
    const text = [
      withDetails(w.wants(name, first.head), first.details),
      ...rest.map((d) => withDetails(d.head, d.details)),
    ].join(w.andNext);
    parts.push(sentence(text, w.stop));
    if (snacks.length) parts.push(sentence(w.also(joinList(snacks, w.and)), w.stop));
  } else if (snacks.length) {
    parts.push(sentence(w.wants(name, joinList(snacks, w.and)), w.stop));
  }
  if (custom) parts.push(sentence(parts.length ? w.alsoSays(custom) : w.says(name, custom), w.stop));
  return parts.length ? parts.join(' ') : w.calling(name);
}
