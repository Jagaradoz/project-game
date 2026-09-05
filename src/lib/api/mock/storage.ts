/**
 * The mock adapter's persistence, and nothing else.
 *
 * Everything here is deliberately defensive. `localStorage` does not exist
 * during a server render, throws outright in some privacy modes, and can hold
 * JSON written by an older build. A page that white-screens in any of those
 * cases is a bug, so every path falls back to a valid empty database instead.
 *
 * When the backend lands this whole directory is deleted.
 */

import type { Difficulty, RunResult } from '@/types/api';

export const STORAGE_KEY = 'trail_runner_mock_v1';
const SCHEMA_VERSION = 1;

/**
 * A local account. The password itself is never here -- only a PBKDF2 digest
 * and its salt. See mock/repository.ts: this is a stand-in so the screens work
 * before the backend exists, not an authentication system.
 */
export interface MockAccount {
  id: string;
  email: string;
  displayName: string;
  passwordSalt: string;
  passwordDigest: string;
  createdAt: string;
}

/** A stored run keeps the idempotency key the server would otherwise hold. */
export interface StoredRun extends RunResult {
  clientRunId: string;
}

export interface MockDb {
  version: number;
  accounts: MockAccount[];
  sessionUserId: string | null;
  runs: StoredRun[];
}

export function emptyDb(): MockDb {
  return { version: SCHEMA_VERSION, accounts: [], sessionUserId: null, runs: [] };
}

/**
 * The backing store, resolved per call rather than cached: it is absent during
 * a server render and present after hydration, and a cached null would leave
 * the client permanently unable to read its own data.
 */
function getStore(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Access itself throws when site data is blocked.
    return null;
  }
}

export function readDb(): MockDb {
  const store = getStore();
  if (!store) return emptyDb();

  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return emptyDb();
  }
  if (!raw) return emptyDb();

  try {
    return normalise(JSON.parse(raw));
  } catch {
    // Corrupt or truncated JSON. Start clean rather than crashing every page.
    return emptyDb();
  }
}

export function writeDb(db: MockDb): boolean {
  const store = getStore();
  if (!store) return false;

  try {
    store.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch {
    // Quota exceeded, or writes blocked. The in-memory result still stands for
    // this page view; it simply will not survive a reload.
    return false;
  }
}

export function clearDb(): void {
  try {
    getStore()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do -- the store is unavailable, so there is nothing stored.
  }
}

/**
 * Coerces whatever was parsed into a valid MockDb, dropping entries that do not
 * fit. Data written by an older build is untrusted input like any other.
 */
function normalise(value: unknown): MockDb {
  if (!isRecord(value)) return emptyDb();

  return {
    version: SCHEMA_VERSION,
    accounts: toArray(value.accounts).filter(isAccount),
    sessionUserId: typeof value.sessionUserId === 'string' ? value.sessionUserId : null,
    runs: toArray(value.runs).filter(isRun),
  };
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAccount(value: unknown): value is MockAccount {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.email === 'string' &&
    typeof value.displayName === 'string' &&
    typeof value.passwordSalt === 'string' &&
    typeof value.passwordDigest === 'string' &&
    typeof value.createdAt === 'string'
  );
}

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

function isRun(value: unknown): value is StoredRun {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.clientRunId === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.biomeId === 'string' &&
    Number.isFinite(value.stageNumber) &&
    Number.isFinite(value.score) &&
    Number.isFinite(value.enemiesKilled) &&
    Number.isFinite(value.durationMs) &&
    Number.isFinite(value.distanceM) &&
    Number.isFinite(value.movementCount) &&
    typeof value.isCleared === 'boolean' &&
    typeof value.completedAt === 'string' &&
    DIFFICULTIES.includes(value.difficulty as Difficulty)
  );
}
