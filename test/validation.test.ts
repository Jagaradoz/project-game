/** Account input rules. Pure zod schemas, no DOM. */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  PASSWORD_MIN,
  displayNameSchema,
  avatarSeedSchema,
  fieldErrors,
  loginSchema,
  profileEditSchema,
  registerSchema,
} from '@/lib/validation/account';

test('accepts a well-formed registration', () => {
  const parsed = registerSchema.safeParse({
    email: 'player@example.com',
    password: 'correct-horse',
    displayName: 'Runner',
  });

  assert.equal(parsed.success, true);
});

test('rejects a malformed email', () => {
  const parsed = registerSchema.safeParse({
    email: 'not-an-email',
    password: 'correct-horse',
    displayName: 'Runner',
  });

  assert.equal(parsed.success, false);
  assert.ok(fieldErrors(parsed.error!).email);
});

test('normalises email case and surrounding space', () => {
  const parsed = registerSchema.safeParse({
    email: '  Player@Example.COM ',
    password: 'correct-horse',
    displayName: 'Runner',
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.data!.email, 'player@example.com');
});

test(`rejects a password under ${PASSWORD_MIN} characters`, () => {
  const parsed = registerSchema.safeParse({
    email: 'player@example.com',
    password: 'short',
    displayName: 'Runner',
  });

  assert.equal(parsed.success, false);
  assert.ok(fieldErrors(parsed.error!).password);
});

test('trims the display name and enforces its bounds', () => {
  assert.equal(displayNameSchema.safeParse('  Runner  ').data, 'Runner');
  assert.equal(displayNameSchema.safeParse('x'.repeat(DISPLAY_NAME_MIN - 1)).success, false);
  assert.equal(displayNameSchema.safeParse('x'.repeat(DISPLAY_NAME_MAX + 1)).success, false);
  assert.equal(displayNameSchema.safeParse('x'.repeat(DISPLAY_NAME_MAX)).success, true);
});

test('login only requires a non-empty password, not a strong one', () => {
  // The strength rule belongs at registration. Applying it at login would lock
  // out an account created before the rule changed.
  assert.equal(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success, true);
  assert.equal(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success, false);
});

test('profile edits require a display name and an avatar seed', () => {
  const parsed = profileEditSchema.safeParse({
    displayName: 'Runner',
    avatarSeed: 'critter-1',
  });
  assert.equal(parsed.success, true);

  assert.equal(avatarSeedSchema.safeParse('').success, false);
  assert.equal(avatarSeedSchema.safeParse('x'.repeat(65)).success, false);
  assert.equal(
    profileEditSchema.safeParse({ displayName: 'Runner' }).success,
    false,
  );
});

test('fieldErrors keeps one message per field', () => {
  const parsed = registerSchema.safeParse({ email: 'nope', password: '', displayName: '' });
  const errors = fieldErrors(parsed.error!);

  assert.deepEqual(Object.keys(errors).sort(), ['displayName', 'email', 'password']);
  for (const message of Object.values(errors)) assert.equal(typeof message, 'string');
});
