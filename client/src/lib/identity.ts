// Remembers the user's name on this device.
// localStorage can throw (private mode, blocked storage), so every access is guarded.

const KEY = 'officeCall.userName';
export const MAX_NAME_LENGTH = 40;

/** Trim, collapse inner spaces, drop control characters. */
export function cleanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}

/** Returns an error message, or null if the name is fine. */
export function validateName(name: string): string | null {
  if (name.length === 0) return 'Please enter your name.';
  if (name.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  return null;
}

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
