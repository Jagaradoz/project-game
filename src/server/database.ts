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

  return openLocal(SERVER_CONFIG.localDbPath);
}

/**
 * Opens PGlite lazily. A failed open (folder locked by another dev server, bad
 * data dir) is not cached, so the next request retries instead of failing forever.
 */
function openLocal(dbPath: string): Database {
  type Local = import('@electric-sql/pglite').PGlite;
  let local: Promise<Local> | null = null;

  function connect(): Promise<Local> {
    local ??= (async () => {
      mkdirSync(dbPath, { recursive: true });
      const { PGlite } = await import('@electric-sql/pglite');
      return PGlite.create(dbPath);
    })().catch((error) => {
      local = null;
      throw error;
    });
    return local;
  }

  return {
    async query(text, params) {
      const { rows } = await (await connect()).query<Record<string, unknown>>(text, params);
      return rows;
    },
  };
}
