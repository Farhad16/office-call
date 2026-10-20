/**
 * Random id for duplicate protection.
 * crypto.randomUUID() only exists on HTTPS pages, but getRandomValues works on plain HTTP too.
 */
export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
