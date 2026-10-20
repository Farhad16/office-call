// Remembers the user's name on this device.
// localStorage can throw (private mode, blocked storage), so every access is guarded.

import { cleanName, validateName } from '../../../shared/names.js';

const KEY = 'officeCall.userName';

export function loadName(): string | null {
  try {
    const saved = localStorage.getItem(KEY);
    if (!saved) return null;
    const name = cleanName(saved);
    return validateName(name) ? null : name;
  } catch {
    return null;
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // Storage unavailable: the name still works until the page is closed.
  }
}

export function clearName(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
