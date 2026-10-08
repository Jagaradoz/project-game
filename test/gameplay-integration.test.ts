import { expect, test } from 'vitest';
import { createGameState, restartGame, updateGame } from '@/engine/core/state';
import { CONFIG } from '@/engine/config';
import { createInput } from '@/engine/core/input';
import type { GameState } from '@/engine/types';

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
  expect(next.comboHits).toBe(1);
});

test('hit counter counts all landed shots, persists between hits and resets for a new run', () => {
  const state = { ...createGameState(3), comboHits: 4, lastEnemyHitMs: 0,
    enemies: [
      { id: 1, kind: 'tank' as const, hp: 5, lane: 0, z: -10, previousZ: -10 },
      { id: 2, kind: 'weak' as const, hp: 1, lane: 1, z: -10, previousZ: -10 },
    ],
    bullets: [0, 1, 2].map(lane => ({ lane, z: -9, previousZ: -9 })),
  };
  const hit = updateGame(state, idle, 50);
  expect(hit.comboHits).toBe(6);
  expect(hit.killCount).toBe(1);
  expect(hit.bullets).toHaveLength(1);
  const next = updateGame(hit, idle, 50);
  expect(next.justImpacts).toHaveLength(0);
  expect(next.comboHits).toBe(6);
  expect(restartGame(next).comboHits).toBe(0);
});

test('hit counter retains a live chain after damage and the final kill', () => {
  const state = { ...createGameState(3), comboHits: 19, lastEnemyHitMs: 0,
    enemies: [{ id: 1, kind: 'weak' as const, hp: 1, lane: 1, z: -10, previousZ: -10 }],
    bullets: [{ lane: 1, z: -9, previousZ: -9 }],
  };
  const cleared = updateGame(state, idle, 50, { ...CONFIG.game, goalKills: 1 });
  expect(cleared.isOver).toBe(true);
  expect(cleared.comboHits).toBe(20);
  expect(updateGame(cleared, idle, 50).comboHits).toBe(20);
  const damaged = updateGame({ ...createGameState(), comboHits: 20, lastEnemyHitMs: 0,
    enemies: [{ lane: 1, z: 0, previousZ: 0 }],
  }, idle, 50);
  expect(damaged.hp).toBeLessThan(CONFIG.game.maxHp);
  expect(damaged.comboHits).toBe(20);
});

test('hit combo expires at five seconds without a hit, and a hit on expiry starts a new chain', () => {
  const state = { ...createGameState(), comboHits: 9, lastEnemyHitMs: 0,
    elapsedMs: CONFIG.game.hitCombo.timeoutMs - 50,
    nextSpawnMs: Infinity, nextObstacleMs: Infinity, nextSporeMs: Infinity,
  };
  expect(updateGame(state, idle, 49).comboHits).toBe(9);
  expect(updateGame(state, idle, 50).comboHits).toBe(0);
  const hit = updateGame({ ...state,
    enemies: [{ kind: 'tank' as const, hp: 5, lane: 1, z: -10, previousZ: -10 }],
    bullets: [{ lane: 1, z: -9, previousZ: -9 }],
  }, idle, 50);
  expect(hit.comboHits).toBe(1);
  expect(hit.lastEnemyHitMs).toBe(CONFIG.game.hitCombo.timeoutMs);
});

test('every successful hit refreshes the combo timeout; missed shots do not', () => {
  const state = { ...createGameState(), comboHits: 4, lastEnemyHitMs: 0, elapsedMs: 4900,
    nextSpawnMs: Infinity, nextObstacleMs: Infinity, nextSporeMs: Infinity,
    enemies: [{ kind: 'tank' as const, hp: 5, lane: 1, z: -10, previousZ: -10 }],
    bullets: [{ lane: 1, z: -9, previousZ: -9 }],
  };
  const hit = updateGame(state, idle, 50);
  expect(hit.comboHits).toBe(5);
  expect(hit.lastEnemyHitMs).toBe(4950);
  const miss = updateGame({ ...hit, enemies: [], bullets: [{ lane: 0, z: -9, previousZ: -9 }] }, idle, 50);
  expect(miss.lastEnemyHitMs).toBe(4950);
  expect(miss.comboHits).toBe(5);
  expect(updateGame({ ...miss, elapsedMs: 9900 }, idle, 50).comboHits).toBe(0);
});

test('jump clears a road log while grounded contact costs one health', () => {
  const state = { ...createGameState(3),
    obstacles: [{ id: 7, kind: 'log' as const, startLane: 0 as const, laneCount: 3 as const, status: 'approaching' as const, z: -1, previousZ: -1 }],
  };
  let grounded: GameState = state;
  for (let i = 0; i < 12; i++) grounded = updateGame(grounded, idle, 50);
  expect(grounded.hp).toBe(2);
  let airborne = updateGame({ ...state, jumpStartedMs: -200 }, idle, 50);
  expect(airborne.jumpHeight).toBeGreaterThan(0.8);
  for (let i = 0; i < 11; i++) airborne = updateGame(airborne, idle, 50);
  expect(airborne.hp).toBe(3);
});

test('hazards do not damage or stop enemies outside their crossing window', () => {
  const state = { ...createGameState(3),
    enemies: [{ id: 1, kind: 'tank' as const, hp: 5, lane: 0, z: -10, previousZ: -10 }],
    obstacles: [{ id: 2, kind: 'stones' as const, startLane: 0 as const, laneCount: 3 as const, status: 'approaching' as const, z: -40, previousZ: -40 }],
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

test('the boss walks into the player like any enemy: contact costs one HP and uses it up', () => {
  const boss = { id: 99, kind: 'boss' as const, hp: 10, lane: 1, z: -3, previousZ: -3 };
  const state = { ...createGameState(3), speed: 11, bossSpawned: true, enemies: [boss] };
  const hit = updateGame(state, idle, 50);
  expect(hit.hp).toBe(2);
  expect(hit.enemies.some(e => e.kind === 'boss')).toBe(false);
});

test('the boss spans all three lanes: no lane dodges it, and every lane can shoot it', () => {
  const boss = { id: 99, kind: 'boss' as const, hp: 10, lane: 1, z: -3, previousZ: -3 };
  const state = { ...createGameState(3), speed: 11, bossSpawned: true, enemies: [boss] };
  for (const lane of [0, 2]) expect(updateGame(state, { ...idle, lane }, 50).hp).toBe(2);

  const far = { ...boss, z: -20, previousZ: -20 };
  for (const lane of [0, 2]) {
    const shot = updateGame({ ...state, enemies: [far], bullets: [{ lane, z: -19, previousZ: -19 }] }, { ...idle, lane }, 16);
    expect(shot.enemies.find(e => e.kind === 'boss')!.hp).toBe(9);
    expect(shot.justImpacts[0]!.lane).toBe(lane);
  }
});

test('enemies already on the trail stay when the boss arrives, and new ones wait', () => {
  const walking = { id: 7, kind: 'weak' as const, hp: 1, lane: 0, z: -60, previousZ: -60 };
  const boss = { id: 99, kind: 'boss' as const, hp: 10, lane: 1, z: -70, previousZ: -70 };
  const state = { ...createGameState(3), speed: 11, bossSpawned: true, enemies: [walking, boss], nextSpawnMs: 0 };
  const next = updateGame(state, { ...idle, lane: 2 }, 16);
  expect(next.enemies.map(e => e.id).sort()).toEqual([7, 99]);
});

test('the boss never holds still: it keeps walking towards the player', () => {
  let state: GameState = { ...createGameState(3), speed: 11, bossSpawned: true,
    enemies: [{ id: 99, kind: 'boss' as const, hp: 10, lane: 1, z: -40, previousZ: -40 }] };
  for (let i = 0; i < 20; i++) state = updateGame(state, { ...idle, lane: 0 }, 50);
  expect(state.enemies[0].z).toBeGreaterThan(-30);
});

test('an endless run meets a new boss every triggerKills kills', () => {
  const trigger = CONFIG.game.boss.triggerKills;
  const due = { ...createGameState(3), killCount: trigger, nextSpawnMs: Infinity, nextObstacleMs: Infinity, nextSporeMs: Infinity };
  const first = updateGame(due, idle, 50);
  expect(first.enemies.filter(e => e.kind === 'boss')).toHaveLength(1);
  expect(first.nextBossKills).toBe(trigger * 2);
  const gone = { ...first, enemies: [], killCount: trigger * 2 };
  expect(updateGame(gone, idle, 50).enemies.filter(e => e.kind === 'boss')).toHaveLength(1);
  expect(updateGame({ ...first, enemies: [], killCount: trigger * 2 - 1 }, idle, 50).enemies).toHaveLength(0);
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
