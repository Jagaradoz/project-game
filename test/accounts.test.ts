/** Account + play-history service against in-memory Postgres (PGlite), the same SQL as Neon. */

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';

import { createAccountService, type AccountService } from '@/server/accounts';
import { openStore, type Database } from '@/server/db';
import { createRateLimiter } from '@/server/rateLimit';

const ALICE = { username: 'alice', password: 'password123' };
const CLIENT = '127.0.0.1';

let pglite: PGlite;
const database: Database = {
  query: async (text, params) => (await pglite.query<Record<string, unknown>>(text, params)).rows,
};

beforeAll(async () => { pglite = await PGlite.create(); });
afterAll(async () => { await pglite.close(); });
beforeEach(async () => { await pglite.exec('DROP TABLE IF EXISTS plays, sessions, users'); });

function setup(options: { maxAttempts?: number; nowMs?: () => number } = {}): AccountService {
  return createAccountService({
    store: openStore(database),
    now: options.nowMs,
    limiter: createRateLimiter(options.maxAttempts ?? 100, 60_000),
  });
}

function tokenOf(result: Awaited<ReturnType<AccountService['register']>>): string {
  assert.ok(result.ok && result.session, 'expected a new session');
  return result.session.token;
}

test('register starts a session and the account starts with no runs', async () => {
  const service = setup();

  const registered = await service.register(ALICE, CLIENT);
  const me = await service.me(tokenOf(registered));

  assert.equal(registered.status, 201);
  assert.ok(me.ok);
  assert.equal(me.data.username, 'alice');
  assert.deepEqual(me.data.summary, { runs: 0, bestScore: 0, bestDistanceM: 0, totalDurationMs: 0 });
});

test('every saved run shows up in the summary and the recent list, newest first', async () => {
  let clock = 1_000;
  const service = setup({ nowMs: () => clock });
  const token = tokenOf(await service.register(ALICE, CLIENT));

  clock = 2_000;
  assert.equal((await service.addPlay(token, { score: 50, distanceM: 300, durationMs: 20_000 })).status, 201);
  clock = 3_000;
  assert.equal((await service.addPlay(token, { score: 20, distanceM: 500, durationMs: 10_000 })).status, 201);

  const plays = await service.plays(token);
  assert.ok(plays.ok);
  assert.deepEqual(plays.data.summary, { runs: 2, bestScore: 50, bestDistanceM: 500, totalDurationMs: 30_000 });
  assert.deepEqual(plays.data.recent, [
    { score: 20, distanceM: 500, durationMs: 10_000, playedAt: 3_000 },
    { score: 50, distanceM: 300, durationMs: 20_000, playedAt: 2_000 },
  ]);
});

test('login is case-insensitive on the username and returns the stored spelling', async () => {
  const service = setup();
  await service.register({ username: 'Alice', password: ALICE.password }, CLIENT);

  const loggedIn = await service.login({ username: 'ALICE', password: ALICE.password }, CLIENT);

  assert.ok(loggedIn.ok);
  assert.equal(loggedIn.data.username, 'Alice');
  assert.ok(loggedIn.session?.token);
});

test('a duplicate username is rejected regardless of case', async () => {
  const service = setup();
  await service.register(ALICE, CLIENT);

  assert.equal((await service.register({ ...ALICE, username: 'ALICE' }, CLIENT)).status, 409);
});

test('wrong password and unknown user get the same generic 401', async () => {
  const service = setup();
  await service.register(ALICE, CLIENT);

  const wrongPassword = await service.login({ username: 'alice', password: 'not-it-at-all' }, CLIENT);
  const unknownUser = await service.login({ username: 'bob', password: ALICE.password }, CLIENT);

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.ok(!wrongPassword.ok && !unknownUser.ok);
  assert.equal(wrongPassword.error, unknownUser.error);
});

test('logout ends the session', async () => {
  const service = setup();
  const token = tokenOf(await service.register(ALICE, CLIENT));

  await service.logout(token);

  assert.equal((await service.me(token)).status, 401);
});

test('an expired session no longer counts', async () => {
  let clock = 0;
  const service = setup({ nowMs: () => clock });
  const token = tokenOf(await service.register(ALICE, CLIENT));

  clock = 8 * 24 * 60 * 60 * 1000;

  assert.equal((await service.me(token)).status, 401);
});

test('stats and saving need a session', async () => {
  const service = setup();

  assert.equal((await service.me(null)).status, 401);
  assert.equal((await service.plays('made-up-token')).status, 401);
  assert.equal((await service.addPlay(undefined, { score: 1, distanceM: 1, durationMs: 1 })).status, 401);
});

test('a malformed run is rejected and not stored', async () => {
  const service = setup();
  const token = tokenOf(await service.register(ALICE, CLIENT));

  assert.equal((await service.addPlay(token, { score: -1, distanceM: 1, durationMs: 1 })).status, 400);
  assert.equal((await service.addPlay(token, { score: 1.5, distanceM: 1, durationMs: 1 })).status, 400);
  assert.equal((await service.addPlay(token, { score: 1 })).status, 400);
  assert.equal((await service.addPlay(token, 'junk')).status, 400);

  const plays = await service.plays(token);
  assert.ok(plays.ok);
  assert.equal(plays.data.summary.runs, 0);
});

test('bad register input says which rule failed', async () => {
  const service = setup();

  const short = await service.register({ username: 'ab', password: ALICE.password }, CLIENT);
  const weak = await service.register({ username: 'alice', password: 'short' }, CLIENT);

  assert.ok(!short.ok && !weak.ok);
  assert.equal(short.status, 400);
  assert.match(short.error, /Username/);
  assert.match(weak.error, /Password/);
});

test('too many login attempts from one client are throttled', async () => {
  const service = setup({ maxAttempts: 2 });

  await service.login({ username: 'x', password: 'y' }, CLIENT);
  await service.login({ username: 'x', password: 'y' }, CLIENT);

  assert.equal((await service.login({ username: 'x', password: 'y' }, CLIENT)).status, 429);
  assert.equal((await service.login({ username: 'x', password: 'y' }, 'another-client')).status, 401);
});
