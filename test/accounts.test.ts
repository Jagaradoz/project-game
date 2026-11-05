/** Account + play-history service against an in-memory SQLite store. */

import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';

import { createAccountService, type AccountService } from '@/server/accounts';
import { openStore, type Store } from '@/server/db';
import { createRateLimiter } from '@/server/rateLimit';

const ALICE = { username: 'alice', password: 'password123' };
const CLIENT = '127.0.0.1';

const stores: Store[] = [];
afterEach(() => {
  stores.splice(0).forEach((store) => store.close());
});

function setup(options: { maxAttempts?: number; nowMs?: () => number } = {}): AccountService {
  const store = openStore(':memory:');
  stores.push(store);
  return createAccountService({
    store,
    now: options.nowMs,
    limiter: createRateLimiter(options.maxAttempts ?? 100, 60_000),
  });
}

function tokenOf(result: ReturnType<AccountService['register']>): string {
  assert.ok(result.ok && result.session, 'expected a new session');
  return result.session.token;
}

test('register starts a session and the account starts with no runs', () => {
  const service = setup();

  const registered = service.register(ALICE, CLIENT);
  const me = service.me(tokenOf(registered));

  assert.equal(registered.status, 201);
  assert.ok(me.ok);
  assert.equal(me.data.username, 'alice');
  assert.deepEqual(me.data.summary, { runs: 0, bestScore: 0, bestDistanceM: 0, totalDurationMs: 0 });
});

test('every saved run shows up in the summary and the recent list, newest first', () => {
  let clock = 1_000;
  const service = setup({ nowMs: () => clock });
  const token = tokenOf(service.register(ALICE, CLIENT));

  clock = 2_000;
  assert.equal(service.addPlay(token, { score: 50, distanceM: 300, durationMs: 20_000 }).status, 201);
  clock = 3_000;
  assert.equal(service.addPlay(token, { score: 20, distanceM: 500, durationMs: 10_000 }).status, 201);

  const plays = service.plays(token);
  assert.ok(plays.ok);
  assert.deepEqual(plays.data.summary, { runs: 2, bestScore: 50, bestDistanceM: 500, totalDurationMs: 30_000 });
  assert.deepEqual(plays.data.recent, [
    { score: 20, distanceM: 500, durationMs: 10_000, playedAt: 3_000 },
    { score: 50, distanceM: 300, durationMs: 20_000, playedAt: 2_000 },
  ]);
});

test('login is case-insensitive on the username and returns the stored spelling', () => {
  const service = setup();
  service.register({ username: 'Alice', password: ALICE.password }, CLIENT);

  const loggedIn = service.login({ username: 'ALICE', password: ALICE.password }, CLIENT);

  assert.ok(loggedIn.ok);
  assert.equal(loggedIn.data.username, 'Alice');
  assert.ok(loggedIn.session?.token);
});

test('a duplicate username is rejected regardless of case', () => {
  const service = setup();
  service.register(ALICE, CLIENT);

  assert.equal(service.register({ ...ALICE, username: 'ALICE' }, CLIENT).status, 409);
});

test('wrong password and unknown user get the same generic 401', () => {
  const service = setup();
  service.register(ALICE, CLIENT);

  const wrongPassword = service.login({ username: 'alice', password: 'not-it-at-all' }, CLIENT);
  const unknownUser = service.login({ username: 'bob', password: ALICE.password }, CLIENT);

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.ok(!wrongPassword.ok && !unknownUser.ok);
  assert.equal(wrongPassword.error, unknownUser.error);
});

test('logout ends the session', () => {
  const service = setup();
  const token = tokenOf(service.register(ALICE, CLIENT));

  service.logout(token);

  assert.equal(service.me(token).status, 401);
});

test('an expired session no longer counts', () => {
  let clock = 0;
  const service = setup({ nowMs: () => clock });
  const token = tokenOf(service.register(ALICE, CLIENT));

  clock = 8 * 24 * 60 * 60 * 1000;

  assert.equal(service.me(token).status, 401);
});

test('stats and saving need a session', () => {
  const service = setup();

  assert.equal(service.me(null).status, 401);
  assert.equal(service.plays('made-up-token').status, 401);
  assert.equal(service.addPlay(undefined, { score: 1, distanceM: 1, durationMs: 1 }).status, 401);
});

test('a malformed run is rejected and not stored', () => {
  const service = setup();
  const token = tokenOf(service.register(ALICE, CLIENT));

  assert.equal(service.addPlay(token, { score: -1, distanceM: 1, durationMs: 1 }).status, 400);
  assert.equal(service.addPlay(token, { score: 1.5, distanceM: 1, durationMs: 1 }).status, 400);
  assert.equal(service.addPlay(token, { score: 1 }).status, 400);
  assert.equal(service.addPlay(token, 'junk').status, 400);

  const plays = service.plays(token);
  assert.ok(plays.ok);
  assert.equal(plays.data.summary.runs, 0);
});

test('bad register input says which rule failed', () => {
  const service = setup();

  const short = service.register({ username: 'ab', password: ALICE.password }, CLIENT);
  const weak = service.register({ username: 'alice', password: 'short' }, CLIENT);

  assert.ok(!short.ok && !weak.ok);
  assert.equal(short.status, 400);
  assert.match(short.error, /Username/);
  assert.match(weak.error, /Password/);
});

test('too many login attempts from one client are throttled', () => {
  const service = setup({ maxAttempts: 2 });

  service.login({ username: 'x', password: 'y' }, CLIENT);
  service.login({ username: 'x', password: 'y' }, CLIENT);

  assert.equal(service.login({ username: 'x', password: 'y' }, CLIENT).status, 429);
  assert.equal(service.login({ username: 'x', password: 'y' }, 'another-client').status, 401);
});
