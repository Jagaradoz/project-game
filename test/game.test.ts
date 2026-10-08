/** Headless tests for the runner reducer. No Three.js, no DOM. */

import { test } from 'vitest';
import assert from 'node:assert/strict';

import { CONFIG } from '@/engine/config';
import { createGameState, updateGame, restartGame, laneToX, clampLane } from '@/engine/core/state';
import { createInput } from '@/engine/core/input';
import { LATERAL } from '@/engine/detectors/lateral';
import type { GameInput, GameState } from '@/engine/types';

const GAME = CONFIG.game;
const STEP_MS = 1000 / 60;
const WALKING = { lane: 1, isFiring: false };

/** Fixed-step driver, mirroring test/helpers.js run() for the detectors. */
function runGame(
  state: GameState,
  frames: number,
  inputAt: (index: number, state: GameState) => GameInput,
  dtMs = STEP_MS,
): GameState {
  let current = state;
  for (let index = 0; index < frames; index += 1) {
    current = updateGame(current, inputAt(index, current), dtMs);
  }
  return current;
}

const constantInput = (input: GameInput) => () => input;

/** A kill pays through the orbs it drops, not straight into the score. */
const orbValue = (state: GameState) => state.orbs.reduce((total, orb) => total + orb.value, 0);

/** A state with one enemy already inside the player's collision band. */
function stateWithEnemyOnPlayer(lane = 1) {
  return { ...createGameState(1), lane, enemies: [{ lane, z: 0, previousZ: 0 }] };
}

test('game: starts centred, full health, stopped', () => {
  const state = createGameState(1);

  assert.equal(state.lane, 1);
  assert.equal(state.hp, GAME.maxHp);
  assert.equal(state.speed, 0);
  assert.equal(state.isOver, false);
});

test('game: lane is assigned instantly, with no interpolation', () => {
  const state = updateGame(createGameState(1), { lane: 2, isFiring: false }, STEP_MS);

  assert.equal(state.lane, 2);
  assert.equal(Number.isInteger(state.lane), true);
  assert.equal(laneToX(state.lane), GAME.laneWidth);
});

test('game: a lane change lands exactly on the lane centre, both directions', () => {
  const right = updateGame(createGameState(1), { lane: 2, isFiring: false }, STEP_MS);
  const left = updateGame(right, { lane: 0, isFiring: false }, STEP_MS);

  assert.equal(left.lane, 0);
  assert.equal(laneToX(0), -GAME.laneWidth);
  assert.equal(laneToX(1), 0);
});

test('game: out-of-range lane input is clamped, never wrapped', () => {
  assert.equal(clampLane(-4), 0);
  assert.equal(clampLane(9), GAME.laneCount - 1);
  assert.equal(clampLane(Number.NaN), 1);
});

test('input: each lean state maps to one fixed lane, in both directions', () => {
  const input = createInput();

  input.setPose(LATERAL.LEFT, true);
  assert.equal(input.read().lane, 0);

  input.setPose(LATERAL.RIGHT, true);
  assert.equal(input.read().lane, 2);

  input.setPose(LATERAL.CENTER, true);
  assert.equal(input.read().lane, 1);

  // Returning to the same lean must land on the same lane, with no accumulation.
  input.setPose(LATERAL.LEFT, true);
  assert.equal(input.read().lane, 0);
});

test('input: holding a lean does not drift the lane frame after frame', () => {
  const input = createInput();
  for (let frame = 0; frame < 200; frame += 1) input.setPose(LATERAL.RIGHT, true);

  assert.equal(input.read().lane, 2);
});

test('input: jogging opens fire, standing still holds fire', () => {
  const input = createInput();

  input.setPose(LATERAL.CENTER, true);
  assert.equal(input.read().isFiring, true);

  input.setPose(LATERAL.CENTER, false);
  assert.equal(input.read().isFiring, false);
});

test('input: dev fire temporarily overrides a stationary camera pose', () => {
  const input = createInput();
  input.setPose(LATERAL.CENTER, false);
  input.setDevFire(true);
  assert.equal(input.read().isFiring, true);
  input.setPose(LATERAL.CENTER, false);
  assert.equal(input.read().isFiring, true);
  input.setDevFire(false);
  assert.equal(input.read().isFiring, false);
});

test('input: losing the body holds the lane and holds fire', () => {
  const input = createInput();
  input.setPose(LATERAL.LEFT, true);
  input.clearPose();

  assert.deepEqual(input.read(), { lane: 0, isFiring: false, isShielding: false });
});

test('input: keyboard steps are clamped, and the next lean takes the lane back', () => {
  const input = createInput();

  input.step(-1);
  input.step(-1);
  input.step(-1);
  assert.equal(input.read().lane, 0);

  input.setPose(LATERAL.RIGHT, true);
  assert.equal(input.read().lane, 2);
});

test('input: with no camera yet, the gun runs so the keyboard alone is playable', () => {
  assert.equal(createInput().read().isFiring, true);
});

test('game: an enemy in the same lane costs exactly one HP', () => {
  const state = updateGame(stateWithEnemyOnPlayer(1), { lane: 1, isFiring: false }, STEP_MS);

  assert.equal(state.hp, GAME.maxHp - 1);
  assert.equal(state.justHit, true);
  assert.equal(state.enemies.length, 0);
});

test('game: an enemy in another lane passes harmlessly', () => {
  const state = updateGame(stateWithEnemyOnPlayer(0), { lane: 2, isFiring: false }, STEP_MS);

  assert.equal(state.hp, GAME.maxHp);
  assert.equal(state.justHit, false);
});

test('game: two enemies landing on the same frame still cost only one HP', () => {
  const doubled = {
    ...createGameState(1),
    enemies: [
      { lane: 1, z: 0, previousZ: 0 },
      { lane: 1, z: -0.5, previousZ: -0.5 },
    ],
  };
  const state = updateGame(doubled, { lane: 1, isFiring: false }, STEP_MS);

  assert.equal(state.hp, GAME.maxHp - 1);
});

test('game: the grace window blocks a second hit', () => {
  const hit = updateGame(stateWithEnemyOnPlayer(1), { lane: 1, isFiring: false }, STEP_MS);
  const second = updateGame(
    { ...hit, enemies: [{ lane: 1, z: 0, previousZ: 0 }] },
    { lane: 1, isFiring: false },
    STEP_MS,
  );

  assert.equal(second.hp, hit.hp);
  // Graced enemies are not consumed -- being hit must not clear the road.
  assert.equal(second.enemies.length, 1);
});

test('game: the grace window expires and the next hit lands', () => {
  const hit = updateGame(stateWithEnemyOnPlayer(1), { lane: 1, isFiring: false }, STEP_MS);
  const waited = { ...hit, elapsedMs: hit.invulnUntilMs + 1, enemies: [] };
  const second = updateGame(
    { ...waited, enemies: [{ lane: 1, z: 0, previousZ: 0 }] },
    { lane: 1, isFiring: false },
    STEP_MS,
  );

  assert.equal(second.hp, hit.hp - 1);
});

test('game: an enemy that leaps clean over the player in one step still hits', () => {
  // Speed forced past anything the ramp produces, so the enemy starts in front of
  // the collision band and ends behind it. Comparing only the new z would miss.
  const reach = GAME.playerRadius + GAME.enemyRadius;
  const flying = {
    ...createGameState(1),
    speed: GAME.walkSpeed * 5,
    enemies: [{ lane: 1, z: -reach - 1, previousZ: -reach - 1 }],
  };
  const state = updateGame(flying, { lane: 1, isFiring: false }, GAME.maxFrameMs);

  assert.ok(state.enemies.length === 0 || state.enemies[0].z > reach);
  assert.equal(state.hp, GAME.maxHp - 1);
});

test('game: tuning keeps one clamped frame shorter than the collision band', () => {
  const travelPerFrame = GAME.walkSpeed * (GAME.maxFrameMs / 1000);
  const bandWidth = 2 * (GAME.playerRadius + GAME.enemyRadius);

  assert.ok(travelPerFrame < bandWidth, `${travelPerFrame} vs ${bandWidth}`);
});

test('game: an enemy that gets past the player is retired without scoring', () => {
  // Points come from kills only -- one that walked past is one you failed to shoot.
  const behind = {
    ...createGameState(1),
    enemies: [{ lane: 0, z: GAME.despawnZ + 1, previousZ: GAME.despawnZ + 1 }],
  };
  const state = updateGame(behind, { lane: 1, isFiring: false }, STEP_MS);

  assert.equal(state.score, 0);
  assert.equal(state.enemies.length, 0);
});

test('game: jogging fires, and each bullet leaves from the current lane', () => {
  const firing = runGame(createGameState(1), 2, constantInput({ lane: 2, isFiring: true }));

  assert.equal(firing.bullets.length, 1);
  assert.equal(firing.bullets[0].lane, 2);
  assert.ok(firing.bullets[0].z < GAME.playerZ, 'bullet must start ahead of the player');
});

test('game: standing still fires nothing', () => {
  const idle = runGame(createGameState(1), 300, constantInput(WALKING));

  assert.equal(idle.bullets.length, 0);
});

test('game: fire rate is capped, not one bullet per frame', () => {
  const frames = 60;
  const state = runGame(createGameState(1), frames, constantInput({ lane: 1, isFiring: true }));
  const elapsedMs = frames * STEP_MS;

  assert.ok(state.bullets.length < frames, `fired ${state.bullets.length} in ${frames} frames`);
  assert.ok(
    state.bullets.length <= Math.ceil(elapsedMs / GAME.fireIntervalMs) + 1,
    `fired ${state.bullets.length}`,
  );
});

test('game: a bullet kills an enemy in its lane and scores the kill', () => {
  const engaged = {
    ...createGameState(1),
    bullets: [{ lane: 1, z: -10, previousZ: -10 }],
    enemies: [{ lane: 1, z: -11, previousZ: -11 }],
  };
  const state = updateGame(engaged, { lane: 1, isFiring: false }, STEP_MS);

  assert.equal(state.killCount, 1);
  assert.equal(orbValue(state), GAME.scoring.kill.normal);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.bullets.length, 0);
});

test('game: a bullet ignores enemies in other lanes', () => {
  const engaged = {
    ...createGameState(1),
    bullets: [{ lane: 0, z: -10, previousZ: -10 }],
    enemies: [{ lane: 2, z: -11, previousZ: -11 }],
  };
  const state = updateGame(engaged, { lane: 1, isFiring: false }, STEP_MS);

  assert.equal(state.score, 0);
  assert.equal(state.enemies.length, 1);
  assert.equal(state.bullets.length, 1);
});

test('game: one bullet kills one enemy, not the whole column', () => {
  const column = {
    ...createGameState(1),
    bullets: [{ lane: 1, z: -10, previousZ: -10 }],
    enemies: [
      { lane: 1, z: -10.2, previousZ: -10.2 },
      { lane: 1, z: -10.4, previousZ: -10.4 },
    ],
  };
  const state = updateGame(column, { lane: 1, isFiring: false }, STEP_MS);

  assert.equal(state.killCount, 1);
  assert.equal(orbValue(state), GAME.scoring.kill.normal);
  assert.equal(state.enemies.length, 1);
});

test('game: a fast bullet cannot fly through an enemy on a long frame', () => {
  const travel = GAME.bulletSpeed * (GAME.maxFrameMs / 1000);
  const engaged = {
    ...createGameState(1),
    bullets: [{ lane: 1, z: -30, previousZ: -30 }],
    enemies: [{ lane: 1, z: -30 - travel / 2, previousZ: -30 - travel / 2 }],
  };
  const state = updateGame(engaged, { lane: 1, isFiring: false }, GAME.maxFrameMs);

  assert.equal(state.killCount, 1);
  assert.equal(orbValue(state), GAME.scoring.kill.normal);
  assert.equal(state.enemies.length, 0);
});

test('game: bullets that miss are retired at the spawn line', () => {
  const state = runGame(
    { ...createGameState(1), bullets: [{ lane: 1, z: GAME.spawnZ + 1, previousZ: GAME.spawnZ + 1 }] },
    2,
    constantInput(WALKING),
  );

  assert.equal(state.bullets.length, 0);
});

test('game: losing every HP ends the run and freezes the world', () => {
  let state = { ...createGameState(1), hp: 1, enemies: [{ lane: 1, z: 0, previousZ: 0 }] };
  state = updateGame(state, { lane: 1, isFiring: false }, STEP_MS);

  assert.equal(state.hp, 0);
  assert.equal(state.isOver, true);

  const frozen = runGame(state, 30, constantInput({ lane: 0, isFiring: false }));
  assert.equal(frozen.distance, state.distance);
  assert.equal(frozen.lane, state.lane);
  assert.equal(frozen.score, state.score);
});

test('game: restarting clears the run but keeps the sequence moving on', () => {
  const over = { ...createGameState(1), hp: 0, score: 12, distance: 300, isOver: true };
  const fresh = restartGame(over);

  assert.equal(fresh.hp, GAME.maxHp);
  assert.equal(fresh.score, 0);
  assert.equal(fresh.distance, 0);
  assert.equal(fresh.isOver, false);
  assert.equal(fresh.enemies.length, 0);
});

test('game: the march is constant -- not firing does not stop the world', () => {
  const walking = runGame(createGameState(1), 120, constantInput(WALKING));

  assert.ok(walking.speed > GAME.walkSpeed * 0.9, `speed was ${walking.speed}`);
  assert.ok(walking.distance > 0);
  assert.equal(walking.isFiring, false);
});

test('game: enemies keep to their spawn lane for their whole life', () => {
  const seen = new Map<string, number>();
  runGame(createGameState(7), 1800, (_, state) => {
    state.enemies.forEach((enemy, index) => {
      const key = `${index}:${Math.round(enemy.z)}`;
      seen.set(key, enemy.lane);
      assert.equal(Number.isInteger(enemy.lane), true);
      assert.ok(enemy.lane >= 0 && enemy.lane < GAME.laneCount);
    });
    return WALKING;
  });

  assert.ok(seen.size > 0, 'no enemies were spawned');
});

test('game: spawn rows use distinct lanes and respect the configured width', () => {
  let previousCount = 0;

  runGame(createGameState(99), 3600, (_, state) => {
    const spawnedNow = state.enemies.filter((enemy) => enemy.z === GAME.spawnZ);
    assert.ok(
      spawnedNow.length <= GAME.maxLanesPerRow,
      `row of ${spawnedNow.length} lanes at the spawn line`,
    );
    assert.equal(new Set(spawnedNow.map(enemy => enemy.lane)).size, spawnedNow.length);
    previousCount = state.enemies.length;
    return WALKING;
  });

  assert.ok(previousCount >= 0);
});

test('game: walking speed stays constant for the whole run', () => {
  const early = runGame(createGameState(3), 120, constantInput(WALKING));
  const late = runGame({ ...early, distance: GAME.rampDistance * 2 }, 120, constantInput(WALKING));

  assert.ok(Math.abs(early.speed - GAME.walkSpeed) < 1e-6, `early speed was ${early.speed}`);
  assert.ok(Math.abs(late.speed - GAME.walkSpeed) < 1e-6, `late speed was ${late.speed}`);
});

/* -------------------------------------------- timed enemy spawn stages ---- */

const SPAWNING_CONFIG = {
  ...GAME,
  obstacle: { ...GAME.obstacle, firstMs: Infinity },
  spore: { ...GAME.spore, firstMs: Infinity },
};
const SPAWN_STAGE_MS = (GAME.rampDistance / GAME.walkSpeed) * 1000 / 4;

test('game: five timed stages hold their spawn rates until the next boundary', () => {
  const intervals = [1400, 1200, 1000, 800, 600];
  for (let stage = 0; stage < intervals.length; stage += 1) {
    for (const elapsedMs of [stage * SPAWN_STAGE_MS, (stage + 1) * SPAWN_STAGE_MS - 1]) {
      const next = updateGame(
        { ...createGameState(1, SPAWNING_CONFIG), elapsedMs, nextSpawnMs: 0 },
        WALKING, 0, SPAWNING_CONFIG,
      );
      assert.equal(next.nextSpawnMs - elapsedMs, intervals[stage]);
      assert.ok(next.enemies.length >= 1 && next.enemies.length <= GAME.maxLanesPerRow);
    }
  }
});

test('game: spawn stages follow elapsed time, ignore distance, and cap at stage 5', () => {
  for (const distance of [0, GAME.rampDistance * 10]) {
    for (const [elapsedMs, interval] of [[0, GAME.spawnIntervalMs], [600_000, GAME.minSpawnIntervalMs]]) {
      const next = updateGame(
        { ...createGameState(1, SPAWNING_CONFIG), distance, elapsedMs, nextSpawnMs: 0 },
        WALKING, 0, SPAWNING_CONFIG,
      );
      assert.equal(next.nextSpawnMs - elapsedMs, interval);
    }
  }
});

test('game: each successive stage spawns more enemies over the same time window', () => {
  const totals: number[] = [];
  for (let stage = 0; stage < 5; stage += 1) {
    let total = 0;
    let rows = 0;
    let triples = 0;
    for (let seed = 1; seed <= 16; seed += 1) {
      const elapsedMs = stage * SPAWN_STAGE_MS + 1;
      let state = {
        ...createGameState(seed, SPAWNING_CONFIG), elapsedMs, nextSpawnMs: elapsedMs,
        speed: GAME.walkSpeed, invulnUntilMs: Infinity,
      };
      for (let frame = 0; frame < 400; frame += 1) {
        const previousId = state.nextId;
        state = updateGame(state, WALKING, 50, SPAWNING_CONFIG);
        const row = state.enemies.filter(enemy => enemy.id !== undefined && enemy.id >= previousId);
        assert.ok(row.length <= GAME.maxLanesPerRow);
        assert.equal(new Set(row.map(enemy => enemy.lane)).size, row.length);
        assert.ok(state.enemies.length <= GAME.enemyPoolSize);
        if (row.length > 0) {
          rows += 1;
          triples += Number(row.length === 3);
          if (stage < 3) assert.ok(row.length <= 2);
          else assert.ok(row.length >= 2);
        }
      }
      total += state.nextId - 1;
    }
    totals.push(total);
    if (stage > 0) assert.ok(totals[stage] > totals[stage - 1], `spawn totals: ${totals}`);
    if (stage === 3) assert.ok(triples / rows >= .7 && triples / rows <= .9, `stage 4 triple rows: ${triples}/${rows}`);
    if (stage === 4) assert.ok(triples / rows >= .9, `stage 5 triple rows: ${triples}/${rows}`);
  }
});

test('game: late-stage waves still obey a lower configured lane limit', () => {
  for (const maxLanesPerRow of [1, 2, 3]) {
    const config = { ...SPAWNING_CONFIG, maxLanesPerRow };
    const next = updateGame(
      { ...createGameState(1, config), elapsedMs: 600_000, nextSpawnMs: 0 },
      WALKING, 0, config,
    );
    assert.equal(next.enemies.length, maxLanesPerRow);
    assert.equal(new Set(next.enemies.map(enemy => enemy.lane)).size, maxLanesPerRow);
  }
});

test('game: full waves wait for pool capacity and reserve one slot for a boss', () => {
  for (const availableSlots of [0, 2, 3]) {
    const count = GAME.enemyPoolSize - availableSlots - 1;
    const enemies = Array.from({ length: count }, (_, index) => ({
      id: index + 1, lane: index % GAME.laneCount, z: -40, previousZ: -40,
    }));
    const state = {
      ...createGameState(1, SPAWNING_CONFIG), enemies, nextId: count + 1,
      elapsedMs: 600_000, nextSpawnMs: 0,
    };
    const next = updateGame(state, WALKING, 0, SPAWNING_CONFIG);
    if (availableSlots === 3) {
      assert.equal(next.enemies.length, GAME.enemyPoolSize - 1);
      assert.equal(next.nextId, state.nextId + 3);
    } else {
      assert.equal(next.enemies.length, count);
      assert.equal(next.nextId, state.nextId);
      assert.equal(next.seed, state.seed);
      assert.equal(next.nextSpawnMs, state.nextSpawnMs);
    }
  }
});

test('game: restarting after stage 5 returns spawning to stage 1', () => {
  const fresh = restartGame({ ...createGameState(1, SPAWNING_CONFIG), elapsedMs: 600_000 }, SPAWNING_CONFIG);
  assert.equal(fresh.elapsedMs, 0);
  assert.equal(fresh.nextSpawnMs, GAME.spawnIntervalMs);
  const next = updateGame({ ...fresh, nextSpawnMs: 0 }, WALKING, 0, SPAWNING_CONFIG);
  assert.equal(next.nextSpawnMs, GAME.spawnIntervalMs);
  assert.equal(next.enemies.length, 1);
});

test('game: the gun holds fire while the player is in the air', () => {
  const grounded = updateGame(createGameState(1), { lane: 1, isFiring: true }, STEP_MS);
  const airborne = updateGame(createGameState(1), { lane: 1, isFiring: true, jump: true }, STEP_MS);

  assert.equal(grounded.isFiring, true);
  assert.ok(grounded.bullets.length > 0);
  assert.equal(airborne.isFiring, false);
  assert.equal(airborne.bullets.length, 0);
});

test('game: a long stalled frame is clamped instead of teleporting the world', () => {
  const primed = runGame(createGameState(1), 120, constantInput(WALKING));
  const stalled = updateGame(primed, WALKING, 5000);
  const clamped = updateGame(primed, WALKING, GAME.maxFrameMs);

  assert.equal(stalled.distance, clamped.distance);
});

test('game: a kill reports where it happened so the view can stage a death', () => {
  // Arrange: a bullet one step away from an enemy sitting in the centre lane.
  const config = { ...CONFIG.game, spawnIntervalMs: 1e9 };
  const enemy = { lane: 1, z: -10, previousZ: -10 };
  const bullet = { lane: 1, z: -9, previousZ: -9 };
  const state = { ...createGameState(1, config), enemies: [enemy], bullets: [bullet] };

  // Act
  const next = updateGame(state, { lane: 1, isFiring: false }, 100, config);

  // Assert
  assert.equal(orbValue(next), GAME.scoring.kill.normal);
  assert.equal(next.justKilled.length, 1);
  assert.equal(next.justKilled[0].lane, 1);
  assert.ok(Number.isFinite(next.justKilled[0].z));
});

test('game: justKilled is cleared on the following frame', () => {
  const config = { ...CONFIG.game, spawnIntervalMs: 1e9 };
  const enemy = { lane: 1, z: -10, previousZ: -10 };
  const bullet = { lane: 1, z: -9, previousZ: -9 };
  const state = { ...createGameState(1, config), enemies: [enemy], bullets: [bullet] };

  const killed = updateGame(state, { lane: 1, isFiring: false }, 100, config);
  const after = updateGame(killed, { lane: 1, isFiring: false }, 100, config);

  assert.equal(after.justKilled.length, 0);
});

/* ------------------------------------------------- stage goal and clear ---- */

const GOAL_CONFIG = { ...GAME, goalKills: 2 };

/** Places a bullet on top of an enemy so the next step resolves a kill. */
function engagement(state: GameState, lane = 1): GameState {
  return {
    ...state,
    bullets: [{ lane, z: -10, previousZ: -10 }],
    enemies: [{ lane, z: -11, previousZ: -11 }],
  };
}

test('game: killCount counts kills, and a miss does not count', () => {
  const missed = updateGame(
    { ...createGameState(1), bullets: [{ lane: 0, z: -10, previousZ: -10 }], enemies: [{ lane: 2, z: -11, previousZ: -11 }] },
    WALKING,
    STEP_MS,
  );
  assert.equal(missed.killCount, 0);

  const killed = updateGame(engagement(createGameState(1)), WALKING, STEP_MS);
  assert.equal(killed.killCount, 1);
});

test('game: a run with no goal can never be cleared', () => {
  let state = createGameState(1);
  for (let round = 0; round < 5; round += 1) {
    state = updateGame(engagement(state), WALKING, STEP_MS);
  }

  assert.equal(state.killCount, 5);
  assert.equal(state.isCleared, false);
  assert.equal(state.isOver, false);
});

test('game: reaching the goal clears the stage and ends the run', () => {
  let state = createGameState(1, GOAL_CONFIG);

  state = updateGame(engagement(state), WALKING, STEP_MS, GOAL_CONFIG);
  assert.equal(state.killCount, 1);
  assert.equal(state.isCleared, false, 'cleared one kill short of the goal');
  assert.equal(state.isOver, false);

  state = updateGame(engagement(state), WALKING, STEP_MS, GOAL_CONFIG);
  assert.equal(state.killCount, 2);
  assert.equal(state.isCleared, true);
  assert.equal(state.isOver, true);
});

test('game: running out of HP ends the run without clearing it', () => {
  const doomed = { ...createGameState(1, GOAL_CONFIG), hp: 1 };
  const state = updateGame(
    { ...doomed, enemies: [{ lane: 1, z: 0, previousZ: -2 }] },
    WALKING,
    STEP_MS,
    GOAL_CONFIG,
  );

  assert.equal(state.hp, 0);
  assert.equal(state.isOver, true);
  assert.equal(state.isCleared, false, 'a loss was reported as a stage clear');
});

test('game: a cleared run stays cleared and stops advancing', () => {
  let state = createGameState(1, GOAL_CONFIG);
  state = updateGame(engagement(state), WALKING, STEP_MS, GOAL_CONFIG);
  state = updateGame(engagement(state), WALKING, STEP_MS, GOAL_CONFIG);

  const after = updateGame(state, WALKING, STEP_MS, GOAL_CONFIG);
  assert.equal(after.isCleared, true);
  assert.equal(after.distance, state.distance);
  assert.equal(after.killCount, state.killCount);
});

test('game: restarting clears the kill count and the cleared flag', () => {
  const finished = { ...createGameState(1, GOAL_CONFIG), killCount: 9, isCleared: true, isOver: true };
  const fresh = restartGame(finished, GOAL_CONFIG);

  assert.equal(fresh.killCount, 0);
  assert.equal(fresh.isCleared, false);
  assert.equal(fresh.isOver, false);
});

test('game: a raised maxHp reaches the reducer', () => {
  const forgiving = createGameState(1, { ...GAME, maxHp: GAME.maxHp + 1 });
  assert.equal(forgiving.hp, GAME.maxHp + 1);
});
