/**
 * Browser client for the account/stats API. Every call resolves to the
 * server's `{ ok, data, error }` envelope plus the HTTP status -- it never
 * throws, so callers only branch on `ok`.
 */

import type { MeData, PlaysData, AccountData } from '@/server/accounts';
import type { PlayInput, PlaySummary } from '@/lib/validation/account';

export type ApiResult<T> =
  | { ok: true; status: number; data: T; error: null }
  | { ok: false; status: number; data: null; error: string };

const UNREACHABLE = 'Could not reach the server. Check your connection and try again.';

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as ApiResult<T> | null;
    if (!json) return { ok: false, status: response.status, data: null, error: UNREACHABLE };
    return { ...json, status: response.status };
  } catch (error) {
    console.error(`[account] ${method} ${path} failed`, error);
    return { ok: false, status: 0, data: null, error: UNREACHABLE };
  }
}

export const fetchMe = () => request<MeData>('GET', '/api/me');
export const registerAccount = (username: string, password: string) =>
  request<AccountData>('POST', '/api/auth/register', { username, password });
export const loginAccount = (username: string, password: string) =>
  request<AccountData>('POST', '/api/auth/login', { username, password });
export const logoutAccount = () => request<null>('POST', '/api/auth/logout');
export const fetchPlays = () => request<PlaysData>('GET', '/api/plays');
export const postPlay = (play: PlayInput) => request<{ summary: PlaySummary }>('POST', '/api/plays', play);

/** Only same-origin paths are honoured, so `?next=` cannot bounce to another site. */
export function safeNextPath(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
