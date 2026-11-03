/** Password hashing and session tokens. No I/O. */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { SERVER_CONFIG } from '@/server/config';

const { password: PASSWORD, session: SESSION } = SERVER_CONFIG;

export interface PasswordHash {
  hash: string;
  salt: string;
}

export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(PASSWORD.saltBytes).toString('hex');
  const hash = scryptSync(password, salt, PASSWORD.keyLength).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, { hash, salt }: PasswordHash): boolean {
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, PASSWORD.keyLength);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function newSessionToken(): string {
  return randomBytes(SESSION.tokenBytes).toString('hex');
}

/**
 * Burned on a login for an unknown username, so a miss costs the same scrypt
 * time as a wrong password and response timing does not reveal which names exist.
 */
export const DUMMY_HASH: PasswordHash = hashPassword('timing-equaliser');
