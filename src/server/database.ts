/**
 * Picks the Postgres connection: Neon when DATABASE_URL is set, otherwise an
 * on-disk PGlite so local development needs no account or server. Vercel has no
 * writable disk, so a missing URL there is an error rather than a fallback.
 */

import { mkdirSync } from 'node:fs';

import { neon } from '@neondatabase/serverless';

import { SERVER_CONFIG } from '@/server/config';
import type { Database } from '@/server/db';

export function openDatabase(): Database {
  const url = process.env.DATABASE_URL;
  if (url) {
    const sql = neon(url);
    return { query: (text, params) => sql.query(text, params) as Promise<Record<string, unknown>[]> };
  }
  if (process.env.VERCEL) throw new Error('DATABASE_URL is not set for this deployment.');

  mkdirSync(SERVER_CONFIG.localDbPath, { recursive: true });
  const local = import('@electric-sql/pglite').then(({ PGlite }) => PGlite.create(SERVER_CONFIG.localDbPath));
  return {
    async query(text, params) {
      const { rows } = await (await local).query<Record<string, unknown>>(text, params);
      return rows;
    },
  };
}
