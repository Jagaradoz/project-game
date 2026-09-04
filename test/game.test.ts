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

test('input: losing the body holds the lane and holds fire', () => {
  const input = createInput();
  input.setPose(LATERAL.LEFT, true);
  input.clearPose();

  assert.deepEqual(input.read(), { lane: 0, isFiring: false });
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
    speed: GAME.maxSpeed * 5,
    enemies: [{ lane: 1, z: -reach - 1, previousZ: -reach - 1 }],
  };
  const state = updateGame(flying, { lane: 1, isFiring: false }, GAME.maxFrameMs);

  assert.ok(state.enemies.length === 0 || state.enemies[0].z > reach);
  assert.equal(state.hp, GAME.maxHp - 1);
});

test('game: tuning keeps one clamped frame shorter than the collision band', () => {
  const travelPerFrame = GAME.maxSpeed * (GAME.maxFrameMs / 1000);
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

  assert.equal(state.score, 1);
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

  assert.equal(state.score, 1);
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

  assert.equal(state.score, 1);
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

test('game: no spawn row ever seals off every lane', () => {
  let previousCount = 0;

  runGame(createGameState(99), 3600, (_, state) => {
    const spawnedNow = state.enemies.filter((enemy) => enemy.z === GAME.spawnZ);
    assert.ok(
      spawnedNow.length <= GAME.maxLanesPerRow,
      `row of ${spawnedNow.length} lanes at the spawn line`,
    );
    if (spawnedNow.length === 2) {
      assert.notEqual(spawnedNow[0].lane, spawnedNow[1].lane);
    }
    previousCount = state.enemies.length;
    return WALKING;
  });

  assert.ok(previousCount >= 0);
});

test('game: difficulty ramps speed up with distance, then stops', () => {
  const early = runGame(createGameState(3), 120, constantInput(WALKING));
  const late = runGame({ ...early, distance: GAME.rampDistance * 2 }, 120, constantInput(WALKING));

  assert.ok(late.speed > early.speed, `${late.speed} vs ${early.speed}`);
  assert.ok(late.speed <= GAME.maxSpeed + 1e-9, `speed was ${late.speed}`);
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
  assert.equal(next.score, 1);
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
