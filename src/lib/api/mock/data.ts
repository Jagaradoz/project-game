/**
 * In-memory stand-in for the backend, selected by NEXT_PUBLIC_API_MODE=mock.
 *
 * Its only job is to let every page be built and demoed before the real API
 * exists. It is not a fixture library and it is not persisted -- when the
 * backend lands, this module is deleted and the adapter switches over.
 */

import type {
  BiomeProgress,
  LeaderboardEntry,
  ProfileSummary,
  RunResult,
  User,
} from '@/types/api';

const STAGES_PER_BIOME = 10;

export const mockUser: User = {
  id: 'mock-user-1',
  email: 'player@example.com',
  displayName: 'Player One',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function biome(biomeId: string, name: string, isUnlocked: boolean, cleared: number): BiomeProgress {
  return {
    biomeId,
    name,
    isUnlocked,
    stages: Array.from({ length: STAGES_PER_BIOME }, (_, index) => ({
      stageNumber: index + 1,
      isUnlocked: isUnlocked && index <= cleared,
      isCleared: isUnlocked && index < cleared,
      bestScore: isUnlocked && index < cleared ? 500 + index * 40 : null,
    })),
  };
}

export const mockBiomes: BiomeProgress[] = [
  biome('forest', 'Whispering Pines', true, 3),
  biome('autumn', 'Autumn', false, 0),
  biome('highlands', 'Highlands', false, 0),
  biome('oasis', 'Oasis', false, 0),
];

export const mockRuns: RunResult[] = [];

export const mockProfile: ProfileSummary = {
  user: mockUser,
  stats: {
    totalRuns: 0,
    bestScore: 0,
    totalDurationMs: 0,
    totalMovementCount: 0,
    totalEnemiesKilled: 0,
  },
  biomes: mockBiomes,
  recentRuns: mockRuns,
};

export const mockLeaderboard: LeaderboardEntry[] = [];
