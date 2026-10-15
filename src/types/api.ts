/** Visit-scoped results. Camera frames and pose landmarks are never stored. */
import type { RunSummary } from '@/engine/types';

export interface RunResult extends RunSummary {
  id: string;
  completedAt: string;
}
export type SubmitRunInput = RunSummary & {
  /** Retrying a submission cannot add the same completed run twice. */
  clientRunId: string;
};
export interface PlayerStats {
  totalRuns: number;
  bestScore: number;
  totalDurationMs: number;
  totalMovementCount: number;
  totalEnemiesKilled: number;
  totalSteps: number;
}
export interface ProfileSummary {
  stats: PlayerStats;
  recentRuns: RunResult[];
}
