/** Training rules. Pure derivation, no DOM and no Three.js. */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { CONFIG } from '@/engine/config';
import { TRAINING_STAGE_NUMBER, resolveTrainingRules } from '@/engine/core/stage';

test('resolveTrainingRules never mutates the shared config', () => {
  const before = JSON.stringify(CONFIG);
  resolveTrainingRules();
  assert.equal(JSON.stringify(CONFIG), before);
});

test('Training runs the base game with the kill goal and the boss', () => {
  const rules = resolveTrainingRules();
  assert.equal(rules.maxHp, CONFIG.game.maxHp);
  assert.equal(rules.spawnIntervalMs, CONFIG.game.spawnIntervalMs);
  assert.equal(rules.maxSpeed, CONFIG.game.maxSpeed);
  assert.equal(rules.goalKills, CONFIG.training.goalKills);
  assert.equal(rules.requireBoss, true);
});

test('a goal below 1 is clamped, so a run is never cleared before it starts', () => {
  const rules = resolveTrainingRules({ ...CONFIG, training: { goalKills: 0 } });
  assert.equal(rules.goalKills, 1);
});

test('Training reports itself as stage 1', () => {
  assert.equal(TRAINING_STAGE_NUMBER, 1);
});
