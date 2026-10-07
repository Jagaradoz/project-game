import { expect, test } from 'vitest';
import { CONFIG } from '@/engine/config';
import { createGameState, restartGame, updateGame } from '@/engine/core/state';
import { advanceHazards } from '@/engine/core/hazards';
import type { GameInput, GameState, TrailHazard } from '@/engine/types';

const idle = { lane: 1, isFiring: false };
const { takeoffGraceMs, landingGraceMs } = CONFIG.game.jump.leniency;
function hazard(kind: 'log' | 'stones' | 'river', startLane = 0, laneCount = 3, z = -1): TrailHazard {
  return { id: 70, kind, startLane, laneCount, z, previousZ: z, status: 'approaching' } as TrailHazard;
}
function approaching(obstacle: TrailHazard): GameState {
  return { ...createGameState(3), speed: 11, obstacles: [obstacle] };
}
/** Step until every hazard has its verdict (or the run ends). */
function settle(state: GameState, input: GameInput = idle, config = CONFIG.game): GameState {
  for (let i = 0; i < 40 && !state.isOver && state.obstacles.some(o => o.status !== 'cleared'); i++) {
    state = updateGame(state, input, 50, config);
  }
  return state;
}

for (const kind of ['log', 'stones'] as const) {
  for (const startLane of [0, 1]) {
    for (const lane of [0, 1, 2]) {
      test(`${kind} two lanes starting ${startLane}: player lane ${lane}`, () => {
        const state = approaching(hazard(kind, startLane, 2));
        expect(settle(state, { ...idle, lane }).hp).toBe(lane >= startLane && lane < startLane + 2 ? 2 : 3);
        expect(settle({ ...state, jumpStartedMs: -250 }, { ...idle, lane }).hp).toBe(3);
      });
    }
  }
  for (const lane of [0, 1, 2]) {
    test(`${kind} three lanes requires jumping in lane ${lane}`, () => {
      const state = approaching(hazard(kind));
      expect(settle(state, { ...idle, lane }).hp).toBe(2);
      expect(settle({ ...state, jumpStartedMs: -250 }, { ...idle, lane }).hp).toBe(3);
    });
  }
  test(`${kind} contact is charged once even without a grace window`, () => {
    const config = { ...CONFIG.game, invulnMs: 0 };
    let state = approaching(hazard(kind));
    for (let i = 0; i < 12; i++) state = updateGame(state, idle, 50, config);
    expect(state.hp).toBe(2);
    expect(state.obstacles[0].status).toBe('cleared');
  });
  test(`${kind} is cleared by any jump that overlaps the crossing, however low`, () => {
    // Lands just after the hazard reaches the player: the old height check charged this.
    const state = { ...approaching(hazard(kind, 0, 3, -.6)), jumpStartedMs: -585 };
    expect(settle(state).hp).toBe(3);
  });
  test(`${kind} forgives a jump that landed just before it arrived`, () => {
    const arrive = hazard(kind, 0, 3, -1.46);
    const durationMs = CONFIG.game.jump.durationMs;
    expect(settle({ ...approaching(arrive), lastTakeoffMs: -durationMs - landingGraceMs + 50 }).hp).toBe(3);
    expect(settle({ ...approaching(arrive), lastTakeoffMs: -durationMs - landingGraceMs - 50 }).hp).toBe(2);
  });
  test(`${kind} forgives a late webcam jump after its centre has passed`, () => {
    const jumpingAtFrame = (jumpFrame: number) => {
      let state = approaching(hazard(kind, 0, 3, -.3));
      for (let frame = 1; frame <= 12; frame++) state = updateGame(state, { ...idle, jump: frame === jumpFrame }, 50);
      return state.hp;
    };
    // The centre passes in the first 50 ms frame; the window stays open `takeoffGraceMs` past it.
    expect(jumpingAtFrame(Math.floor(takeoffGraceMs / 50))).toBe(3);
    expect(jumpingAtFrame(Math.ceil(takeoffGraceMs / 50) + 2)).toBe(2);
  });
  test(`${kind} is dodged by being out of its lanes at any point of the crossing`, () => {
    let state = approaching(hazard(kind, 0, 2, -1.4));
    state = updateGame(state, { ...idle, lane: 2 }, 50);
    expect(settle(state, { ...idle, lane: 0 }).hp).toBe(3);
  });
}

for (const lane of [0, 1, 2]) {
  test(`river drowns a grounded player in lane ${lane}, even during grace`, () => {
    const state = { ...approaching(hazard('river')), invulnUntilMs: 5000 };
    const next = settle(state, { ...idle, lane });
    expect(next.hp).toBe(0);
    expect(next.isOver).toBe(true);
    expect(next.isCleared).toBe(false);
    expect(next.deathReason).toBe('drowned');
    const frozen = updateGame(next, { ...idle, jump: true }, 50);
    expect(frozen.distance).toBe(next.distance);
    expect(frozen.elapsedMs).toBe(next.elapsedMs);
  });
}

test('a river is crossed by any overlapping jump, including one that lands mid-crossing', () => {
  const state = settle({ ...approaching(hazard('river')), jumpStartedMs: -250 });
  expect(state.hp).toBe(3);
  expect(state.obstacles[0].status).toBe('cleared');
  expect(settle({ ...approaching(hazard('river', 0, 3, -.6)), jumpStartedMs: -585 }).deathReason).toBeNull();
  expect(settle(approaching(hazard('river')), { ...idle, jump: true }).deathReason).toBeNull();
});

test('wider river banks use their own contact bounds without enlarging solid hazards', () => {
  const check = (kind: TrailHazard['kind'], z: number) =>
    advanceHazards([hazard(kind, 0, 3, z)], 1, 0, 0, 50, null, CONFIG.game).obstacles[0].status;
  expect(check('river', -1.9)).toBe('crossing');
  expect(check('river', -2.5)).toBe('approaching');
  expect(check('log', -1.6)).toBe('approaching');
  expect(check('stones', -1.6)).toBe('approaching');
  expect(check('stones', -1.4)).toBe('crossing');
});

test('a missed river is caught even when the entire hazard passes in one step', () => {
  const config = { ...CONFIG.game, walkSpeed: 200, maxSpeed: 200 };
  const next = settle({ ...approaching(hazard('river', 0, 3, -3)), speed: 200 }, idle, config);
  expect(next.deathReason).toBe('drowned');
});

test('drowning wins over a simultaneous stage-winning kill', () => {
  const config = { ...CONFIG.game, goalKills: 1 };
  // Already past the player; the late-takeoff window closes this frame.
  const due = { ...hazard('river', 0, 3, 2), status: 'crossing' as const, centredMs: -takeoffGraceMs };
  const state = { ...approaching(due),
    enemies: [{ id: 1, lane: 1, z: -30, previousZ: -30 }],
    bullets: [{ lane: 1, z: -29, previousZ: -29 }],
  };
  const next = updateGame(state, idle, 50, config);
  expect(next.killCount).toBe(1);
  expect(next.deathReason).toBe('drowned');
  expect(next.isCleared).toBe(false);
});

test('restart clears death state and outstanding hazards', () => {
  const dead = settle(approaching(hazard('river')));
  expect(dead.deathReason).toBe('drowned');
  const next = restartGame(dead);
  expect(next.deathReason).toBeNull();
  expect(next.obstacles).toEqual([]);
  expect(next.lastTakeoffMs).toBeNull();
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
  const state = { ...approaching(hazard('log', 0, 3, -3)), killCount: CONFIG.game.boss.triggerKills, elapsedMs: 9000 };
  const next = updateGame(state, idle, 50);
  expect(next.bossSpawned).toBe(false);
  expect(next.obstacles).toHaveLength(1);
  const passed = { ...next, obstacles: [{ ...hazard('log', 0, 3, 2), status: 'cleared' as const }] };
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
