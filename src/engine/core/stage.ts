/**
 * Stage rules: what makes one stage harder than the last.
 *
 * Pure and headless, like the rest of src/engine/core. It derives a NEW game
 * config from CONFIG.game and never mutates it -- the base config is shared by
 * every stage in the session, and one in-place edit would silently retune every
 * run that follows.
 *
 * TOR 3 asks for three things this file provides: 10 stages per biome cleared in
 * order, difficulty that rises with progression, and a difficulty the player
 * picks up front (ผู้เล่นสามารถเลือกระดับความยากเริ่มต้นได้).
 */

import { CONFIG } from '@/engine/config';
import type {
  AppConfig,
  Difficulty,
  DifficultyPreset,
  StageConfig,
  StageRules,
} from '@/engine/types';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && DIFFICULTIES.includes(value as Difficulty);
}

export function difficultyPreset(
  difficulty: Difficulty,
  config: StageConfig = CONFIG.stage,
): DifficultyPreset {
  return config.difficulty[difficulty] ?? config.difficulty[DEFAULT_DIFFICULTY];
}

export function difficultyLabel(difficulty: Difficulty): string {
  return difficultyPreset(difficulty).label;
}

/**
 * How many enemies clear this stage.
 *
 * Split out from resolveStageRules so /stages can show the goal without
 * building a whole config to read one number off it.
 *
 * @param biomeIndex Position in the unlock order; 0 for the first biome.
 * @param stageNumber 1-based within the biome.
 */
export function stageGoalKills(
  biomeIndex: number,
  stageNumber: number,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  config: StageConfig = CONFIG.stage,
): number {
  const stageStep = Math.max(0, stageNumber - 1);
  const biomeStep = Math.max(0, biomeIndex);

  const base =
    config.baseGoalKills +
    stageStep * config.goalKillsPerStage +
    biomeStep * config.goalKillsPerBiome;

  // Never below 1: a stage that is already cleared before it starts is not a stage.
  return Math.max(1, Math.round(base * difficultyPreset(difficulty, config).goalKillsScale));
}

/**
 * The full config one stage runs under. Pass the result straight to
 * `updateGame` -- it is a GameConfig with the stage's goal attached.
 */
export function resolveStageRules(
  biomeIndex: number,
  stageNumber: number,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  config: AppConfig = CONFIG,
): StageRules {
  const preset = difficultyPreset(difficulty, config.stage);
  const stageStep = Math.max(0, stageNumber - 1);
  const game = config.game;

  const spawnScale = preset.spawnIntervalScale * config.stage.spawnIntervalPerStage ** stageStep;
  const speedScale = preset.maxSpeedScale * config.stage.maxSpeedPerStage ** stageStep;

  const spawnIntervalMs = game.spawnIntervalMs * spawnScale;
  const minSpawnIntervalMs = game.minSpawnIntervalMs * spawnScale;

  return {
    ...game,
    requireBoss: true,
    spawnIntervalMs,
    // The floor must stay a floor. Scaling both by the same factor keeps that
    // true; scaling only one could invert them and make the ramp go backwards.
    minSpawnIntervalMs: Math.min(spawnIntervalMs, minSpawnIntervalMs),
    maxSpeed: Math.max(game.walkSpeed, game.maxSpeed * speedScale),
    rampDistance: Math.max(1, game.rampDistance * preset.rampDistanceScale),
    maxHp: Math.max(1, game.maxHp + preset.maxHpBonus),
    goalKills: stageGoalKills(biomeIndex, stageNumber, difficulty, config.stage),
  };
}
