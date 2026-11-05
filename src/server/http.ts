/**
 * HTTP glue for the app/api route handlers: one shared service, JSON body
 * parsing, the session cookie and the `{ ok, data, error }` envelope.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createAccountService, type AccountService, type ServiceResult } from '@/server/accounts';
import { SERVER_CONFIG } from '@/server/config';
import { openStore } from '@/server/db';

/** Request bodies are tiny JSON objects; anything bigger is rejected. */
const MAX_BODY_BYTES = 4 * 1024;
const COOKIE = SERVER_CONFIG.session.cookieName;

/** Survives dev hot reloads, so the SQLite handle and rate limits are not recreated per edit. */
const globalForAccounts = globalThis as unknown as { accountService?: AccountService };

export function accountService(): AccountService {
  globalForAccounts.accountService ??= createAccountService({ store: openStore(SERVER_CONFIG.dbPath) });
  return globalForAccounts.accountService;
}

export function sessionToken(request: NextRequest): string | null {
  return request.cookies.get(COOKIE)?.value ?? null;
}

/** Behind a tunnel every request shares the tunnel's socket, so the forwarded address is the client. */
export function clientKey(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

export type BodyResult = { ok: true; body: unknown } | { ok: false; response: NextResponse };

export async function readJson(request: NextRequest): Promise<BodyResult> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return { ok: false, response: envelope(415, null, 'Expected JSON.') };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, response: envelope(413, null, 'Request too large.') };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: envelope(400, null, 'Invalid JSON.') };
  }
}

/** Turns a service result into a response, setting or clearing the session cookie it asks for. */
export function respond<T>(request: NextRequest, result: ServiceResult<T>): NextResponse {
  if (!result.ok) return envelope(result.status, null, result.error);

  const response = envelope(result.status, result.data, null);
  if (result.session === undefined) return response;

  const isHttps =
    request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  response.cookies.set(COOKIE, result.session?.token ?? '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: result.session ? Math.floor(result.session.maxAgeMs / 1000) : 0,
  });
  return response;
}

/** Last-resort guard so a storage failure becomes a clean 500 instead of a stack trace. */
export async function handle(route: string, run: () => Promise<NextResponse> | NextResponse) {
  try {
    return await run();
  } catch (error) {
    console.error(`[api] ${route} failed`, error);
    return envelope(500, null, 'Something went wrong. Try again.');
  }
}

function envelope(status: number, data: unknown, error: string | null): NextResponse {
  return NextResponse.json(
    { ok: error === null, data, error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
