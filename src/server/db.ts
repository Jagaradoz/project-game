/** SQLite storage for users, sessions and plays. Prepared statements only. */

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { PlayInput, PlayRecord, PlaySummary } from '@/lib/validation/account';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plays (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    distance_m INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    played_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS plays_by_user ON plays(user_id, played_at DESC);
`;

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
  createUser(username: string, passwordHash: string, salt: string, nowMs: number): number | null;
  findUser(username: string): UserRow | null;
  createSession(token: string, userId: number, expiresAt: number, nowMs: number): void;
  sessionUser(token: string, nowMs: number): SessionUser | null;
  deleteSession(token: string): void;
  addPlay(userId: number, play: PlayInput, nowMs: number): void;
  recentPlays(userId: number, limit: number): PlayRecord[];
  summary(userId: number): PlaySummary;
  close(): void;
}

export function openStore(dbPath: string): Store {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

  const sql = {
    insertUser: db.prepare('INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)'),
    userByName: db.prepare(
      'SELECT id, username, password_hash AS passwordHash, salt FROM users WHERE username = ?',
    ),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
    deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    sessionUser: db.prepare(
      `SELECT users.id, users.username FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ? AND sessions.expires_at > ?`,
    ),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    insertPlay: db.prepare(
      'INSERT INTO plays (user_id, score, distance_m, duration_ms, played_at) VALUES (?, ?, ?, ?, ?)',
    ),
    recentPlays: db.prepare(
      `SELECT score, distance_m AS distanceM, duration_ms AS durationMs, played_at AS playedAt
       FROM plays WHERE user_id = ? ORDER BY played_at DESC, id DESC LIMIT ?`,
    ),
    summary: db.prepare(
      `SELECT COUNT(*) AS runs,
              COALESCE(MAX(score), 0) AS bestScore,
              COALESCE(MAX(distance_m), 0) AS bestDistanceM,
              COALESCE(SUM(duration_ms), 0) AS totalDurationMs
       FROM plays WHERE user_id = ?`,
    ),
  };

  return {
    createUser(username, passwordHash, salt, nowMs) {
      try {
        return Number(sql.insertUser.run(username, passwordHash, salt, nowMs).lastInsertRowid);
      } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE')) return null;
        throw error;
      }
    },
    findUser: (username) => (sql.userByName.get(username) as UserRow | undefined) ?? null,
    createSession(token, userId, expiresAt, nowMs) {
      sql.deleteExpiredSessions.run(nowMs);
      sql.insertSession.run(token, userId, expiresAt);
    },
    sessionUser: (token, nowMs) => (sql.sessionUser.get(token, nowMs) as SessionUser | undefined) ?? null,
    deleteSession: (token) => {
      sql.deleteSession.run(token);
    },
    addPlay: (userId, play, nowMs) => {
      sql.insertPlay.run(userId, play.score, play.distanceM, play.durationMs, nowMs);
    },
    recentPlays: (userId, limit) =>
      (sql.recentPlays.all(userId, limit) as unknown as PlayRecord[]).map((row) => ({ ...row })),
    summary: (userId) => ({ ...(sql.summary.get(userId) as unknown as PlaySummary) }),
    close: () => db.close(),
  };
}
