/** Training rules. Pure derivation, no DOM and no Three.js. */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { CONFIG } from '@/engine/config';
import { TRAINING_STAGE_NUMBER, resolveTrainingRules } from '@/engine/core/stage';

test('resolveTrainingRules never mutates the shared config', () => {
  const before = JSON.stringify(CONFIG);
  const rules = resolveTrainingRules();
  rules.maxHp = 99;
  assert.equal(JSON.stringify(CONFIG), before);
});

test('Training is endless: the base game with no goal and no boss gate', () => {
  const rules = resolveTrainingRules();
  assert.equal(rules.maxHp, CONFIG.game.maxHp);
  assert.equal(rules.goalKills, undefined);
  assert.equal(rules.requireBoss, undefined);
});

test('Training reports itself as stage 1', () => {
  assert.equal(TRAINING_STAGE_NUMBER, 1);
});
