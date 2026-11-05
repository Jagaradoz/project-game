/** Postgres storage for users, sessions and plays. Parameterised queries only. */

import type { PlayInput, PlayRecord, PlaySummary } from '@/lib/validation/account';

/** One statement per entry: Neon's HTTP driver runs a single statement per call. */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci ON users (lower(username))',
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS plays (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    distance_m INTEGER NOT NULL,
    duration_ms BIGINT NOT NULL,
    played_at BIGINT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS plays_by_user ON plays (user_id, played_at DESC)',
];

export interface Database {
  query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

export interface UserRow {
  id: number;
  username: string;
  passwordHash: string;
  salt: string;
}

export interface SessionUser {
  id: number;
  username: string;
}

export interface Store {
  /** @returns The new user id, or null when the name is taken (case-insensitive). */
  createUser(username: string, passwordHash: string, salt: string, nowMs: number): Promise<number | null>;
  findUser(username: string): Promise<UserRow | null>;
  createSession(token: string, userId: number, expiresAt: number, nowMs: number): Promise<void>;
  sessionUser(token: string, nowMs: number): Promise<SessionUser | null>;
  deleteSession(token: string): Promise<void>;
  addPlay(userId: number, play: PlayInput, nowMs: number): Promise<void>;
  recentPlays(userId: number, limit: number): Promise<PlayRecord[]>;
  summary(userId: number): Promise<PlaySummary>;
}

/** BIGINT and SUM come back as strings, so numeric reads are cast to float8. */
export function openStore(database: Database): Store {
  let schemaReady: Promise<void> | null = null;

  async function migrate(): Promise<void> {
    for (const statement of SCHEMA) await database.query(statement);
  }

  async function run<T>(text: string, params: unknown[] = []): Promise<T[]> {
    schemaReady ??= migrate().catch((error) => {
      schemaReady = null;
      throw error;
    });
    await schemaReady;
    return (await database.query(text, params)) as T[];
  }

  return {
    async createUser(username, passwordHash, salt, nowMs) {
      const [row] = await run<{ id: number }>(
        `INSERT INTO users (username, password_hash, salt, created_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING RETURNING id`,
        [username, passwordHash, salt, nowMs],
      );
      return row?.id ?? null;
    },
    async findUser(username) {
      const [row] = await run<UserRow>(
        `SELECT id, username, password_hash AS "passwordHash", salt FROM users
         WHERE lower(username) = lower($1)`,
        [username],
      );
      return row ?? null;
    },
    async createSession(token, userId, expiresAt, nowMs) {
      await run('DELETE FROM sessions WHERE expires_at <= $1', [nowMs]);
      await run('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)', [token, userId, expiresAt]);
    },
    async sessionUser(token, nowMs) {
      const [row] = await run<SessionUser>(
        `SELECT users.id, users.username FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token = $1 AND sessions.expires_at > $2`,
        [token, nowMs],
      );
      return row ?? null;
    },
    async deleteSession(token) {
      await run('DELETE FROM sessions WHERE token = $1', [token]);
    },
    async addPlay(userId, play, nowMs) {
      await run(
        'INSERT INTO plays (user_id, score, distance_m, duration_ms, played_at) VALUES ($1, $2, $3, $4, $5)',
        [userId, play.score, play.distanceM, play.durationMs, nowMs],
      );
    },
    recentPlays: (userId, limit) => run<PlayRecord>(
      `SELECT score, distance_m AS "distanceM", duration_ms::float8 AS "durationMs", played_at::float8 AS "playedAt"
       FROM plays WHERE user_id = $1 ORDER BY played_at DESC, id DESC LIMIT $2`,
      [userId, limit],
    ),
    async summary(userId) {
      const [row] = await run<PlaySummary>(
        `SELECT COUNT(*)::int AS runs,
                COALESCE(MAX(score), 0) AS "bestScore",
                COALESCE(MAX(distance_m), 0) AS "bestDistanceM",
                COALESCE(SUM(duration_ms), 0)::float8 AS "totalDurationMs"
         FROM plays WHERE user_id = $1`,
        [userId],
      );
      return { ...row! };
    },
  };
}
