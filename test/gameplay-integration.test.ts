import { expect, test } from 'vitest';
import { createGameState, updateGame } from '@/engine/core/state';
import { CONFIG } from '@/engine/config';
import { createInput } from '@/engine/core/input';

const idle = { lane: 1, isFiring: false };

test('a tank survives a projectile and reports a hit instead of a kill', () => {
  const state = { ...createGameState(3),
    enemies: [{ id: 1, kind: 'tank' as const, hp: 5, lane: 1, z: -10, previousZ: -10 }],
    bullets: [{ lane: 1, z: -9, previousZ: -9 }],
  };
  const next = updateGame(state, idle, 50);
  expect(next.enemies).toHaveLength(1);
  expect(next.enemies[0].hp).toBe(4);
  expect(next.killCount).toBe(0);
  expect(next.bullets).toHaveLength(0);
  expect(next.justImpacts).toHaveLength(1);
});

test('jump clears a road root while grounded contact costs one health', () => {
  const state = { ...createGameState(3),
    obstacles: [{ id: 7, side: -1 as const, z: -1, previousZ: -1 }],
  };
  const grounded = updateGame(state, idle, 50);
  expect(grounded.hp).toBe(2);
  const airborne = updateGame({ ...state, jumpStartedMs: -200 }, idle, 50);
  expect(airborne.hp).toBe(3);
  expect(airborne.jumpHeight).toBeGreaterThan(0.8);
});

test('roots do not damage or stop enemies', () => {
  const state = { ...createGameState(3),
    enemies: [{ id: 1, kind: 'tank' as const, hp: 5, lane: 0, z: -10, previousZ: -10 }],
    obstacles: [{ id: 2, side: 1 as const, z: -10, previousZ: -10 }],
  };
  const next = updateGame(state, idle, 50);
  expect(next.enemies[0].hp).toBe(5);
  expect(next.enemies[0].z).toBeGreaterThan(-10);
});

test('a held jump signal cannot retrigger after landing', () => {
  let state = createGameState(3);
  for (let i = 0; i < 30; i++) state = updateGame(state, { ...idle, jump: true }, 50);
  expect(state.jumpStartedMs).toBeNull();
  expect(state.jumpCount).toBe(1);
  state = updateGame(state, idle, 50);
  state = updateGame(state, { ...idle, jump: true }, 50);
  expect(state.jumpCount).toBe(2);
});

test('stage completion requires defeating its boss', () => {
  const config = { ...CONFIG.game, goalKills: 3, requireBoss: true };
  const state = { ...createGameState(3, config), killCount: 3 };
  const next = updateGame(state, idle, 50, config);
  expect(next.isCleared).toBe(false);
  expect(next.enemies.some(e => e.kind === 'boss')).toBe(true);
});

test('keyboard jump is consumed once and tracking loss clears pending jumps', () => {
  const input = createInput();
  input.requestJump();
  expect(input.read().jump).toBe(true);
  expect(input.read().jump).toBeUndefined();
  input.requestJump(); input.clearPose();
  expect(input.read().jump).toBeUndefined();
});

test('boss attack warns a lane before damage, and moving aside avoids it', () => {
  const state = { ...createGameState(3), bossSpawned: true,
    enemies: [{ id: 99, kind: 'boss' as const, hp: 28, lane: 1, z: -20, previousZ: -20 }],
  };
  const warning = updateGame(state, idle, 50);
  expect(warning.bossWarningLane).toBe(1);
  expect(warning.hp).toBe(3);
  const due = { ...warning, elapsedMs: warning.bossAttackAtMs! };
  expect(updateGame(due, idle, 50).hp).toBe(2);
  expect(updateGame(due, { ...idle, lane: 0 }, 50).hp).toBe(3);
});

test('killing the boss clears a completed stage and reports the correct corpse type', () => {
  const config = { ...CONFIG.game, goalKills: 3, requireBoss: true };
  const state = { ...createGameState(3, config), killCount: 2, bossSpawned: true,
    enemies: [{ id: 99, kind: 'boss' as const, hp: 1, lane: 1, z: -20, previousZ: -20 }],
    bullets: [{ lane: 1, z: -19, previousZ: -19 }],
  };
  const next = updateGame(state, idle, 50, config);
  expect(next.isCleared).toBe(true);
  expect(next.bossDefeated).toBe(true);
  expect(next.justKilled[0].kind).toBe('boss');
});

test('normal, weak and tank enemies retain different approach speeds', () => {
  const state = { ...createGameState(3), speed: 11,
    enemies: (['weak', 'normal', 'tank'] as const).map((kind, i) => ({ id: i, kind, hp: 6, lane: i, z: -20, previousZ: -20 })),
  };
  const next = updateGame(state, idle, 50);
  expect(next.enemies[0].z).toBeGreaterThan(next.enemies[1].z);
  expect(next.enemies[1].z).toBeGreaterThan(next.enemies[2].z);
});
