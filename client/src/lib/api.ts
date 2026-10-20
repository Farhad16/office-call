// Small fetch helpers. All URLs are relative, so they work on any host/port.

export class ApiError extends Error {}

export async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError('Cannot reach the office server. Check your Wi-Fi.');
  }
  if (!res.ok) throw new ApiError(`Server error (${res.status}).`);
  return (await res.json()) as T;
}
