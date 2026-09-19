import { test } from 'vitest';
import assert from 'node:assert/strict';

import {
  avatarCandidates,
  avatarSeedFor,
  critterSrc,
  randomAvatarSeed,
  AVATAR_CANDIDATE_COUNT,
} from '@/lib/avatar';

test('critterSrc encodes the seed and pins the Critters style', () => {
  const src = critterSrc('user/with spaces');
  assert.match(src, /^https:\/\/api\.dicebear\.com\/10\.x\/critters\/svg\?/);
  assert.match(src, /seed=user%2Fwith\+spaces|seed=user%2Fwith%20spaces/);
  assert.match(src, /backgroundColor=1a2029/);
});

test('avatarSeedFor falls back to the account id', () => {
  assert.equal(avatarSeedFor({ id: 'user_1', avatarSeed: 'picked' }), 'picked');
  assert.equal(avatarSeedFor({ id: 'user_1', avatarSeed: '' }), 'user_1');
  assert.equal(avatarSeedFor({ id: 'user_1' }), 'user_1');
});

test('avatarCandidates keeps the current pick first and fills the grid', () => {
  const seeds = avatarCandidates('current-seed');
  assert.equal(seeds[0], 'current-seed');
  assert.equal(seeds.length, AVATAR_CANDIDATE_COUNT);
  assert.equal(new Set(seeds).size, seeds.length);
});

test('randomAvatarSeed returns a non-empty string', () => {
  assert.ok(randomAvatarSeed().length > 0);
});
