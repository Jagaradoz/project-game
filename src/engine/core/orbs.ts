/**
 * Score orbs, as reducer state.
 *
 * A kill's points are not banked when the enemy dies: they drop as orbs on the
 * trail where it fell, and the ground carries them towards the player like
 * everything else. Once an orb comes within the magnet's reach it is pulled in
 * from whichever lane it lies in -- no contact needed.
 *
 * Collection is decided here, not by the renderer, so the score stays a pure
 * function of the input stream -- reproducible in tests and re-derivable by a
 * server. The view only animates what this module decided.
 */

import type { KillMark, RunConfig, ScoreOrb } from '@/engine/types';

/** Splits `value` into `count` whole parts that sum to it exactly. */
export function splitValue(value: number, count: number): number[] {
  const base = Math.floor(value / count);
  const remainder = value - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Drops each kill's orbs, strung out along the kill's lane. A full field banks
 * the points directly instead -- a crowded screen must never cost the player.
 */
export function dropOrbs(
  orbs: ScoreOrb[],
  kills: KillMark[],
  values: number[],
  nextId: number,
  config: RunConfig,
): { orbs: ScoreOrb[]; nextId: number; banked: number } {
  const { perKill, maxOrbs, spacing } = config.scoreOrbs;
  const dropped = [...orbs];
  let id = nextId;
  let banked = 0;

  kills.forEach((kill, killIndex) => {
    const value = values[killIndex] ?? 0;
    const count = Math.min(perKill[kill.kind ?? 'normal'], maxOrbs - dropped.length);
    if (count <= 0) {
      banked += value;
      return;
    }
    splitValue(value, count).forEach((part, index) => {
      const z = kill.z + (index - (count - 1) / 2) * spacing;
      dropped.push({ id: id++, lane: kill.lane, z, previousZ: z, value: part });
    });
  });

  return { orbs: dropped, nextId: id, banked };
}

/**
 * Moves orbs with the ground and lets the magnet take the ones within reach,
 * in every lane. Swept, so a long frame cannot carry an orb past unseen.
 */
export function advanceOrbs(
  orbs: ScoreOrb[],
  deltaZ: number,
  config: RunConfig,
): { orbs: ScoreOrb[]; collected: number; collectedIds: number[] } {
  const reachStart = config.playerZ - config.scoreOrbs.magnetReach;
  const reachEnd = config.playerZ + config.playerRadius;
  const kept: ScoreOrb[] = [];
  const collectedIds: number[] = [];
  let collected = 0;

  for (const orb of orbs) {
    const moved = { ...orb, previousZ: orb.z, z: orb.z + deltaZ };
    const isInReach = moved.z >= reachStart && moved.previousZ <= reachEnd;
    if (isInReach) {
      collected += moved.value;
      collectedIds.push(moved.id);
    } else if (moved.z <= config.despawnZ) {
      kept.push(moved);
    }
  }

  return { orbs: kept, collected, collectedIds };
}

/** Clearing the goal sweeps up whatever is still on the trail. */
export function collectAll(orbs: ScoreOrb[]): { collected: number; collectedIds: number[] } {
  return {
    collected: orbs.reduce((total, orb) => total + orb.value, 0),
    collectedIds: orbs.map((orb) => orb.id),
  };
}
