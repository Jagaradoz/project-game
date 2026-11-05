/** Server-only tunables for accounts and play storage. */

import path from 'node:path';

export const SERVER_CONFIG = {
  /** Local PGlite folder, used when DATABASE_URL is unset. Git-ignored; override with DB_PATH. */
  localDbPath: process.env.DB_PATH || path.join(process.cwd(), 'data', 'pglite'),

  session: {
    cookieName: 'exergame_session',
    ttlMs: 7 * 24 * 60 * 60 * 1000,
    tokenBytes: 32,
  },

  password: {
    saltBytes: 16,
    keyLength: 64,
  },

  /** Login/register attempts allowed per client inside the window. */
  rateLimit: {
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000,
  },

  /** How many runs the stats page lists. */
  recentPlaysLimit: 20,
} as const;
