import { afterEach, expect, test, vi } from 'vitest';
import { FIRST_BIOME_ID } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/client';
import { createVisitRepository } from '@/lib/api/visit';
import type { SubmitRunInput } from '@/types/api';

afterEach(() => vi.unstubAllGlobals());

function runInput(overrides: Partial<SubmitRunInput> = {}): SubmitRunInput {
  return {
    clientRunId: 'first', biomeId: FIRST_BIOME_ID, stageNumber: 1,
    score: 100, enemiesKilled: 3, durationMs: 60_000, distanceM: 400,
    movementCount: 120, stepCount: 110, movementMs: 55_000,
    goalReached: false, isCleared: false, ...overrides,
  };
}

test('a repeated submission returns the original run without inflating stats', async () => {
  const repository = createVisitRepository();
  const first = await repository.submitRun(runInput());
  const retry = await repository.submitRun(runInput({ score: 999 }));
  expect(retry).toEqual(first);
  expect((await repository.getProfile()).stats.totalRuns).toBe(1);
  expect((await repository.getProfile()).stats.bestScore).toBe(100);
});

test('visit statistics accumulate and runs are returned newest first', async () => {
  const repository = createVisitRepository();
  const first = await repository.submitRun(runInput());
  const second = await repository.submitRun(runInput({
    clientRunId: 'second', score: 400, enemiesKilled: 5,
    durationMs: 120_000, movementCount: 200, stepCount: 180,
  }));
  const profile = await repository.getProfile();
  expect(profile.stats).toEqual({
    totalRuns: 2, bestScore: 400, totalDurationMs: 180_000,
    totalMovementCount: 320, totalEnemiesKilled: 8, totalSteps: 290,
  });
  expect(profile.recentRuns.map((run) => run.id)).toEqual([second.id, first.id]);
});

test('a fresh repository models reload and has no results from an earlier visit', async () => {
  const previousVisit = createVisitRepository();
  await previousVisit.submitRun(runInput());
  const freshVisit = createVisitRepository();
  expect((await freshVisit.getProfile()).recentRuns).toEqual([]);
  expect((await previousVisit.getProfile()).stats.totalRuns).toBe(1);
});

test('input and returned objects cannot mutate stored results', async () => {
  const repository = createVisitRepository();
  const input = runInput();
  const result = await repository.submitRun(input);
  input.score = 900;
  result.score = 800;
  const profile = await repository.getProfile();
  profile.recentRuns[0]!.score = 700;
  profile.recentRuns.pop();
  expect((await repository.getProfile()).recentRuns[0]!.score).toBe(100);
  const retry = await repository.submitRun(runInput());
  retry.score = 600;
  expect((await repository.getProfile()).stats.bestScore).toBe(100);
});

test.each(['score', 'enemiesKilled', 'durationMs', 'distanceM', 'movementCount', 'stepCount', 'movementMs'] as const)(
  'rejects invalid numeric %s instead of recording it', async (field) => {
    const repository = createVisitRepository();
    for (const invalid of [-1, NaN, Infinity, -Infinity]) {
      await expect(repository.submitRun(runInput({ [field]: invalid }))).rejects.toBeInstanceOf(ApiError);
    }
    expect((await repository.getProfile()).stats.totalRuns).toBe(0);
  },
);

test('validates stage, biome, outcomes, and idempotency keys', async () => {
  const repository = createVisitRepository();
  for (const invalid of [
    { biomeId: 'unknown' }, { stageNumber: 0 }, { stageNumber: 1.5 },
    { stageNumber: 2 }, { clientRunId: '' }, { clientRunId: '  ' },
    { goalReached: undefined }, { isCleared: undefined },
  ]) {
    await expect(repository.submitRun(runInput(invalid as Partial<SubmitRunInput>))).rejects.toBeInstanceOf(ApiError);
  }
});

test('preserves goal and step/movement summaries while adding result metadata', async () => {
  const repository = createVisitRepository();
  const { clientRunId, ...summary } = runInput({ goalReached: true, durationMs: 1_250_000 });
  const result = await repository.submitRun({ clientRunId, ...summary });
  expect(result).toMatchObject(summary);
  expect(result).not.toHaveProperty('clientRunId');
  expect(Number.isFinite(Date.parse(result.completedAt))).toBe(true);
});

test('never reads legacy storage, writes storage, or contacts a server', async () => {
  const storage = new Proxy({}, { get() { throw new Error('Storage must remain unused'); } });
  const fetch = vi.fn(() => { throw new Error('Network must remain unused'); });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('fetch', fetch);
  const repository = createVisitRepository();
  await repository.submitRun(runInput());
  expect((await repository.getProfile()).stats.totalRuns).toBe(1);
  expect(fetch).not.toHaveBeenCalled();
});
