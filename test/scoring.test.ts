/** Score rules: the pure formula in core/scoring.ts, and how the reducer feeds it. */

import { expect, test } from 'vitest';

import { CONFIG } from '@/engine/config';
import { activeMultiplier, chainKills, comboMultiplier, distancePoints, killPoints, stepPoints } from '@/engine/core/scoring';
import type { ComboChain, StepPoints } from '@/engine/core/scoring';
import { createGameState, restartGame, updateGame } from '@/engine/core/state';
import type { GameState, KillMark, TrailHazard } from '@/engine/types';

const GAME = CONFIG.game;
const { scoring } = GAME;
const FRESH: ComboChain = { combo: 0, lastKillMs: -Infinity };
const NOTHING: StepPoints = { fromDistance: 0, toDistance: 0, hazardsCleared: 0, justCleared: false, collected: 0 };
const kill = (kind?: KillMark['kind']): KillMark => ({ lane: 1, z: -10, ...(kind ? { kind } : {}) });

test('each enemy kind is worth its configured points, and an untyped enemy scores as normal', () => {
  expect(killPoints(kill('weak'), 1, GAME)).toBe(scoring.kill.weak);
  expect(killPoints(kill('tank'), 1, GAME)).toBe(scoring.kill.tank);
  expect(killPoints(kill('boss'), 2, GAME)).toBe(scoring.kill.boss * 2);
  expect(killPoints(kill(), 1, GAME)).toBe(scoring.kill.normal);
});

test('the combo multiplier steps up every comboStep kills and stops at the cap', () => {
  expect(comboMultiplier(1, GAME)).toBe(1);
  expect(comboMultiplier(scoring.comboStep, GAME)).toBe(1);
  expect(comboMultiplier(scoring.comboStep + 1, GAME)).toBe(1 + scoring.multiplierStep);
  expect(comboMultiplier(1000, GAME)).toBe(scoring.maxMultiplier);
});

test('distance pays only for whole metres, so frame slicing never changes the total', () => {
  expect(distancePoints(0, 0.9, GAME)).toBe(0);
  expect(distancePoints(0.9, 1.1, GAME)).toBe(scoring.perMetre);

  let sliced = 0;
  for (let metres = 0; metres < 100; metres += 0.37) sliced += distancePoints(metres, Math.min(100, metres + 0.37), GAME);
  expect(sliced).toBe(distancePoints(0, 100, GAME));
});

test('kills inside the window build a chain that raises later kills', () => {
  let chain = FRESH;
  const values: number[] = [];
  for (let index = 0; index <= scoring.comboStep; index += 1) {
    const result = chainKills(chain, [kill('weak')], false, index * 100, GAME);
    chain = result.chain;
    values.push(...result.values);
  }

  expect(chain.combo).toBe(scoring.comboStep + 1);
  expect(values.at(-1)).toBe(scoring.kill.weak * (1 + scoring.multiplierStep));
  expect(values.slice(0, -1).every((value) => value === scoring.kill.weak)).toBe(true);
});

test('a lapsed chain starts over at x1', () => {
  const late = chainKills({ combo: 20, lastKillMs: 0 }, [kill('weak')], false, scoring.comboWindowMs + 1, GAME);

  expect(late.chain.combo).toBe(1);
  expect(late.values).toEqual([scoring.kill.weak]);
});

test('taking damage breaks the chain after the step\'s own kills are valued', () => {
  const hit = chainKills({ combo: 20, lastKillMs: 0 }, [kill('weak')], true, 100, GAME);

  expect(hit.values).toEqual([scoring.kill.weak * scoring.maxMultiplier]);
  expect(hit.chain.combo).toBe(0);
});

test('a step adds distance, hazard, goal and collected-orb points', () => {
  expect(stepPoints({ ...NOTHING, hazardsCleared: 2, justCleared: true, collected: 75 }, GAME))
    .toBe(2 * scoring.hazardCleared + scoring.stageCleared + 75);
  expect(stepPoints(NOTHING, GAME)).toBe(0);
});

test('the HUD multiplier previews the next kill and falls back to 1 once the window closes', () => {
  const chain = { combo: scoring.comboStep, lastKillMs: 1000 };
  expect(activeMultiplier(chain, 1000, GAME)).toBe(1 + scoring.multiplierStep);
  expect(activeMultiplier(chain, 1000 + scoring.comboWindowMs + 1, GAME)).toBe(1);
  expect(activeMultiplier(FRESH, 0, GAME)).toBe(1);
});

/* ------------------------------------------------------------ reducer ---- */

function stepUntilHazardsSettle(state: GameState, lane: number): GameState {
  let current = state;
  for (let index = 0; index < 40 && current.obstacles.some(o => o.status !== 'cleared'); index += 1) {
    current = updateGame(current, { lane, isFiring: false }, 50);
  }
  return current;
}

test('the reducer pays the hazard bonus for a safe crossing but not for a hit', () => {
  const log: TrailHazard = { id: 70, kind: 'log', startLane: 0, laneCount: 2, z: -1, previousZ: -1, status: 'approaching' };
  const start = { ...createGameState(3), speed: 11, obstacles: [log] };

  const dodged = stepUntilHazardsSettle(start, 2);
  const struck = stepUntilHazardsSettle(start, 0);

  expect(dodged.hp).toBe(GAME.maxHp);
  expect(struck.hp).toBe(GAME.maxHp - 1);
  expect(dodged.score - struck.score).toBe(scoring.hazardCleared);
});

test('the reducer pays for distance walked', () => {
  let state = createGameState(1, { ...GAME, spawnIntervalMs: 1e9, obstacle: { ...GAME.obstacle, firstMs: 1e9 } });
  for (let index = 0; index < 120; index += 1) state = updateGame(state, { lane: 1, isFiring: false }, 1000 / 60);

  expect(state.distance).toBeGreaterThan(1);
  expect(state.score).toBe(Math.floor(state.distance) * scoring.perMetre);
});

test('a restart clears the chain and the orbs along with the score', () => {
  const played = {
    ...createGameState(1), score: 9000, combo: 12, lastKillMs: 400,
    orbs: [{ id: 5, lane: 1, z: -20, previousZ: -20, value: 50 }],
  };
  const fresh = restartGame(played);
  expect([fresh.score, fresh.combo, fresh.lastKillMs, fresh.orbs]).toEqual([0, 0, -Infinity, []]);
});
