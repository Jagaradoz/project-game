import { expect, test } from 'vitest';
import { CONFIG } from '@/engine/config';
import { createGameState, restartGame, updateGame } from '@/engine/core/state';
import { advanceHazards } from '@/engine/core/hazards';
import type { GameState, TrailHazard } from '@/engine/types';

const idle = { lane: 1, isFiring: false };
function hazard(kind: 'log' | 'stones' | 'river', startLane = 0, laneCount = 3, z = -1): TrailHazard {
  return { id: 70, kind, startLane, laneCount, z, previousZ: z, status: 'approaching' } as TrailHazard;
}
function approaching(obstacle: TrailHazard): GameState {
  return { ...createGameState(3), speed: 11, obstacles: [obstacle] };
}

for (const kind of ['log', 'stones'] as const) {
  for (const startLane of [0, 1]) {
    for (const lane of [0, 1, 2]) {
      test(`${kind} two lanes starting ${startLane}: player lane ${lane}`, () => {
        const state = approaching(hazard(kind, startLane, 2));
        const next = updateGame(state, { ...idle, lane }, 50);
        expect(next.hp).toBe(lane >= startLane && lane < startLane + 2 ? 2 : 3);
        const jumping = updateGame({ ...state, jumpStartedMs: -250 }, { ...idle, lane }, 50);
        expect(jumping.hp).toBe(3);
      });
    }
  }
  for (const lane of [0, 1, 2]) {
    test(`${kind} three lanes requires jumping in lane ${lane}`, () => {
      const state = approaching(hazard(kind));
      expect(updateGame(state, { ...idle, lane }, 50).hp).toBe(2);
      expect(updateGame({ ...state, jumpStartedMs: -250 }, { ...idle, lane }, 50).hp).toBe(3);
    });
  }
  test(`${kind} contact is charged once even without a grace window`, () => {
    const config = { ...CONFIG.game, invulnMs: 0 };
    let state = approaching(hazard(kind));
    for (let i = 0; i < 5; i++) state = updateGame(state, idle, 50, config);
    expect(state.hp).toBe(2);
    expect(state.obstacles[0].status).toBe('cleared');
  });
  test(`${kind} landing before exiting its crossing causes damage`, () => {
    const state = { ...approaching(hazard(kind, 0, 3, -.6)), jumpStartedMs: -585 };
    const first = updateGame(state, idle, 50);
    expect(first.hp).toBe(3);
    expect(updateGame(first, idle, 50).hp).toBe(2);
  });
}

for (const lane of [0, 1, 2]) {
  test(`river instantly drowns a grounded player in lane ${lane}, even during grace`, () => {
    const state = { ...approaching(hazard('river')), invulnUntilMs: 5000 };
    const next = updateGame(state, { ...idle, lane }, 50);
    expect(next.hp).toBe(0);
    expect(next.isOver).toBe(true);
    expect(next.isCleared).toBe(false);
    expect(next.deathReason).toBe('drowned');
    const frozen = updateGame(next, { ...idle, jump: true }, 50);
    expect(frozen.distance).toBe(next.distance);
    expect(frozen.elapsedMs).toBe(next.elapsedMs);
  });
}

test('a river jump must stay clear until the whole crossing passes', () => {
  let state: GameState = { ...approaching(hazard('river')), jumpStartedMs: -250 };
  for (let i = 0; i < 6; i++) state = updateGame(state, idle, 50);
  expect(state.hp).toBe(3);
  expect(state.obstacles[0].status).toBe('cleared');
  const early = { ...approaching(hazard('river', 0, 3, -.6)), jumpStartedMs: -585 };
  const first = updateGame(early, idle, 50);
  expect(first.hp).toBe(3);
  expect(updateGame(first, idle, 50).deathReason).toBe('drowned');
  expect(updateGame(approaching(hazard('river')), { ...idle, jump: true }, 50).deathReason).toBe('drowned');
});

test('wider river banks use their own contact bounds without enlarging solid hazards', () => {
  const check = (kind: TrailHazard['kind'], z: number) =>
    advanceHazards([hazard(kind, 0, 3, z)], 1, 0, 0, 50, null, CONFIG.game);
  expect(check('river', -1.9).drowned).toBe(true);
  expect(check('river', 1.9).drowned).toBe(true);
  expect(check("river", -2.5).drowned).toBe(false);
  expect(check('log', -1.6).hit).toBe(false);
  expect(check('stones', -1.6).hit).toBe(false);
});

test('swept crossing catches a missed river even when an entire hazard passes in one step', () => {
  const config = { ...CONFIG.game, walkSpeed: 200, maxSpeed: 200 };
  const next = updateGame({ ...approaching(hazard('river', 0, 3, -3)), speed: 200 }, idle, 50, config);
  expect(next.deathReason).toBe('drowned');
});

test('swept clearance uses the contact interval rather than just the final jump height', () => {
  const config = { ...CONFIG.game, walkSpeed: 200, maxSpeed: 200 };
  const state = { ...approaching(hazard('river', 0, 3, -1.3)), speed: 200, jumpStartedMs: -100 };
  const next = updateGame(state, idle, 50, config);
  expect(next.jumpHeight).toBeGreaterThan(config.jump.clearance);
  expect(next.deathReason).toBe('drowned');
});

test('drowning wins over a simultaneous stage-winning kill', () => {
  const config = { ...CONFIG.game, goalKills: 1 };
  const state = { ...approaching(hazard('river')),
    enemies: [{ id: 1, lane: 1, z: -30, previousZ: -30 }],
    bullets: [{ lane: 1, z: -29, previousZ: -29 }],
  };
  const next = updateGame(state, idle, 50, config);
  expect(next.killCount).toBe(1);
  expect(next.deathReason).toBe('drowned');
  expect(next.isCleared).toBe(false);
});

test('restart clears death state and outstanding hazards', () => {
  const dead = updateGame(approaching(hazard('river')), idle, 50);
  const next = restartGame(dead);
  expect(next.deathReason).toBeNull();
  expect(next.obstacles).toEqual([]);
  expect(next.hp).toBe(3);
});

test('enemy rows cannot arrive within a jump duration of a hazard crossing', () => {
  for (const kind of ['weak', 'normal', 'tank'] as const) {
    const state = { ...approaching(hazard('log', 0, 3, -22)),
      enemies: [
        { id: 1, kind, lane: 0, hp: 6, z: -22, previousZ: -22 },
        { id: 2, kind, lane: 0, hp: 6, z: -70, previousZ: -70 },
      ],
    };
    const next = updateGame(state, idle, 50);
    expect(next.enemies.map(e => e.id)).toEqual([2]);
  }
});

test('boss waits for the last crossing and new hazards pause while the boss is due', () => {
  const state = { ...approaching(hazard('log', 0, 3, -3)), killCount: 12, elapsedMs: 9000 };
  const next = updateGame(state, idle, 50);
  expect(next.bossSpawned).toBe(false);
  expect(next.obstacles).toHaveLength(1);
  const passed = { ...next, obstacles: [hazard('log', 0, 3, 2)] };
  expect(updateGame(passed, idle, 50).bossSpawned).toBe(true);
});

test('seeded spawns include all seven layouts and rivers always span all lanes', () => {
  const layouts = new Set<string>();
  for (let seed = 1; seed < 3000; seed++) {
    const state = { ...createGameState(seed), elapsedMs: 8500 };
    const a = updateGame(state, idle, 50);
    const b = updateGame(state, idle, 50);
    expect(a).toEqual(b);
    const o = a.obstacles[0];
    expect(o).toBeDefined();
    layouts.add(`${o.kind}:${o.startLane}:${o.laneCount}`);
    if (o.kind === 'river') expect([o.startLane, o.laneCount]).toEqual([0, 3]);
    expect(a.nextObstacleMs).toBe(a.elapsedMs + 8500);
  }
  expect([...layouts].sort()).toEqual(['log:0:2', 'log:0:3', 'log:1:2', 'river:0:3', 'stones:0:2', 'stones:0:3', 'stones:1:2']);
});
