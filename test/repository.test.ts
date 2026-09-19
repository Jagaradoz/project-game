/**
 * The mock data layer. Runs headless: localStorage is faked below, and Web
 * Crypto comes from Node's own globalThis.crypto.
 */

import { beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';

import { BIOME_CATALOG, STAGES_PER_BIOME } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/client';
import { GUEST_USER, createMockRepository } from '@/lib/api/mock/repository';
import { STORAGE_KEY, clearDb, emptyDb, readDb, writeDb } from '@/lib/api/mock/storage';
import type { SubmitRunInput } from '@/types/api';

/** Minimal in-memory Storage, so the repository runs with no DOM. */
class FakeStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
});

const FIRST_BIOME = BIOME_CATALOG[0]!.biomeId;
const SECOND_BIOME = BIOME_CATALOG[1]!.biomeId;

function runInput(overrides: Partial<SubmitRunInput> = {}): SubmitRunInput {
  return {
    clientRunId: `run-${Math.random().toString(36).slice(2)}`,
    biomeId: FIRST_BIOME,
    stageNumber: 1,
    score: 100,
    enemiesKilled: 10,
    durationMs: 60_000,
    distanceM: 400,
    movementCount: 120,
    difficulty: 'normal',
    isCleared: true,
    ...overrides,
  };
}

const credentials = {
  email: 'player@example.com',
  password: 'correct-horse',
  displayName: 'Runner',
};

/* ------------------------------------------------------------- session ---- */

test('there is no session until someone registers or logs in', async () => {
  const repo = createMockRepository();
  assert.equal(await repo.getSession(), null);
});

test('register signs the account in and never stores the password', async () => {
  const repo = createMockRepository();
  const session = await repo.register(credentials);

  assert.equal(session.user.email, credentials.email);
  assert.equal(session.user.displayName, 'Runner');

  const raw = storage.getItem(STORAGE_KEY)!;
  assert.ok(!raw.includes(credentials.password), 'the plain password reached storage');

  const stored = readDb().accounts[0]!;
  assert.ok(stored.passwordDigest.length > 0);
  assert.ok(stored.passwordSalt.length > 0);
});

test('a duplicate email is refused', async () => {
  const repo = createMockRepository();
  await repo.register(credentials);

  await assert.rejects(
    () => repo.register({ ...credentials, displayName: 'Someone Else' }),
    (error: unknown) => error instanceof ApiError && error.status === 409,
  );
});

test('login accepts the right password and rejects the wrong one', async () => {
  const repo = createMockRepository();
  await repo.register(credentials);
  await repo.logout();

  assert.equal(await repo.getSession(), null);

  const session = await repo.login({ email: credentials.email, password: credentials.password });
  assert.equal(session.user.email, credentials.email);

  await repo.logout();
  await assert.rejects(
    () => repo.login({ email: credentials.email, password: 'wrong-password' }),
    (error: unknown) => error instanceof ApiError && error.status === 401,
  );
});

test('login gives the same message for an unknown email as for a bad password', async () => {
  const repo = createMockRepository();
  await repo.register(credentials);
  await repo.logout();

  const unknown = await repo
    .login({ email: 'nobody@example.com', password: 'whatever' })
    .catch((error: ApiError) => error.message);
  const wrong = await repo
    .login({ email: credentials.email, password: 'whatever' })
    .catch((error: ApiError) => error.message);

  assert.equal(unknown, wrong);
});

test('the email is fixed at registration; only the display name changes', async () => {
  const repo = createMockRepository();
  const session = await repo.register(credentials);

  assert.equal(session.user.avatarSeed, session.user.id);

  const updated = await repo.updateDisplayName('  New Name  ');
  assert.equal(updated.displayName, 'New Name');
  assert.equal(updated.email, credentials.email);
  assert.equal(updated.avatarSeed, session.user.id);

  await assert.rejects(() => repo.updateDisplayName('x'));
});

test('the avatar seed can be changed without touching the email', async () => {
  const repo = createMockRepository();
  const session = await repo.register(credentials);

  const updated = await repo.updateProfile({
    displayName: session.user.displayName,
    avatarSeed: 'critter-pick-1',
  });

  assert.equal(updated.avatarSeed, 'critter-pick-1');
  assert.equal(updated.displayName, 'Runner');
  assert.equal(updated.email, credentials.email);
});

test('editing the display name requires a session', async () => {
  const repo = createMockRepository();
  await assert.rejects(
    () => repo.updateDisplayName('Anonymous'),
    (error: unknown) => error instanceof ApiError && error.status === 401,
  );
});

/* ----------------------------------------------------------------- run ---- */

test('the same clientRunId is recorded exactly once', async () => {
  const repo = createMockRepository();
  const input = runInput({ clientRunId: 'fixed-key' });

  const first = await repo.submitRun(input);
  const second = await repo.submitRun(input);

  assert.equal(first.id, second.id);
  assert.equal(readDb().runs.length, 1);
});

test('a resubmitted run does not inflate the stats', async () => {
  const repo = createMockRepository();
  const input = runInput({ clientRunId: 'fixed-key', score: 250 });

  await repo.submitRun(input);
  await repo.submitRun(input);

  const profile = await repo.getProfile();
  assert.equal(profile.stats.totalRuns, 1);
  assert.equal(profile.stats.bestScore, 250);
});

test('runs are refused for an unknown biome or an out-of-range stage', async () => {
  const repo = createMockRepository();

  await assert.rejects(() => repo.submitRun(runInput({ biomeId: 'atlantis' })));
  await assert.rejects(() => repo.submitRun(runInput({ stageNumber: 0 })));
  await assert.rejects(() => repo.submitRun(runInput({ stageNumber: STAGES_PER_BIOME + 1 })));
  await assert.rejects(() => repo.submitRun(runInput({ stageNumber: 1.5 })));
});

test('a guest keeps their runs when they register', async () => {
  const repo = createMockRepository();
  await repo.submitRun(runInput({ score: 300 }));

  const asGuest = await repo.getProfile();
  assert.equal(asGuest.user.id, GUEST_USER.id);
  assert.equal(asGuest.stats.totalRuns, 1);

  await repo.register(credentials);
  const asMember = await repo.getProfile();

  assert.equal(asMember.user.email, credentials.email);
  assert.equal(asMember.stats.totalRuns, 1, 'the guest run was lost on registration');
});

/* ------------------------------------------------------------ progress ---- */

test('only the first stage of the first biome starts unlocked', async () => {
  const repo = createMockRepository();
  const biomes = await repo.getBiomes();

  assert.equal(biomes.length, BIOME_CATALOG.length);
  assert.equal(biomes[0]!.isUnlocked, true);
  assert.equal(biomes[0]!.stages[0]!.isUnlocked, true);
  assert.equal(biomes[0]!.stages[1]!.isUnlocked, false);
  assert.equal(biomes[1]!.isUnlocked, false);
});

test('clearing a stage unlocks the next one, and failing it does not', async () => {
  const repo = createMockRepository();

  await repo.submitRun(runInput({ stageNumber: 1, isCleared: false }));
  let biomes = await repo.getBiomes();
  assert.equal(biomes[0]!.stages[0]!.isCleared, false);
  assert.equal(biomes[0]!.stages[1]!.isUnlocked, false);

  await repo.submitRun(runInput({ stageNumber: 1, isCleared: true }));
  biomes = await repo.getBiomes();
  assert.equal(biomes[0]!.stages[0]!.isCleared, true);
  assert.equal(biomes[0]!.stages[1]!.isUnlocked, true);
  assert.equal(biomes[0]!.stages[2]!.isUnlocked, false);
});

test('clearing all ten stages unlocks the next biome', async () => {
  const repo = createMockRepository();

  for (let stageNumber = 1; stageNumber <= STAGES_PER_BIOME; stageNumber += 1) {
    await repo.submitRun(runInput({ stageNumber, isCleared: true }));
  }

  const biomes = await repo.getBiomes();
  assert.equal(biomes[0]!.stages.every((stage) => stage.isCleared), true);
  assert.equal(biomes[1]!.isUnlocked, true);
  assert.equal(biomes[1]!.stages[0]!.isUnlocked, true);
});

test('a run in a locked biome does not unlock it', async () => {
  const repo = createMockRepository();
  await repo.submitRun(runInput({ biomeId: SECOND_BIOME, stageNumber: 1, isCleared: true }));

  const biomes = await repo.getBiomes();
  assert.equal(biomes[1]!.isUnlocked, false);
  assert.equal(biomes[1]!.stages[0]!.isCleared, false, 'a locked biome reported progress');
});

test('bestScore per stage is the highest of that stage, not the latest', async () => {
  const repo = createMockRepository();
  await repo.submitRun(runInput({ stageNumber: 1, score: 900 }));
  await repo.submitRun(runInput({ stageNumber: 1, score: 120 }));

  const biomes = await repo.getBiomes();
  assert.equal(biomes[0]!.stages[0]!.bestScore, 900);
});

test('stats accumulate across runs', async () => {
  const repo = createMockRepository();
  await repo.submitRun(runInput({ score: 100, durationMs: 1000, movementCount: 10, enemiesKilled: 3 }));
  await repo.submitRun(runInput({ score: 400, durationMs: 2500, movementCount: 40, enemiesKilled: 9 }));

  const { stats } = await repo.getProfile();
  assert.deepEqual(stats, {
    totalRuns: 2,
    bestScore: 400,
    totalDurationMs: 3500,
    totalMovementCount: 50,
    totalEnemiesKilled: 12,
  });
});

/* --------------------------------------------------------- leaderboard ---- */

test('the leaderboard ranks by score and shows one row per player', async () => {
  const repo = createMockRepository();

  await repo.register(credentials);
  await repo.submitRun(runInput({ score: 300 }));
  await repo.submitRun(runInput({ score: 700 }));
  await repo.logout();

  await repo.register({ ...credentials, email: 'rival@example.com', displayName: 'Rival' });
  await repo.submitRun(runInput({ score: 500 }));

  const board = await repo.getLeaderboard();

  assert.equal(board.length, 2, 'a player appeared more than once');
  assert.deepEqual(
    board.map((entry) => [entry.rank, entry.displayName, entry.score]),
    [
      [1, 'Runner', 700],
      [2, 'Rival', 500],
    ],
  );
  assert.equal(board[1]!.isCurrentUser, true);
  assert.equal(board[0]!.isCurrentUser, false);
});

test('the leaderboard never exposes an email', async () => {
  const repo = createMockRepository();
  await repo.register(credentials);
  await repo.submitRun(runInput());

  const board = await repo.getLeaderboard();
  assert.ok(!JSON.stringify(board).includes(credentials.email));
});

test('the leaderboard honours its limit', async () => {
  const repo = createMockRepository();
  await repo.submitRun(runInput());

  assert.equal((await repo.getLeaderboard(0)).length, 0);
  assert.equal((await repo.getLeaderboard(5)).length, 1);
});

/* ------------------------------------------------------------ recovery ---- */

test('corrupt stored JSON is discarded rather than thrown', async () => {
  storage.setItem(STORAGE_KEY, '{not json at all');

  const repo = createMockRepository();
  assert.equal(await repo.getSession(), null);
  assert.equal((await repo.getProfile()).stats.totalRuns, 0);
});

test('stored entries that do not fit the shape are dropped', async () => {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      accounts: [{ id: 'x' }],
      sessionUserId: 42,
      runs: [{ id: 'r1' }, null, 'nonsense'],
    }),
  );

  const db = readDb();
  assert.deepEqual(db.accounts, []);
  assert.deepEqual(db.runs, []);
  assert.equal(db.sessionUserId, null);
});

test('everything still works with no storage at all', async () => {
  Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });

  const repo = createMockRepository();
  assert.equal(await repo.getSession(), null);

  const run = await repo.submitRun(runInput());
  assert.equal(run.score, 100);
  assert.equal((await repo.getBiomes())[0]!.isUnlocked, true);
});

/* ------------------------------------------------- storage edge cases ---- */

test('clearDb removes the stored database', async () => {
  const repo = createMockRepository();
  await repo.register(credentials);
  assert.ok(storage.getItem(STORAGE_KEY));

  clearDb();
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(readDb().accounts.length, 0);
});

test('a storage that throws on write does not break the run', async () => {
  // A full quota, or a browser configured to block site data. The result must
  // still come back; it simply will not survive a reload.
  storage.setItem = () => {
    throw new DOMException('QuotaExceededError');
  };

  const repo = createMockRepository();
  const run = await repo.submitRun(runInput({ score: 42 }));
  assert.equal(run.score, 42);
  assert.equal(writeDb(emptyDb()), false);
});

test('a storage that throws on read falls back to an empty database', () => {
  storage.getItem = () => {
    throw new DOMException('SecurityError');
  };

  assert.deepEqual(readDb(), emptyDb());
});

test('writeDb reports failure when there is no storage at all', () => {
  Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
  assert.equal(writeDb(emptyDb()), false);
});

test('a stored database from a future shape is coerced, not trusted', () => {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 99, accounts: 'not an array', runs: { nope: true } }),
  );

  const db = readDb();
  assert.deepEqual(db.accounts, []);
  assert.deepEqual(db.runs, []);
});

test('a run with an unrecognised difficulty is dropped on read', () => {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      accounts: [],
      sessionUserId: null,
      runs: [
        {
          id: 'r1',
          clientRunId: 'c1',
          userId: 'u1',
          biomeId: FIRST_BIOME,
          stageNumber: 1,
          score: 1,
          enemiesKilled: 1,
          durationMs: 1,
          distanceM: 1,
          movementCount: 1,
          difficulty: 'nightmare',
          isCleared: true,
          completedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }),
  );

  assert.deepEqual(readDb().runs, []);
});
