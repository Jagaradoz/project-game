/**
 * The whole backend, standing in on localStorage.
 *
 * Selected by NEXT_PUBLIC_API_MODE=mock. It exists so every screen in the TOR
 * can be built, demoed and reviewed before the API does -- backend, database and
 * real auth belong to นายวสันต์ จันทร์ฉิม per TOR 5.
 *
 * DO NOT PROMOTE THIS FILE. The accounts here live in one browser, the "session"
 * is a stored id, and nothing is authenticated. Every account screen says so on
 * screen. When the real API lands, this directory is deleted and
 * src/lib/api/index.ts stops selecting it.
 *
 * Progress is always DERIVED from stored runs rather than kept as its own
 * mutable field, so an unlock can never drift from the run that earned it.
 */

import { ApiError } from '@/lib/api/client';
import {
  BIOME_CATALOG,
  STAGES_PER_BIOME,
  isKnownBiome,
  isValidStageNumber,
} from '@/lib/api/catalog';
import { createSalt, derivePasswordDigest, digestsMatch } from '@/lib/api/mock/crypto';
import { readDb, writeDb } from '@/lib/api/mock/storage';
import type { MockAccount, MockDb, StoredRun } from '@/lib/api/mock/storage';
import type { GameRepository } from '@/lib/api/repository';
import { avatarSeedFor } from '@/lib/avatar';
import { displayNameSchema, loginSchema, profileEditSchema, registerSchema } from '@/lib/validation/account';
import type {
  AuthSession,
  BiomeProgress,
  LeaderboardEntry,
  LoginInput,
  PlayerStats,
  ProfileEditInput,
  ProfileSummary,
  RegisterInput,
  RunResult,
  StageProgress,
  SubmitRunInput,
  User,
} from '@/types/api';

/**
 * The account a run belongs to when nobody has registered. /play has never
 * required an account and should not start to -- the guest simply gets their
 * stats on this device only, and /profile says so.
 */
export const GUEST_USER: User = {
  id: 'guest-local',
  email: '',
  displayName: 'Guest Runner',
  avatarSeed: 'guest-local',
  createdAt: '1970-01-01T00:00:00.000Z',
};

const SESSION_DAYS = 7;
const RECENT_RUNS = 10;
const DEFAULT_LEADERBOARD_LIMIT = 20;

/* ------------------------------------------------------------- helpers ---- */

function newId(prefix: string): string {
  const unique =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${unique}`;
}

function toUser(account: MockAccount): User {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    avatarSeed: avatarSeedFor(account),
    createdAt: account.createdAt,
  };
}

function patchAccount(patch: { displayName?: string; avatarSeed?: string }): User {
  if (patch.displayName !== undefined) {
    const parsed = displayNameSchema.safeParse(patch.displayName);
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? 'That name is not valid', 400);
    }
    patch = { ...patch, displayName: parsed.data };
  }

  const db = readDb();
  const account = findAccount(db, db.sessionUserId);
  if (!account) throw new ApiError('Sign in before editing your profile', 401);

  const updated: MockAccount = {
    ...account,
    ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
    ...(patch.avatarSeed !== undefined ? { avatarSeed: patch.avatarSeed } : {}),
  };
  writeDb({
    ...db,
    accounts: db.accounts.map((entry) => (entry.id === account.id ? updated : entry)),
  });

  return toUser(updated);
}

function sessionFor(user: User): AuthSession {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return { user, expiresAt };
}

function findAccount(db: MockDb, userId: string | null): MockAccount | null {
  if (!userId) return null;
  return db.accounts.find((account) => account.id === userId) ?? null;
}

/** The signed-in user, or the guest. Never null -- runs always have an owner. */
function currentUser(db: MockDb): User {
  const account = findAccount(db, db.sessionUserId);
  return account ? toUser(account) : GUEST_USER;
}

/* ------------------------------------------------------------ progress ---- */

/**
 * Rebuilds the unlock tree from runs.
 *
 * Stage 1 of the first biome is always open. Stage n opens when n-1 is cleared;
 * a biome opens when every stage of the previous one is cleared. With Training
 * mode there is one biome of one stage, so this reduces to "cleared yet?".
 */
export function deriveBiomeProgress(runs: readonly StoredRun[], userId: string): BiomeProgress[] {
  const mine = runs.filter((run) => run.userId === userId);
  const result: BiomeProgress[] = [];
  let isBiomeUnlocked = true;

  for (const entry of BIOME_CATALOG) {
    const inBiome = mine.filter((run) => run.biomeId === entry.biomeId);
    const stages: StageProgress[] = [];
    let isPreviousCleared = true;

    for (let stageNumber = 1; stageNumber <= STAGES_PER_BIOME; stageNumber += 1) {
      const forStage = inBiome.filter((run) => run.stageNumber === stageNumber);
      const isCleared = forStage.some((run) => run.isCleared);
      const scores = forStage.map((run) => run.score);

      stages.push({
        stageNumber,
        isUnlocked: isBiomeUnlocked && isPreviousCleared,
        isCleared: isBiomeUnlocked && isCleared,
        bestScore: scores.length > 0 ? Math.max(...scores) : null,
      });

      isPreviousCleared = isCleared;
    }

    result.push({
      biomeId: entry.biomeId,
      name: entry.name,
      isUnlocked: isBiomeUnlocked,
      stages,
    });

    // The next biome opens only once this one is finished end to end.
    isBiomeUnlocked = isBiomeUnlocked && stages.every((stage) => stage.isCleared);
  }

  return result;
}

export function deriveStats(runs: readonly StoredRun[], userId: string): PlayerStats {
  const mine = runs.filter((run) => run.userId === userId);

  return {
    totalRuns: mine.length,
    bestScore: mine.reduce((best, run) => Math.max(best, run.score), 0),
    totalDurationMs: mine.reduce((total, run) => total + run.durationMs, 0),
    totalMovementCount: mine.reduce((total, run) => total + run.movementCount, 0),
    totalEnemiesKilled: mine.reduce((total, run) => total + run.enemiesKilled, 0),
  };
}

/* ---------------------------------------------------------- repository ---- */

export function createMockRepository(): GameRepository {
  return {
    async getSession(): Promise<AuthSession | null> {
      const db = readDb();
      const account = findAccount(db, db.sessionUserId);
      return account ? sessionFor(toUser(account)) : null;
    },

    async register(input: RegisterInput): Promise<AuthSession> {
      const parsed = registerSchema.safeParse(input);
      if (!parsed.success) {
        throw new ApiError(parsed.error.issues[0]?.message ?? 'Those details are not valid', 400);
      }

      const db = readDb();
      const { email, password, displayName } = parsed.data;

      if (db.accounts.some((account) => account.email === email)) {
        throw new ApiError('That email address is already registered', 409);
      }

      const passwordSalt = createSalt();
      const id = newId('user');
      const account: MockAccount = {
        id,
        email,
        displayName,
        avatarSeed: id,
        passwordSalt,
        passwordDigest: await derivePasswordDigest(password, passwordSalt),
        createdAt: new Date().toISOString(),
      };

      // A registering player keeps the runs they made as a guest on this
      // device; throwing them away would punish trying the game first.
      writeDb({
        ...db,
        accounts: [...db.accounts, account],
        sessionUserId: account.id,
        runs: db.runs.map((run) =>
          run.userId === GUEST_USER.id ? { ...run, userId: account.id } : run,
        ),
      });

      return sessionFor(toUser(account));
    },

    async login(input: LoginInput): Promise<AuthSession> {
      const parsed = loginSchema.safeParse(input);
      if (!parsed.success) {
        throw new ApiError(parsed.error.issues[0]?.message ?? 'Those details are not valid', 400);
      }

      const db = readDb();
      const account = db.accounts.find((entry) => entry.email === parsed.data.email);

      // One message for both cases, so the form cannot be used to discover
      // which emails are registered.
      const rejection = new ApiError('Incorrect email address or password', 401);
      if (!account) throw rejection;

      const digest = await derivePasswordDigest(parsed.data.password, account.passwordSalt);
      if (!digestsMatch(digest, account.passwordDigest)) throw rejection;

      writeDb({ ...db, sessionUserId: account.id });
      return sessionFor(toUser(account));
    },

    async logout(): Promise<void> {
      const db = readDb();
      writeDb({ ...db, sessionUserId: null });
    },

    async updateDisplayName(displayName: string): Promise<User> {
      return patchAccount({ displayName });
    },

    async updateProfile(input: ProfileEditInput): Promise<User> {
      const parsed = profileEditSchema.safeParse(input);
      if (!parsed.success) {
        throw new ApiError(parsed.error.issues[0]?.message ?? 'Those details are not valid', 400);
      }

      return patchAccount(parsed.data);
    },

    async getProfile(): Promise<ProfileSummary> {
      const db = readDb();
      const user = currentUser(db);
      const mine = db.runs
        .filter((run) => run.userId === user.id)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

      return {
        user,
        stats: deriveStats(db.runs, user.id),
        biomes: deriveBiomeProgress(db.runs, user.id),
        recentRuns: mine.slice(0, RECENT_RUNS),
      };
    },

    async getBiomes(): Promise<BiomeProgress[]> {
      const db = readDb();
      return deriveBiomeProgress(db.runs, currentUser(db).id);
    },

    async submitRun(input: SubmitRunInput): Promise<RunResult> {
      if (!isKnownBiome(input.biomeId)) {
        throw new ApiError(`Unknown biome "${input.biomeId}"`, 400);
      }
      if (!isValidStageNumber(input.stageNumber)) {
        throw new ApiError(`Stage must be between 1 and ${STAGES_PER_BIOME}`, 400);
      }
      if (!input.clientRunId) {
        throw new ApiError('clientRunId is required for idempotent submission.', 400);
      }

      const db = readDb();
      const user = currentUser(db);

      // TOR 3: one finished run must never be recorded twice. /result is
      // reachable by reload, so this path is hit in normal use, not just on retry.
      const existing = db.runs.find((run) => run.clientRunId === input.clientRunId);
      if (existing) return existing;

      const { clientRunId, ...rest } = input;
      const run: StoredRun = {
        ...rest,
        clientRunId,
        id: newId('run'),
        userId: user.id,
        completedAt: new Date().toISOString(),
      };

      writeDb({ ...db, runs: [...db.runs, run] });
      return run;
    },

    async getLeaderboard(limit = DEFAULT_LEADERBOARD_LIMIT): Promise<LeaderboardEntry[]> {
      const db = readDb();
      const me = currentUser(db);

      // One row per player -- their best run. A single strong player would
      // otherwise fill the whole table with their own attempts.
      const bestByUser = new Map<string, StoredRun>();
      for (const run of db.runs) {
        const best = bestByUser.get(run.userId);
        if (!best || run.score > best.score) bestByUser.set(run.userId, run);
      }

      const nameFor = (userId: string): string =>
        userId === GUEST_USER.id
          ? GUEST_USER.displayName
          : (findAccount(db, userId)?.displayName ?? 'Player');

      return [...bestByUser.values()]
        .sort((a, b) => b.score - a.score || a.completedAt.localeCompare(b.completedAt))
        .slice(0, Math.max(0, limit))
        .map((run, index) => ({
          rank: index + 1,
          // TOR 3: the in-game name only, never the email.
          displayName: nameFor(run.userId),
          score: run.score,
          recordedAt: run.completedAt,
          isCurrentUser: run.userId === me.id,
        }));
    },
  };
}
