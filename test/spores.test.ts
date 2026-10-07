import { expect, test, vi } from 'vitest';
import { CONFIG } from '@/engine/config';
import { createGameState, updateGame } from '@/engine/core/state';
import { advanceSpores, canSpawnSpore, sporeDamage } from '@/engine/core/spores';
import { createInput } from '@/engine/core/input';
import { LATERAL } from '@/engine/detectors/lateral';
import type { GameInput, GameState, SporeCloud, TrailHazard } from '@/engine/types';

const STEP = 50;
const idle: GameInput = { lane: 1, isFiring: false };
const SPORE = CONFIG.game.spore;

/** A cloud whose front edge has just reached the player. */
function cloud(z = 0.5, length = SPORE.length): SporeCloud {
  return { id: 90, z, length, status: 'approaching' };
}

/** Clouds only, no enemies or hazards on the way, speed already at walk pace. */
function inCloud(overrides: Partial<GameState> = {}): GameState {
  return {
    ...createGameState(5), speed: CONFIG.game.walkSpeed, spores: [cloud()],
    nextSpawnMs: Infinity, nextObstacleMs: Infinity, nextSporeMs: Infinity, ...overrides,
  };
}

function step(state: GameState, input: GameInput, ms: number): GameState {
  let s = state;
  for (let t = 0; t < ms; t += STEP) s = updateGame(s, input, STEP);
  return s;
}

test('standing in a cloud unshielded costs 1 HP every tickMs after the entry grace', () => {
  let s = step(inCloud(), idle, SPORE.entryGraceMs - STEP);
  expect(s.isInSpore).toBe(true);
  expect(s.hp).toBe(3);
  s = step(s, idle, STEP * 2);
  expect(s.hp).toBe(2);
  expect(s.justHit || s.hitAtMs > 0).toBe(true);
  s = step(s, idle, SPORE.tickMs);
  expect(s.hp).toBe(1);
});

test('the shield blocks every tick for the whole cloud', () => {
  const s = step(inCloud(), { ...idle, isShielding: true }, 4000);
  expect(s.hp).toBe(3);
  expect(s.isShielding).toBe(true);
});

test('neither changing lane nor jumping escapes the cloud', () => {
  const lanes = step(inCloud(), { ...idle, lane: 0 }, SPORE.entryGraceMs + STEP);
  expect(lanes.hp).toBe(2);
  const jumped = step(inCloud(), { ...idle, jump: true }, SPORE.entryGraceMs + STEP);
  expect(jumped.hp).toBe(2);
});

test('leaving the cloud stops the ticks', () => {
  const short = inCloud({ spores: [cloud(0.5, 5)] });
  const s = step(short, idle, 5000);
  expect(s.isInSpore).toBe(false);
  expect(s.spores.every((c) => c.status === 'cleared')).toBe(true);
  expect(s.hp).toBe(3);
});

test('the last HP lost to spores ends the run as poisoned', () => {
  const s = step(inCloud({ hp: 1 }), idle, SPORE.entryGraceMs + STEP);
  expect(s.isOver).toBe(true);
  expect(s.deathReason).toBe('poisoned');
});

test('spore ticks ignore the enemy-hit grace window', () => {
  const s = step(inCloud({ invulnUntilMs: 60_000 }), idle, SPORE.entryGraceMs + STEP);
  expect(s.hp).toBe(2);
});

test('the shield stops the gun', () => {
  const s = updateGame(createGameState(1), { ...idle, isFiring: true, isShielding: true }, STEP);
  expect(s.isFiring).toBe(false);
  expect(s.bullets).toHaveLength(0);
});

test('no enemies or trail hazards spawn while a cloud is ahead', () => {
  const start = inCloud({ spores: [cloud(-60)], nextSpawnMs: 0, nextObstacleMs: 0 });
  const s = step(start, { ...idle, isShielding: true }, 2000);
  expect(s.enemies).toHaveLength(0);
  expect(s.obstacles).toHaveLength(0);
});

test('a cloud spawns on schedule and the next one waits intervalMs', () => {
  const start = { ...createGameState(2), nextSporeMs: 0, nextSpawnMs: Infinity, nextObstacleMs: Infinity };
  const s = updateGame(start, idle, STEP);
  expect(s.spores).toHaveLength(1);
  expect(s.spores[0].z).toBeGreaterThanOrEqual(CONFIG.game.spawnZ);
  expect(s.nextSporeMs).toBe(s.elapsedMs + SPORE.intervalMs);
});

test('a cloud never spawns on top of a hazard near the spawn line or during the boss', () => {
  const near: TrailHazard = { id: 1, kind: 'log', startLane: 0, laneCount: 3, z: CONFIG.game.spawnZ + 5, previousZ: 0, status: 'approaching' };
  const ready = { spores: [], nextSporeMs: 0 };
  expect(canSpawnSpore(ready, [near], 10, false, CONFIG.game)).toBe(false);
  expect(canSpawnSpore(ready, [{ ...near, z: 0 }], 10, false, CONFIG.game)).toBe(true);
  expect(canSpawnSpore(ready, [], 10, true, CONFIG.game)).toBe(false);
});

test('advanceSpores classifies and retires clouds by edge', () => {
  const [ahead] = advanceSpores([cloud(-10)], 1, CONFIG.game);
  expect(ahead.status).toBe('approaching');
  const [over] = advanceSpores([cloud(-0.2)], 0.1, CONFIG.game);
  expect(over.status).toBe('inside');
  expect(advanceSpores([cloud(CONFIG.game.despawnZ + 59, 60)], 2, CONFIG.game)).toHaveLength(0);
});

test('sporeDamage outside a cloud keeps the cooldown as is', () => {
  expect(sporeDamage({ isInSpore: false, nextSporeTickMs: 42 }, false, false, 10, CONFIG.game))
    .toEqual({ damage: 0, nextTickMs: 42 });
});

test('input: hands-on-hips pose raises the shield and losing the body drops it', () => {
  const input = createInput();
  input.setPose(LATERAL.CENTER, false, true);
  expect(input.read().isShielding).toBe(true);
  input.clearPose();
  expect(input.read().isShielding).toBe(false);
});

test('input: holding S or Shift shields from the keyboard', () => {
  // Node has no DOM; the handler only needs the class to exist for instanceof.
  vi.stubGlobal('HTMLElement', class {});
  const target = new EventTarget();
  const input = createInput();
  input.attachKeyboard(target);
  const key = (type: string, k: string) => target.dispatchEvent(Object.assign(new Event(type), { key: k }));
  key('keydown', 's');
  expect(input.read().isShielding).toBe(true);
  key('keyup', 's');
  expect(input.read().isShielding).toBe(false);
  key('keydown', 'Shift');
  target.dispatchEvent(new Event('blur'));
  expect(input.read().isShielding).toBe(false);
  input.detach();
  vi.unstubAllGlobals();
});
