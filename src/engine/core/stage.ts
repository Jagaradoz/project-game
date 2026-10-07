/**
 * Training rules: the config the one Training run steps under.
 *
 * Pure and headless, like the rest of src/engine/core. It derives a NEW game
 * config from CONFIG.game and never mutates it -- the base config is shared by
 * every run in the session, and one in-place edit would silently retune every
 * run that follows.
 */

import { CONFIG } from '@/engine/config';
import type { AppConfig, StageRules } from '@/engine/types';

/** Training is a single stage. Runs still report it, for the API contract. */
export const TRAINING_STAGE_NUMBER = 1;

/**
 * The full config a Training run runs under. Pass the result straight to
 * `updateGame` -- it is a GameConfig with the goal attached.
 */
export function resolveTrainingRules(config: AppConfig = CONFIG): StageRules {
  return {
    ...config.game,
    requireBoss: true,
    // Never below 1: a run that is already cleared before it starts is not a run.
    goalKills: Math.max(1, Math.round(config.training.goalKills)),
  };
}
