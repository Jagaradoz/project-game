/** Stage and difficulty rules. Pure derivation, no DOM and no Three.js. */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { CONFIG } from '@/engine/config';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  difficultyLabel,
  difficultyPreset,
  isDifficulty,
  resolveStageRules,
  stageGoalKills,
} from '@/engine/core/stage';

const GAME = CONFIG.game;

test('resolveStageRules never mutates the shared config', () => {
  const before = JSON.stringify(CONFIG.game);
  resolveStageRules(3, 10, 'hard');
  assert.equal(JSON.stringify(CONFIG.game), before);
});

test('stage 1 on normal is the base game, plus a goal', () => {
  const rules = resolveStageRules(0, 1, 'normal');

  assert.equal(rules.spawnIntervalMs, GAME.spawnIntervalMs);
  assert.equal(rules.maxSpeed, GAME.maxSpeed);
  assert.equal(rules.rampDistance, GAME.rampDistance);
  assert.equal(rules.maxHp, GAME.maxHp);
  assert.equal(rules.goalKills, CONFIG.stage.baseGoalKills);
});

test('the goal grows with the stage and with the biome', () => {
  const first = stageGoalKills(0, 1);
  const laterStage = stageGoalKills(0, 5);
  const laterBiome = stageGoalKills(2, 1);

  assert.ok(laterStage > first);
  assert.ok(laterBiome > first);
  assert.equal(laterStage, first + 4 * CONFIG.stage.goalKillsPerStage);
  assert.equal(laterBiome, first + 2 * CONFIG.stage.goalKillsPerBiome);
});

test('easy is gentler than normal, and hard is harsher, on every axis', () => {
  const easy = resolveStageRules(0, 5, 'easy');
  const normal = resolveStageRules(0, 5, 'normal');
  const hard = resolveStageRules(0, 5, 'hard');

  // Longer spawn gaps, lower top speed, a slower ramp, more HP, a smaller goal.
  assert.ok(easy.spawnIntervalMs > normal.spawnIntervalMs);
  assert.ok(hard.spawnIntervalMs < normal.spawnIntervalMs);

  assert.ok(easy.maxSpeed < normal.maxSpeed);
  assert.ok(hard.maxSpeed > normal.maxSpeed);

  assert.ok(easy.rampDistance > normal.rampDistance);
  assert.ok(hard.rampDistance < normal.rampDistance);

  assert.ok(easy.maxHp > normal.maxHp);
  assert.equal(hard.maxHp, normal.maxHp);

  assert.ok(easy.goalKills < normal.goalKills);
  assert.ok(hard.goalKills > normal.goalKills);
});

test('later stages spawn faster and run faster', () => {
  const early = resolveStageRules(0, 1, 'normal');
  const late = resolveStageRules(0, 10, 'normal');

  assert.ok(late.spawnIntervalMs < early.spawnIntervalMs);
  assert.ok(late.maxSpeed > early.maxSpeed);
  assert.ok(late.goalKills > early.goalKills);
});

test('the spawn floor stays a floor at every stage and difficulty', () => {
  for (const difficulty of DIFFICULTIES) {
    for (let stageNumber = 1; stageNumber <= 10; stageNumber += 1) {
      const rules = resolveStageRules(3, stageNumber, difficulty);
      assert.ok(
        rules.minSpawnIntervalMs <= rules.spawnIntervalMs,
        `floor above interval at ${difficulty} stage ${stageNumber}`,
      );
    }
  }
});

test('the ramp never inverts: top speed stays at or above walking pace', () => {
  for (const difficulty of DIFFICULTIES) {
    const rules = resolveStageRules(0, 1, difficulty);
    assert.ok(rules.maxSpeed >= rules.walkSpeed, `${difficulty} tops out below walking pace`);
  }
});

test('every stage is beatable in principle: the goal is at least one kill', () => {
  for (const difficulty of DIFFICULTIES) {
    for (let biome = 0; biome < 4; biome += 1) {
      for (let stageNumber = 1; stageNumber <= 10; stageNumber += 1) {
        assert.ok(stageGoalKills(biome, stageNumber, difficulty) >= 1);
      }
    }
  }
});

test('nonsense stage and biome numbers are clamped rather than trusted', () => {
  assert.equal(stageGoalKills(-5, -5), stageGoalKills(0, 1));
  assert.ok(Number.isFinite(resolveStageRules(-1, 0, 'normal').goalKills));
});

test('an unrecognised difficulty falls back to normal', () => {
  const preset = difficultyPreset('impossible' as never);
  assert.deepEqual(preset, difficultyPreset(DEFAULT_DIFFICULTY));
});

test('isDifficulty guards untrusted input, such as a stale stored preference', () => {
  assert.equal(isDifficulty('hard'), true);
  assert.equal(isDifficulty('HARD'), false);
  assert.equal(isDifficulty(undefined), false);
  assert.equal(isDifficulty(2), false);
});

test('every difficulty has a Thai label for the picker', () => {
  for (const difficulty of DIFFICULTIES) {
    assert.ok(difficultyLabel(difficulty).length > 0);
  }
});
