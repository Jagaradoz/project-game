import { isKnownBiome, isValidStageNumber } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/client';
import type { GameRepository } from '@/lib/api/repository';
import type { RunResult, SubmitRunInput } from '@/types/api';

const numericFields = [
  'stageNumber', 'score', 'enemiesKilled', 'durationMs', 'distanceM',
  'movementCount', 'stepCount', 'movementMs',
] as const;

/** Independent instances model distinct visits; no storage or account API. */
export function createVisitRepository(): GameRepository {
  const runs = new Map<string, RunResult>();
  let nextId = 1;
  return {
    async getProfile() {
      const recentRuns = [...runs.values()].reverse();
      const stats = {
        totalRuns: recentRuns.length, bestScore: 0, totalDurationMs: 0,
        totalMovementCount: 0, totalEnemiesKilled: 0, totalSteps: 0,
      };
      for (const run of recentRuns) {
        stats.bestScore = Math.max(stats.bestScore, run.score);
        stats.totalDurationMs += run.durationMs;
        stats.totalMovementCount += run.movementCount;
        stats.totalEnemiesKilled += run.enemiesKilled;
        stats.totalSteps += run.stepCount;
      }
      return structuredClone({ stats, recentRuns });
    },
    async submitRun(input: SubmitRunInput) {
      if (!input || typeof input.clientRunId !== 'string' || !input.clientRunId.trim()) {
        throw new ApiError('A completed run needs an idempotency key.', 400);
      }
      const previous = runs.get(input.clientRunId);
      if (previous) return structuredClone(previous);
      if (!isKnownBiome(input.biomeId) || !isValidStageNumber(input.stageNumber)) {
        throw new ApiError('Unknown biome or stage.', 400);
      }
      for (const field of numericFields) {
        const value = input[field];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          throw new ApiError(`${field} must be a finite, nonnegative number.`, 400);
        }
      }
      if (typeof input.isCleared !== 'boolean' || typeof input.goalReached !== 'boolean') {
        throw new ApiError('Run outcomes must be boolean.', 400);
      }
      const { clientRunId, ...summary } = input;
      const result: RunResult = structuredClone({
        ...summary, id: `visit-run-${nextId++}`, completedAt: new Date().toISOString(),
      });
      runs.set(clientRunId, result);
      return structuredClone(result);
    },
  };
}
