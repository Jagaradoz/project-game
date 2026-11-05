/**
 * Account and play-history use cases, framework-free.
 *
 * Every method takes plain input (a parsed JSON body, a session token, a client
 * key) and returns a plain result, so the whole flow is tested without Next.js.
 * The route handlers in app/api only translate HTTP <-> these calls.
 */

import {
  credentialsSchema,
  firstIssue,
  loginSchema,
  playSchema,
  type PlayRecord,
  type PlaySummary,
} from '@/lib/validation/account';
import { SERVER_CONFIG } from '@/server/config';
import { DUMMY_HASH, hashPassword, newSessionToken, verifyPassword } from '@/server/crypto';
import type { SessionUser, Store } from '@/server/db';
import { createRateLimiter, type RateLimiter } from '@/server/rateLimit';

export interface NewSession {
  token: string;
  maxAgeMs: number;
}

export type ServiceResult<T> =
  | { ok: true; status: number; data: T; session?: NewSession | null }
  | { ok: false; status: number; error: string };

export interface AccountData {
  username: string;
}

export interface MeData {
  username: string;
  summary: PlaySummary;
}

export interface PlaysData {
  summary: PlaySummary;
  recent: PlayRecord[];
}

interface Deps {
  store: Store;
  now?: () => number;
  limiter?: RateLimiter;
}

const fail = (status: number, error: string) => ({ ok: false, status, error }) as const;
const NOT_LOGGED_IN = fail(401, 'Not logged in.');
const TOO_MANY = fail(429, 'Too many attempts. Wait a few minutes and try again.');

export function createAccountService({
  store,
  now = Date.now,
  limiter = createRateLimiter(SERVER_CONFIG.rateLimit.maxAttempts, SERVER_CONFIG.rateLimit.windowMs),
}: Deps) {
  function startSession(userId: number): NewSession {
    const token = newSessionToken();
    const maxAgeMs = SERVER_CONFIG.session.ttlMs;
    store.createSession(token, userId, now() + maxAgeMs, now());
    return { token, maxAgeMs };
  }

  function userFor(token: string | null | undefined): SessionUser | null {
    return token ? store.sessionUser(token, now()) : null;
  }

  return {
    register(body: unknown, clientKey: string): ServiceResult<AccountData> {
      if (!limiter.allow(clientKey, now())) return TOO_MANY;
      const parsed = credentialsSchema.safeParse(body);
      if (!parsed.success) return fail(400, firstIssue(parsed.error));

      const { username, password } = parsed.data;
      const { hash, salt } = hashPassword(password);
      const userId = store.createUser(username, hash, salt, now());
      if (userId === null) return fail(409, 'That username is taken.');

      return { ok: true, status: 201, data: { username }, session: startSession(userId) };
    },

    login(body: unknown, clientKey: string): ServiceResult<AccountData> {
      if (!limiter.allow(clientKey, now())) return TOO_MANY;
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success) return fail(400, firstIssue(parsed.error));

      const user = store.findUser(parsed.data.username);
      const isValid = verifyPassword(
        parsed.data.password,
        user ? { hash: user.passwordHash, salt: user.salt } : DUMMY_HASH,
      );
      if (!user || !isValid) return fail(401, 'Invalid username or password.');

      return { ok: true, status: 200, data: { username: user.username }, session: startSession(user.id) };
    },

    logout(token: string | null | undefined): ServiceResult<null> {
      if (token) store.deleteSession(token);
      return { ok: true, status: 200, data: null, session: null };
    },

    me(token: string | null | undefined): ServiceResult<MeData> {
      const user = userFor(token);
      if (!user) return NOT_LOGGED_IN;
      return { ok: true, status: 200, data: { username: user.username, summary: store.summary(user.id) } };
    },

    addPlay(token: string | null | undefined, body: unknown): ServiceResult<{ summary: PlaySummary }> {
      const user = userFor(token);
      if (!user) return NOT_LOGGED_IN;
      const parsed = playSchema.safeParse(body);
      if (!parsed.success) return fail(400, firstIssue(parsed.error));

      store.addPlay(user.id, parsed.data, now());
      return { ok: true, status: 201, data: { summary: store.summary(user.id) } };
    },

    plays(token: string | null | undefined): ServiceResult<PlaysData> {
      const user = userFor(token);
      if (!user) return NOT_LOGGED_IN;
      return {
        ok: true,
        status: 200,
        data: {
          summary: store.summary(user.id),
          recent: store.recentPlays(user.id, SERVER_CONFIG.recentPlaysLimit),
        },
      };
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
