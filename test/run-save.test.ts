/** Saving a finished run: only for a logged-in player, rounded, and honest about failure. */

import { afterEach, beforeEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';

import type { RunSummary } from '@/engine/types';
import { useAccount } from '@/lib/store/account';
import { useRunStore } from '@/lib/store/run';

const RUN: RunSummary = {
  biomeId: 'forest',
  stageNumber: 1,
  score: 1234.6,
  enemiesKilled: 3,
  durationMs: 61_000.4,
  distanceM: 412.7,
  movementCount: 10,
  isCleared: false,
  stepCount: 40,
  movementMs: 50_000,
  goalReached: false,
};

function respondWith(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  useRunStore.getState().clearLastRun();
  useAccount.setState({ status: 'user', username: 'alice' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('a logged-in run is posted once, rounded, and marked saved', async () => {
  const fetchMock = respondWith(201, { ok: true, data: { summary: {} }, error: null });

  await useRunStore.getState().saveRun(RUN);

  assert.equal(useRunStore.getState().saveState, 'saved');
  assert.equal(fetchMock.mock.calls.length, 1);
  const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  assert.equal(path, '/api/plays');
  assert.deepEqual(JSON.parse(String(init.body)), { score: 1235, distanceM: 413, durationMs: 61_000 });
});

test('a guest run is not sent anywhere', async () => {
  useAccount.setState({ status: 'guest', username: null });
  const fetchMock = respondWith(500, {});

  await useRunStore.getState().saveRun(RUN);

  assert.equal(useRunStore.getState().saveState, 'guest');
  assert.equal(fetchMock.mock.calls.length, 0);
});

test('an expired session flips the player to guest instead of claiming an error', async () => {
  respondWith(401, { ok: false, data: null, error: 'Not logged in.' });

  await useRunStore.getState().saveRun(RUN);

  assert.equal(useRunStore.getState().saveState, 'guest');
  assert.equal(useAccount.getState().status, 'guest');
});

test('a server failure is reported, with its message', async () => {
  respondWith(500, { ok: false, data: null, error: 'Something went wrong. Try again.' });

  await useRunStore.getState().saveRun(RUN);

  assert.equal(useRunStore.getState().saveState, 'error');
  assert.equal(useRunStore.getState().saveError, 'Something went wrong. Try again.');
});

test('an unchecked player is looked up before deciding', async () => {
  useAccount.setState({ status: 'unknown', username: null });
  const fetchMock = vi.fn(async (path: string) =>
    path === '/api/me'
      ? new Response(JSON.stringify({ ok: true, data: { username: 'alice', summary: {} }, error: null }), { status: 200 })
      : new Response(JSON.stringify({ ok: true, data: { summary: {} }, error: null }), { status: 201 }),
  );
  vi.stubGlobal('fetch', fetchMock);

  await useRunStore.getState().saveRun(RUN);

  assert.deepEqual(fetchMock.mock.calls.map(([path]) => path), ['/api/me', '/api/plays']);
  assert.equal(useRunStore.getState().saveState, 'saved');
});
