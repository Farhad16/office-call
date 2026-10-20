// Small fetch helpers. All URLs are relative, so they work on any host/port.
import type { ApiErrorBody } from '../../../shared/types.js';

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0, // 0 = no response (network problem)
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the office server. Check your Wi-Fi.');
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (data as ApiErrorBody | null)?.error ?? `Server error (${res.status}).`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const getJson = <T>(url: string) => request<T>('GET', url);
export const postJson = <T>(url: string, body: unknown) => request<T>('POST', url, body);
export const putJson = <T>(url: string, body: unknown) => request<T>('PUT', url, body);
export const patchJson = <T>(url: string, body: unknown) => request<T>('PATCH', url, body);
export const deleteJson = <T = void>(url: string, body?: unknown) => request<T>('DELETE', url, body);

/** Message to show for any thrown error. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
