/** Score orbs as reducer state: drop, roll, pick up, miss. */

import { expect, test } from 'vitest';

import { CONFIG } from '@/engine/config';
import { advanceOrbs, collectAll, dropOrbs, splitValue } from '@/engine/core/orbs';
import { createGameState, updateGame } from '@/engine/core/state';
import type { GameState, RunConfig, ScoreOrb } from '@/engine/types';

const GAME = CONFIG.game;
const { perKill, magnetReach, maxOrbs, spacing } = GAME.scoreOrbs;
const QUIET: RunConfig = { ...GAME, spawnIntervalMs: 1e9, obstacle: { ...GAME.obstacle, firstMs: 1e9 }, spore: { ...GAME.spore, firstMs: 1e9 } };
const orb = (id: number, lane: number, z: number, value = 10): ScoreOrb => ({ id, lane, z, previousZ: z, value });
/** A normal kill at x1: one orb per point, capped by perKill. */
const NORMAL_ORBS = Math.min(GAME.scoring.kill.normal, perKill.normal);
const total = (orbs: ScoreOrb[]) => orbs.reduce((sum, item) => sum + item.value, 0);

test('a value splits into whole parts that sum to it exactly', () => {
  expect(splitValue(250, 4)).toEqual([63, 63, 62, 62]);
  expect(splitValue(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
  expect(splitValue(7, 1)).toEqual([7]);
});

test('a kill drops its orbs in its own lane, strung out around where it fell', () => {
  const dropped = dropOrbs([], [{ lane: 2, z: -30, kind: 'tank' }], [600], 100, GAME);

  expect(dropped.orbs).toHaveLength(perKill.tank);
  expect(dropped.orbs.every((item) => item.lane === 2)).toBe(true);
  expect(total(dropped.orbs)).toBe(600);
  expect(dropped.nextId).toBe(100 + perKill.tank);
  const zs = dropped.orbs.map((item) => item.z);
  expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo((perKill.tank - 1) * spacing);
  expect(zs.reduce((a, b) => a + b, 0) / zs.length).toBeCloseTo(-30);
});

test('a small kill drops one orb per point', () => {
  const dropped = dropOrbs([], [{ lane: 1, z: -30, kind: 'normal' }], [GAME.scoring.kill.normal], 1, GAME);

  expect(dropped.orbs).toHaveLength(GAME.scoring.kill.normal);
  expect(dropped.orbs.every((item) => item.value === 1)).toBe(true);
});

test('a full field banks a kill\'s points instead of losing them', () => {
  const crowded = Array.from({ length: maxOrbs }, (_, index) => orb(index, 0, -50));
  const dropped = dropOrbs(crowded, [{ lane: 1, z: -20, kind: 'weak' }], [100], 500, GAME);

  expect(dropped.orbs).toHaveLength(maxOrbs);
  expect(dropped.banked).toBe(100);
});

test('the magnet takes orbs within reach in every lane, and leaves the far ones', () => {
  const field = [orb(1, 1, -magnetReach + 0.1), orb(2, 0, -1), orb(3, 2, -2), orb(4, 1, -magnetReach - 5)];
  const result = advanceOrbs(field, 0, GAME);

  expect(result.collectedIds).toEqual([1, 2, 3]);
  expect(result.collected).toBe(30);
  expect(result.orbs.map((item) => item.id)).toEqual([4]);
});

test('an orb is caught even when a long step carries it straight through the reach', () => {
  const result = advanceOrbs([orb(1, 1, -magnetReach - 1)], magnetReach + 3, GAME);
  expect(result.collectedIds).toEqual([1]);
});

test('an orb already behind the player is not claimed, and is gone past despawnZ', () => {
  const behind = advanceOrbs([orb(1, 0, GAME.playerZ + 3)], 0.5, GAME);
  expect(behind.collectedIds).toEqual([]);
  expect(behind.orbs).toHaveLength(1);

  const gone = advanceOrbs([orb(2, 0, GAME.despawnZ - 0.1)], 1, GAME);
  expect(gone.orbs).toHaveLength(0);
  expect(gone.collected).toBe(0);
});

test('clearing the goal sweeps every orb left on the trail', () => {
  const swept = collectAll([orb(1, 0, -40, 30), orb(2, 2, -10, 20)]);
  expect(swept).toEqual({ collected: 50, collectedIds: [1, 2] });
});

/* ------------------------------------------------------------ reducer ---- */

function run(state: GameState, lane: number, frames: number, config: RunConfig = QUIET): { state: GameState; collected: number[] } {
  let current = state;
  const collected: number[] = [];
  for (let index = 0; index < frames && !current.isOver; index += 1) {
    current = updateGame(current, { lane, isFiring: false }, 1000 / 60, config);
    collected.push(...current.justCollected);
  }
  return { state: current, collected };
}

function afterKill(lane: number): GameState {
  const engaged = {
    ...createGameState(1, QUIET),
    speed: GAME.walkSpeed,
    bullets: [{ lane, z: -20, previousZ: -20 }],
    enemies: [{ lane, z: -21, previousZ: -21 }],
  };
  return updateGame(engaged, { lane: 1, isFiring: false }, 1000 / 60, QUIET);
}

test('a kill pays nothing until its orbs reach the magnet', () => {
  const killed = afterKill(1);
  expect(killed.orbs).toHaveLength(NORMAL_ORBS);
  expect(killed.score).toBe(0);

  const { state, collected } = run(killed, 1, 180);
  expect(collected).toHaveLength(NORMAL_ORBS);
  expect(state.orbs).toHaveLength(0);
  expect(state.score).toBe(GAME.scoring.kill.normal);
});

test('the magnet pulls in orbs from another lane without the player moving', () => {
  const killed = afterKill(2);
  const { state, collected } = run(killed, 0, 240);

  expect(collected).toHaveLength(NORMAL_ORBS);
  expect(state.score - killed.score).toBe(GAME.scoring.kill.normal);
});

test('far orbs wait on the trail until they come within reach', () => {
  const killed = afterKill(1);
  const { state, collected } = run(killed, 1, 10);

  expect(collected).toHaveLength(0);
  expect(state.orbs).toHaveLength(NORMAL_ORBS);
});

test('clearing the stage collects the orbs still on the ground', () => {
  const goal: RunConfig = { ...QUIET, goalKills: 1 };
  const engaged = {
    ...createGameState(1, goal),
    bullets: [{ lane: 2, z: -40, previousZ: -40 }],
    enemies: [{ lane: 2, z: -41, previousZ: -41 }],
  };
  const cleared = updateGame(engaged, { lane: 0, isFiring: false }, 1000 / 60, goal);

  expect(cleared.isCleared).toBe(true);
  expect(cleared.orbs).toHaveLength(0);
  expect(cleared.justCollected).toHaveLength(NORMAL_ORBS);
  expect(cleared.score).toBe(GAME.scoring.kill.normal);
});
