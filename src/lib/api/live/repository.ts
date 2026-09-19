/**
 * The real API, behind the same interface as the mock.
 *
 * It cannot be exercised yet -- the backend is นายวสันต์ จันทร์ฉิม's per TOR 5 --
 * but it is written now so the seam is proven rather than assumed. Every
 * response goes through apiRequest(), which validates it against a zod schema
 * before any page sees it, so a backend that disagrees with src/types/api.ts
 * fails loudly at the boundary instead of quietly rendering undefined.
 *
 * Paths here are the frontend's request to the backend. They are the contract
 * to agree on, not a guess to work around.
 */

import { apiRequest } from '@/lib/api/client';
import { avatarSeedFor } from '@/lib/avatar';
import type { GameRepository } from '@/lib/api/repository';
import type {
  AuthSession,
  BiomeProgress,
  LeaderboardEntry,
  LoginInput,
  ProfileEditInput,
  ProfileSummary,
  RegisterInput,
  RunResult,
  SubmitRunInput,
  User,
} from '@/types/api';
import { z } from 'zod';

const userSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
    createdAt: z.string(),
    avatarSeed: z.string().optional(),
  })
  .transform((user) => ({
    ...user,
    avatarSeed: avatarSeedFor(user),
  }));

const sessionSchema = z.object({
  user: userSchema,
  expiresAt: z.string(),
});

const runSchema = z.object({
  id: z.string(),
  userId: z.string(),
  biomeId: z.string(),
  stageNumber: z.number(),
  score: z.number(),
  enemiesKilled: z.number(),
  durationMs: z.number(),
  distanceM: z.number(),
  movementCount: z.number(),
  difficulty: z.enum(['easy', 'normal', 'hard']),
  isCleared: z.boolean(),
  completedAt: z.string(),
});

const biomeSchema = z.object({
  biomeId: z.string(),
  name: z.string(),
  isUnlocked: z.boolean(),
  stages: z.array(
    z.object({
      stageNumber: z.number(),
      isUnlocked: z.boolean(),
      isCleared: z.boolean(),
      bestScore: z.number().nullable(),
    }),
  ),
});

const profileSchema = z.object({
  user: userSchema,
  stats: z.object({
    totalRuns: z.number(),
    bestScore: z.number(),
    totalDurationMs: z.number(),
    totalMovementCount: z.number(),
    totalEnemiesKilled: z.number(),
  }),
  biomes: z.array(biomeSchema),
  recentRuns: z.array(runSchema),
});

const leaderboardSchema = z.array(
  z.object({
    rank: z.number(),
    displayName: z.string(),
    score: z.number(),
    recordedAt: z.string(),
    isCurrentUser: z.boolean(),
  }),
);

/** apiRequest returns the envelope; every endpoint here has a non-null payload. */
function required<T>(data: T | null): T {
  if (data === null) throw new Error('The server returned an empty payload.');
  return data;
}

export function createLiveRepository(): GameRepository {
  return {
    async getSession(): Promise<AuthSession | null> {
      const response = await apiRequest('/auth/session', { schema: sessionSchema.nullable() });
      return response.data;
    },

    async register(input: RegisterInput): Promise<AuthSession> {
      const response = await apiRequest('/auth/register', {
        method: 'POST',
        body: input,
        schema: sessionSchema,
      });
      return required(response.data);
    },

    async login(input: LoginInput): Promise<AuthSession> {
      const response = await apiRequest('/auth/login', {
        method: 'POST',
        body: input,
        schema: sessionSchema,
      });
      return required(response.data);
    },

    async logout(): Promise<void> {
      await apiRequest('/auth/logout', { method: 'POST', schema: z.null() });
    },

    async updateDisplayName(displayName: string): Promise<User> {
      const response = await apiRequest('/me', {
        method: 'PATCH',
        body: { displayName },
        schema: userSchema,
      });
      return required(response.data);
    },

    async updateProfile(input: ProfileEditInput): Promise<User> {
      const response = await apiRequest('/me', {
        method: 'PATCH',
        body: input,
        schema: userSchema,
      });
      return required(response.data);
    },

    async getProfile(): Promise<ProfileSummary> {
      const response = await apiRequest('/me/profile', { schema: profileSchema });
      return required(response.data);
    },

    async getBiomes(): Promise<BiomeProgress[]> {
      const response = await apiRequest('/me/progress', { schema: z.array(biomeSchema) });
      return required(response.data);
    },

    async submitRun(input: SubmitRunInput): Promise<RunResult> {
      const response = await apiRequest('/runs', {
        method: 'POST',
        body: input,
        schema: runSchema,
      });
      return required(response.data);
    },

    async getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
      const response = await apiRequest(`/leaderboard?limit=${limit}`, {
        schema: leaderboardSchema,
      });
      return required(response.data);
    },
  };
}
