/**
 * Endless 3-lane runner, as a pure reducer.
 *
 * No Three.js and no DOM in here, so the whole game can be stepped headlessly in
 * tests exactly like the pose detectors are. Randomness is a seeded LCG carried
 * in the state, which keeps spawn sequences reproducible.
 *
 * Three deliberate rules, all from the brief:
 *
 *   1. `lane` is an integer that is ASSIGNED, never interpolated. Whatever the
 *      input says the lane is, that is the lane this frame -- no easing, no
 *      partial offsets, so the rendered x can never drift from the logical lane.
 *   2. An enemy is born in one lane and dies in that lane. It only ever moves in
 *      +z, towards the player.
 *   3. The march never stops. Jogging decides whether the player SHOOTS, so the
 *      answer to an enemy is bullets, not dodging -- though a lane change is
 *      still the way out of a column you cannot clear in time.
 */

import { CONFIG } from '@/engine/config';
import type {
  GameBody,
  GameConfig,
  GameInput,
  GameState,
  KillMark,
} from '@/engine/types';

/** Deterministic 32-bit LCG (Numerical Recipes constants). */
const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const LCG_MODULUS = 2 ** 32;

export function createGameState(seed = 1, config: GameConfig = CONFIG.game): GameState {
  return {
    lane: centreLane(config),
    hp: config.maxHp,
    score: 0,
    distance: 0,
    speed: 0,
    enemies: [],
    bullets: [],
    isFiring: false,
    fireCooldownMs: 0,
    elapsedMs: 0,
    nextSpawnMs: config.spawnIntervalMs,
    invulnUntilMs: -Infinity,
    /** Set on the frame a hit lands, so the view can flash without polling HP. */
    justHit: false,
    /**
     * Where enemies died this frame. The view needs a position to play a death
     * animation at, and it cannot recover one from an enemy that has already
     * been filtered out of the list.
     */
    justKilled: [],
    isOver: false,
    seed: seed >>> 0,
  };
}

export function restartGame(state: GameState, config: GameConfig = CONFIG.game): GameState {
  // Reuse the live seed so a retry is not a replay of the same enemy sequence.
  return createGameState(state.seed, config);
}

/** x of a lane centre. The single source of truth for lane geometry. */
export function laneToX(lane: number, config: GameConfig = CONFIG.game): number {
  return (lane - centreLane(config)) * config.laneWidth;
}

export function clampLane(lane: number, config: GameConfig = CONFIG.game): number {
  if (!Number.isFinite(lane)) return centreLane(config);
  return Math.min(config.laneCount - 1, Math.max(0, Math.round(lane)));
}

/**
 * @param {object} state
 * @param {{lane: number, isFiring: boolean}} input
 * @param {number} dtMs  Wall time since the last step; clamped internally.
 */
export function updateGame(
  state: GameState,
  input: GameInput,
  dtMs: number,
  config: GameConfig = CONFIG.game,
): GameState {
  if (state.isOver) {
    if (!state.justHit && state.justKilled.length === 0) return state;
    return { ...state, justHit: false, justKilled: [] };
  }

  const stepMs = Math.min(Math.max(dtMs, 0), config.maxFrameMs);
  const stepSec = stepMs / 1000;
  const elapsedMs = state.elapsedMs + stepMs;

  const progress = rampProgress(state.distance, config);
  const speed = approach(state.speed, speedAt(progress, config), stepMs, config.speedLerpMs);
  const distance = state.distance + speed * stepSec;
  const lane = clampLane(input.lane, config);

  const movedEnemies = state.enemies.map((enemy) => advance(enemy, speed * stepSec));
  const movedBullets = state.bullets.map((bullet) => advance(bullet, -config.bulletSpeed * stepSec));

  const shots = resolveShots(movedBullets, movedEnemies, config);

  // While the grace window is open, enemies pass straight through instead of
  // being consumed -- being hit must never clear the road for free.
  const isGraced = elapsedMs < state.invulnUntilMs;
  const survivors = isGraced
    ? shots.enemies
    : shots.enemies.filter((enemy) => !isHit(enemy, lane, config));
  const hitCount = shots.enemies.length - survivors.length;

  const spawned = spawnDue(
    { enemies: survivors.filter((enemy) => enemy.z <= config.despawnZ), seed: state.seed },
    { elapsedMs, nextSpawnMs: state.nextSpawnMs, progress },
    config,
  );

  const fired = fireDue(
    { bullets: shots.bullets.filter((bullet) => bullet.z >= config.spawnZ), cooldownMs: state.fireCooldownMs },
    { lane, isFiring: Boolean(input.isFiring), stepMs },
    config,
  );

  // A hit costs exactly one HP no matter how many enemies land on the same
  // frame; the grace window then covers the rest of the pile-up.
  const hp = Math.max(0, state.hp - (hitCount > 0 ? 1 : 0));

  return {
    ...state,
    lane,
    hp,
    score: state.score + shots.kills,
    distance,
    speed,
    enemies: spawned.enemies,
    bullets: fired.bullets,
    isFiring: Boolean(input.isFiring),
    fireCooldownMs: fired.cooldownMs,
    elapsedMs,
    nextSpawnMs: spawned.nextSpawnMs,
    invulnUntilMs: hitCount > 0 ? elapsedMs + config.invulnMs : state.invulnUntilMs,
    justHit: hitCount > 0,
    justKilled: shots.killed,
    isOver: hp === 0,
    seed: spawned.seed,
  };
}

export function isInvulnerable(state: GameState): boolean {
  return state.elapsedMs < state.invulnUntilMs;
}

function centreLane(config: GameConfig): number {
  return (config.laneCount - 1) / 2;
}

function advance(body: GameBody, deltaZ: number): GameBody {
  return { ...body, previousZ: body.z, z: body.z + deltaZ };
}

/** 0 at the start of a run, 1 once the hardest speed and spawn rate are reached. */
function rampProgress(distance: number, config: GameConfig): number {
  return Math.min(1, Math.max(0, distance / config.rampDistance));
}

function speedAt(progress: number, config: GameConfig): number {
  return config.walkSpeed + (config.maxSpeed - config.walkSpeed) * progress;
}

function spawnIntervalAt(progress: number, config: GameConfig): number {
  return config.spawnIntervalMs + (config.minSpawnIntervalMs - config.spawnIntervalMs) * progress;
}

/**
 * Frame-rate independent ease towards a target. A plain per-frame factor would
 * make the world accelerate faster on a 120 Hz display than on a 30 Hz one.
 */
function approach(current: number, target: number, stepMs: number, lerpMs: number): number {
  const alpha = lerpMs <= 0 ? 1 : Math.min(1, stepMs / lerpMs);
  return current + (target - current) * alpha;
}

/**
 * Swept test: did the enemy cross the player's band during this step? Comparing
 * only the new z would let a fast enemy tunnel straight through on a long frame.
 */
function isHit(enemy: GameBody, lane: number, config: GameConfig): boolean {
  if (enemy.lane !== lane) return false;
  const reach = config.playerRadius + config.enemyRadius;
  return enemy.z >= config.playerZ - reach && enemy.previousZ <= config.playerZ + reach;
}

/**
 * Bullets against enemies. Both are swept over the step, because a bullet covers
 * more ground per frame than an enemy is wide. One bullet kills one enemy: the
 * pair is removed together and the kill scores.
 */
function resolveShots(
  bullets: GameBody[],
  enemies: GameBody[],
  config: GameConfig,
): { bullets: GameBody[]; enemies: GameBody[]; kills: number; killed: KillMark[] } {
  const reach = config.enemyRadius + config.bulletRadius;
  const deadEnemies = new Set<number>();
  const spentBullets = new Set<number>();

  bullets.forEach((bullet, bulletIndex) => {
    const targetIndex = enemies.findIndex(
      (enemy, enemyIndex) =>
        !deadEnemies.has(enemyIndex) &&
        enemy.lane === bullet.lane &&
        bullet.z - reach <= enemy.z &&
        bullet.previousZ + reach >= enemy.z,
    );
    if (targetIndex === -1) return;
    deadEnemies.add(targetIndex);
    spentBullets.add(bulletIndex);
  });

  return {
    bullets: bullets.filter((_, index) => !spentBullets.has(index)),
    enemies: enemies.filter((_, index) => !deadEnemies.has(index)),
    kills: deadEnemies.size,
    killed: [...deadEnemies].map((index) => ({ lane: enemies[index]!.lane, z: enemies[index]!.z })),
  };
}

function fireDue(
  { bullets, cooldownMs }: { bullets: GameBody[]; cooldownMs: number },
  { lane, isFiring, stepMs }: { lane: number; isFiring: boolean; stepMs: number },
  config: GameConfig,
): { bullets: GameBody[]; cooldownMs: number } {
  const remainingMs = Math.max(0, cooldownMs - stepMs);
  if (!isFiring || remainingMs > 0) return { bullets, cooldownMs: isFiring ? remainingMs : 0 };

  const muzzleZ = config.playerZ - config.playerRadius;
  return {
    bullets: [...bullets, { lane, z: muzzleZ, previousZ: muzzleZ }],
    cooldownMs: config.fireIntervalMs,
  };
}

function spawnDue(
  { enemies, seed }: { enemies: GameBody[]; seed: number },
  { elapsedMs, nextSpawnMs, progress }: { elapsedMs: number; nextSpawnMs: number; progress: number },
  config: GameConfig,
): { enemies: GameBody[]; seed: number; nextSpawnMs: number } {
  if (elapsedMs < nextSpawnMs) return { enemies, seed, nextSpawnMs };

  const row = pickRow(seed, progress, config);
  const spawnedEnemies = row.lanes.map((lane) => ({
    lane,
    z: config.spawnZ,
    previousZ: config.spawnZ,
  }));

  return {
    enemies: [...enemies, ...spawnedEnemies],
    seed: row.seed,
    nextSpawnMs: elapsedMs + spawnIntervalAt(progress, config),
  };
}

/** One or two distinct lanes, never enough to seal the road off. */
function pickRow(
  seed: number,
  progress: number,
  config: GameConfig,
): { lanes: number[]; seed: number } {
  const first = random(seed);
  const firstLane = Math.min(config.laneCount - 1, Math.floor(first.value * config.laneCount));

  const roll = random(first.seed);
  const wantsSecond =
    config.maxLanesPerRow >= 2 && roll.value < config.doubleSpawnChance * progress;
  if (!wantsSecond) return { lanes: [firstLane], seed: roll.seed };

  const others = laneIndices(config).filter((lane) => lane !== firstLane);
  const pick = random(roll.seed);
  const secondLane = others[Math.min(others.length - 1, Math.floor(pick.value * others.length))]!;

  return { lanes: [firstLane, secondLane], seed: pick.seed };
}

function laneIndices(config: GameConfig): number[] {
  return Array.from({ length: config.laneCount }, (_, index) => index);
}

function random(seed: number): { value: number; seed: number } {
  const next = (seed * LCG_MULTIPLIER + LCG_INCREMENT) >>> 0;
  return { value: next / LCG_MODULUS, seed: next };
}
