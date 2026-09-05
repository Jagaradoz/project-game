/**
 * The HTTP boundary.
 *
 * The backend does not exist yet, but this is the code that will decide whether
 * to trust it. A server response is untrusted input, and the point of the zod
 * envelope is that a payload which disagrees with src/types/api.ts fails here
 * rather than rendering as undefined three components deep.
 *
 * The module reads its base URL at import time, so each case imports it fresh.
 */

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { z } from 'zod';

const BASE_URL = 'https://api.example.test';
const payloadSchema = z.object({ id: z.string() });

/**
 * Imports the client fresh with the base URL a case needs. Not a default
 * parameter: passing `undefined` to one selects the default, which is exactly
 * the case that needs an empty base URL.
 */
async function loadClient(baseUrl: string) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', baseUrl);
  return import('@/lib/api/client');
}

function respondWith(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const response = {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  };
  return vi.fn(async () => response as unknown as Response);
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_MODE', 'live');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('a valid envelope is unwrapped', async () => {
  const { apiRequest } = await loadClient(BASE_URL);
  vi.stubGlobal('fetch', respondWith({ success: true, data: { id: 'abc' }, error: null }));

  const response = await apiRequest('/thing', { schema: payloadSchema });
  assert.deepEqual(response.data, { id: 'abc' });
});

test('the request carries credentials but never reads the cookie', async () => {
  const { apiRequest } = await loadClient(BASE_URL);
  const fetchMock = respondWith({ success: true, data: { id: 'abc' }, error: null });
  vi.stubGlobal('fetch', fetchMock);

  await apiRequest('/thing', { schema: payloadSchema });

  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  assert.equal(url, `${BASE_URL}/thing`);
  assert.equal(init.credentials, 'include');
});

test('a POST sends JSON with the right content type', async () => {
  const { apiRequest } = await loadClient(BASE_URL);
  const fetchMock = respondWith({ success: true, data: { id: 'abc' }, error: null });
  vi.stubGlobal('fetch', fetchMock);

  await apiRequest('/thing', { method: 'POST', body: { a: 1 }, schema: payloadSchema });

  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  assert.equal(init.method, 'POST');
  assert.equal(init.body, JSON.stringify({ a: 1 }));
  assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
});

test('a payload that disagrees with the schema is rejected, not rendered', async () => {
  const { apiRequest, ApiError } = await loadClient(BASE_URL);
  // `id` is a number where the contract says string.
  vi.stubGlobal('fetch', respondWith({ success: true, data: { id: 7 }, error: null }));

  await assert.rejects(
    () => apiRequest('/thing', { schema: payloadSchema }),
    (error: unknown) => error instanceof ApiError && /expected shape/.test(error.message),
  );
});

test('a non-JSON response is reported as such', async () => {
  const { apiRequest, ApiError } = await loadClient(BASE_URL);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }) as unknown as Response),
  );

  await assert.rejects(
    () => apiRequest('/thing', { schema: payloadSchema }),
    (error: unknown) => error instanceof ApiError && error.status === 502,
  );
});

test("an error envelope surfaces the server's message", async () => {
  const { apiRequest, ApiError } = await loadClient(BASE_URL);
  vi.stubGlobal(
    'fetch',
    respondWith({ success: false, data: null, error: 'อีเมลนี้ถูกใช้แล้ว' }, { ok: false, status: 409 }),
  );

  await assert.rejects(
    () => apiRequest('/thing', { schema: payloadSchema.nullable() }),
    (error: unknown) =>
      error instanceof ApiError && error.status === 409 && error.message === 'อีเมลนี้ถูกใช้แล้ว',
  );
});

test('a failed request is an ApiError, not a raw network error', async () => {
  const { apiRequest, ApiError } = await loadClient(BASE_URL);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }),
  );

  await assert.rejects(
    () => apiRequest('/thing', { schema: payloadSchema }),
    (error: unknown) => error instanceof ApiError && error.status === 0,
  );
});

test('an unset base URL fails loudly rather than requesting a relative path', async () => {
  const { apiRequest, ApiError } = await loadClient('');
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  await assert.rejects(
    () => apiRequest('/thing', { schema: payloadSchema }),
    (error: unknown) => error instanceof ApiError && /mock adapter/.test(error.message),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test('getErrorMessage narrows unknown errors safely', async () => {
  const { getErrorMessage, ApiError } = await loadClient(BASE_URL);

  assert.equal(getErrorMessage(new ApiError('boom', 500)), 'boom');
  assert.equal(getErrorMessage(new Error('plain')), 'plain');
  assert.equal(getErrorMessage('a bare string'), 'Unexpected error');
  assert.equal(getErrorMessage(null), 'Unexpected error');
});
