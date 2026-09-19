/**
 * The contract between this frontend and the backend.
 *
 * TOR 5 splits the project: Backend, database, auth and the API belong to
 * นายวสันต์ จันทร์ฉิม. This file is the seam. It is the frontend's statement of
 * what it needs; the mock adapter in src/lib/api/mock implements it so every
 * page is buildable and demoable before the real API exists.
 *
 * Nothing here carries camera frames or landmark data. TOR 3 is explicit: video
 * never leaves the browser, and per-frame joint positions are never stored.
 */

import type { Difficulty } from '@/engine/types';

/** The envelope every endpoint responds with. */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: PageMeta;
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
}

/* ---------------------------------------------------------------- user ---- */

export interface User {
  id: string;
  /** Set at registration and never editable, per TOR 3 (ระบบสมาชิก). */
  email: string;
  displayName: string;
  /**
   * DiceBear Critters seed. The image is generated from this string, so the
   * backend never stores a photo. Empty/missing falls back to `id`.
   */
  avatarSeed: string;
  createdAt: string;
}

export interface AuthSession {
  user: User;
  expiresAt: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface ProfileEditInput {
  displayName: string;
  avatarSeed: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/* ----------------------------------------------------------------- run ---- */

/**
 * One completed run. `movementCount` is what the system detected, not a
 * clinically validated energy figure -- TOR 3 (ข้อจำกัดของระบบ) requires that
 * distinction to be kept.
 */
export interface RunResult {
  id: string;
  userId: string;
  biomeId: string;
  stageNumber: number;
  score: number;
  enemiesKilled: number;
  durationMs: number;
  distanceM: number;
  movementCount: number;
  difficulty: Difficulty;
  /**
   * Whether the stage goal was met. This is what unlocks the next stage, so it
   * is the run's outcome and not a derived nicety -- a run that ends on 0 HP
   * short of the goal scores, but unlocks nothing.
   */
  isCleared: boolean;
  completedAt: string;
}

/** Re-exported so pages have one import for contract types. Owned by the engine. */
export type { Difficulty } from '@/engine/types';

/**
 * What the client submits. The server assigns id, userId and completedAt.
 *
 * TREAT EVERY FIELD AS ADVERSARIAL. This is a browser game: the reducer runs on
 * the player's machine, so `score`, `enemiesKilled` and `movementCount` are
 * whatever their client chose to send. Nothing on this side can make them
 * trustworthy. The server should bound or re-derive them before they reach the
 * leaderboard -- at minimum reject values outside what the stage's rules make
 * possible, and rate-limit submissions per user.
 */
export type SubmitRunInput = Omit<RunResult, 'id' | 'userId' | 'completedAt'> & {
  /**
   * Idempotency key, so a retry cannot double-record one run -- TOR 3 requires
   * ป้องกันการบันทึกคะแนนซ้ำจากผลการเล่นครั้งเดียวกัน.
   */
  clientRunId: string;
};

/* ------------------------------------------------------------ progress ---- */

export interface StageProgress {
  stageNumber: number;
  isUnlocked: boolean;
  isCleared: boolean;
  bestScore: number | null;
}

export interface BiomeProgress {
  biomeId: string;
  name: string;
  isUnlocked: boolean;
  stages: StageProgress[];
}

export interface PlayerStats {
  totalRuns: number;
  bestScore: number;
  totalDurationMs: number;
  totalMovementCount: number;
  totalEnemiesKilled: number;
}

export interface ProfileSummary {
  user: User;
  stats: PlayerStats;
  biomes: BiomeProgress[];
  recentRuns: RunResult[];
}

/* --------------------------------------------------------- leaderboard ---- */

export interface LeaderboardEntry {
  rank: number;
  /** The in-game name, so a player need never expose their real one. */
  displayName: string;
  score: number;
  recordedAt: string;
  isCurrentUser: boolean;
}
