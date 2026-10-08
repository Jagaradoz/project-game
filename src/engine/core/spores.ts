/**
 * Poison spore clouds: long zones across every lane that neither a lane change
 * nor a jump gets the player out of. Only the shield (hands on hips) does.
 *
 * Kept apart from the trail hazards on purpose. A hazard is a point with a
 * contact reach that is charged once; a cloud has length, and it keeps costing
 * HP on a cooldown for as long as the player stands in it unshielded.
 *
 * Pure functions only, like the rest of core/.
 */

import type { GameState, RunConfig, SporeCloud } from '@/engine/types';

/** Scrolls clouds towards the player and retires those fully behind despawnZ. */
export function advanceSpores(clouds: SporeCloud[], deltaZ: number, config: RunConfig): SporeCloud[] {
  return clouds
    .map((cloud) => {
      const z = cloud.z + deltaZ;
      const status: SporeCloud['status'] = z - cloud.length > config.playerZ + config.playerRadius
        ? 'cleared'
        : z >= config.playerZ - config.playerRadius ? 'inside' : 'approaching';
      return { ...cloud, z, status };
    })
    .filter((cloud) => cloud.z - cloud.length <= config.despawnZ);
}

export function isInsideSpore(clouds: SporeCloud[]): boolean {
  return clouds.some((cloud) => cloud.status === 'inside');
}

/** A cloud the player has not yet come out the far side of. */
export function hasPendingSpore(clouds: SporeCloud[]): boolean {
  return clouds.some((cloud) => cloud.status !== 'cleared');
}

/**
 * One HP per `tickMs` while inside and unshielded. Its own cooldown rather than
 * the enemy-hit grace window, so a cloud keeps draining for its whole length.
 * Entering grants `entryGraceMs`, the moment it takes to settle into the pose.
 */
export function sporeDamage(
  state: Pick<GameState, 'isInSpore' | 'nextSporeTickMs'>,
  isInside: boolean,
  isShielding: boolean,
  elapsedMs: number,
  config: RunConfig,
): { damage: number; nextTickMs: number } {
  if (!isInside) return { damage: 0, nextTickMs: state.nextSporeTickMs };
  const nextTickMs = state.isInSpore
    ? state.nextSporeTickMs
    : Math.max(state.nextSporeTickMs, elapsedMs + config.spore.entryGraceMs);
  if (isShielding || elapsedMs < nextTickMs) return { damage: 0, nextTickMs };
  return { damage: 1, nextTickMs: elapsedMs + config.spore.tickMs };
}

/**
 * Points for braving a cloud behind the shield: one every `shieldPointMs` held
 * inside it. Letting the shield drop or leaving the cloud restarts the count,
 * so the first point always takes a full interval of holding.
 */
export function shieldPoints(
  state: Pick<GameState, 'nextShieldPointMs'>,
  isInside: boolean,
  isShielding: boolean,
  elapsedMs: number,
  config: RunConfig,
): { points: number; nextPointMs: number } {
  const interval = config.spore.shieldPointMs;
  if (!isInside || !isShielding) return { points: 0, nextPointMs: elapsedMs + interval };
  if (elapsedMs < state.nextShieldPointMs) return { points: 0, nextPointMs: state.nextShieldPointMs };
  return { points: 1, nextPointMs: elapsedMs + interval };
}

/**
 * Whether a new cloud may start this frame. Not during the boss fight, and not
 * on top of a trail hazard still near the spawn line -- the player cannot jump
 * while holding the shield pose, so the two must never overlap.
 */
export function canSpawnSpore(
  state: Pick<GameState, 'spores' | 'nextSporeMs'>,
  obstacles: GameState['obstacles'],
  elapsedMs: number,
  isBossPhase: boolean,
  config: RunConfig,
): boolean {
  if (isBossPhase || elapsedMs < state.nextSporeMs || state.spores.length > 0) return false;
  return obstacles.every((o) => o.status === 'cleared' || o.z > config.spawnZ + config.spore.spawnClearance);
}

export function createSporeCloud(id: number, config: RunConfig): SporeCloud {
  return { id, z: config.spawnZ, length: config.spore.length, status: 'approaching' };
}
