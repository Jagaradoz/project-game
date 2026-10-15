/**
 * Training rules: the config the one Training run steps under.
 *
 * The 20-minute milestone does not end play. A run ends on health loss or an
 * explicit finish. Pure and headless, like the rest of
 * src/engine/core, and it returns a NEW object: CONFIG.game is shared by every
 * run in the session, and one in-place edit would retune them all.
 */

import { CONFIG } from '@/engine/config';
import type { AppConfig, RunConfig } from '@/engine/types';

/** Training is a single stage. Runs still report it, for the API contract. */
export const TRAINING_STAGE_NUMBER = 1;

export function resolveTrainingRules(config: AppConfig = CONFIG): RunConfig {
  return { ...config.game };
}
