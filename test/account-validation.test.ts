/** Shared account/play rules: the forms and the API parse with the same schemas. */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { credentialsSchema, firstIssue, playSchema, PLAY_LIMITS } from '@/lib/validation/account';
import { hashPassword, newSessionToken, verifyPassword } from '@/server/crypto';
import { createRateLimiter } from '@/server/rateLimit';

test('good credentials pass and the username is trimmed', () => {
  const parsed = credentialsSchema.parse({ username: '  runner_1 ', password: 'password1' });
  assert.equal(parsed.username, 'runner_1');
});

test('bad usernames and passwords are rejected', () => {
  const bad = [
    {},
    { username: 'ab', password: 'password1' },
    { username: 'has space', password: 'password1' },
    { username: 'a'.repeat(21), password: 'password1' },
    { username: 'runner', password: 'short' },
    { username: 'runner', password: 'x'.repeat(73) },
    { username: 'runner', password: 12345678 },
  ];
  for (const body of bad) assert.equal(credentialsSchema.safeParse(body).success, false, JSON.stringify(body));
});

test('a run must be whole, non-negative numbers inside the limits', () => {
  assert.ok(playSchema.safeParse({ score: 3, distanceM: 120, durationMs: 4_000 }).success);
  assert.ok(!playSchema.safeParse({ score: PLAY_LIMITS.maxScore + 1, distanceM: 0, durationMs: 0 }).success);
  assert.ok(!playSchema.safeParse({ score: '3', distanceM: 0, durationMs: 0 }).success);
});

test('firstIssue surfaces the message a form should show', () => {
  const result = credentialsSchema.safeParse({ username: 'ab', password: 'password1' });
  assert.ok(!result.success);
  assert.match(firstIssue(result.error), /3-20/);
});

test('a hashed password verifies, a wrong one does not, and salts differ', () => {
  const stored = hashPassword('correct horse');

  assert.equal(verifyPassword('correct horse', stored), true);
  assert.equal(verifyPassword('wrong horse', stored), false);
  assert.notEqual(hashPassword('correct horse').salt, stored.salt);
});

test('session tokens are long and unique', () => {
  const token = newSessionToken();
  assert.equal(token.length, 64);
  assert.notEqual(token, newSessionToken());
});

test('the rate limit window resets once it has passed', () => {
  const limiter = createRateLimiter(1, 1_000);

  assert.equal(limiter.allow('k', 0), true);
  assert.equal(limiter.allow('k', 500), false);
  assert.equal(limiter.allow('k', 1_000), true);
});
