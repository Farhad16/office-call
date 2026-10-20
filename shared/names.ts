import { cleanText } from './selection.js';

export const MAX_NAME_LENGTH = 40;

/** Trim, collapse inner spaces, drop control characters. */
export const cleanName = cleanText;

/** Lookup key: "  Farhad " and "farhad" are the same person. */
export function nameKey(name: string): string {
  return cleanName(name).toLocaleLowerCase();
}

/** Returns an error message, or null if the name is fine. Pass an already-cleaned name. */
export function validateName(name: string, what = 'Name'): string | null {
  if (name.length === 0) return `${what} cannot be empty.`;
  if (name.length > MAX_NAME_LENGTH) return `${what} must be ${MAX_NAME_LENGTH} characters or fewer.`;
  return null;
}
