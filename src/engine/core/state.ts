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
 *   3. Pose input supplies cadence and consumable steps. Cadence controls motion;
 *      each step emits a projectile. Input omitting these fields retains the
 *      legacy continuous walk/fire path for headless development tools.
 */

import { CONFIG } from '@/engine/config';
import { advanceHazards, hasSafeHazardArrival } from '@/engine/core/hazards';
import { advanceOrbs, collectAll, dropOrbs } from '@/engine/core/orbs';
import { chainKills } from '@/engine/core/scoring';
import {
  advanceSpores,
  canSpawnSpore,
  createSporeCloud,
  hasPendingSpore,
  isInsideSpore,
  shieldPoints,
  sporeDamage,
} from '@/engine/core/spores';
import type {
  GameBody,
  GameInput,
  GameState,
  KillMark,
  RunConfig,
  TrailHazard,
} from '@/engine/types';

/** Deterministic 32-bit LCG (Numerical Recipes constants). */
const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const LCG_MODULUS = 2 ** 32;

export function createGameState(seed = 1, config: RunConfig = CONFIG.game): GameState {
  return {
    nextId: 1, obstacles: [], nextObstacleMs: config.obstacle.firstMs,
    spores: [], nextSporeMs: config.spore.firstMs, nextSporeTickMs: 0, isInSpore: false, isShielding: false,
    jumpStartedMs: null, lastTakeoffMs: null, jumpHeight: 0, jumpHeld: false, jumpCount: 0,
    hitAtMs: -Infinity, justImpacts: [], comboHits: 0, lastEnemyHitMs: -Infinity,
    bossSpawned: false, bossDefeated: false, nextBossKills: firstBossKills(config),
    lane: centreLane(config),
    hp: config.maxHp,
    score: 0,
    combo: 0,
    lastKillMs: -Infinity,
    orbs: [],
    justCollected: [],
    nextShieldPointMs: 0,
    justBonus: 0,
    distance: 0,
    speed: 0,
    enemies: [],
    bullets: [],
    isFiring: false,
    fireCooldownMs: 0,
    elapsedMs: 0,
    movementMs: 0,
    nextSpawnMs: config.spawnIntervalMs,
    invulnUntilMs: -Infinity,
    /** Set on the frame a hit lands, so the view can flash without polling HP. */
    justHit: false,
    justFired: false,
    /**
     * Where enemies died this frame. The view needs a position to play a death
     * animation at, and it cannot recover one from an enemy that has already
     * been filtered out of the list.
     */
    justKilled: [],
    killCount: 0,
    isCleared: false,
    isOver: false,
    deathReason: null,
    seed: seed >>> 0,
  };
}

export function restartGame(state: GameState, config: RunConfig = CONFIG.game): GameState {
  // Reuse the live seed so a retry is not a replay of the same enemy sequence.
  return createGameState(state.seed, config);
}

/** x of a lane centre. The single source of truth for lane geometry. */
export function laneToX(lane: number, config: RunConfig = CONFIG.game): number {
  return (lane - centreLane(config)) * config.laneWidth;
}

export function clampLane(lane: number, config: RunConfig = CONFIG.game): number {
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
  config: RunConfig = CONFIG.game,
): GameState {
  if (state.isOver) {
    if (!state.justHit && !state.justFired && state.justKilled.length === 0 && !state.justImpacts.length && !state.justCollected.length && !state.justBonus) return state;
    return { ...state, justHit: false, justFired: false, justKilled: [], justImpacts: [], justCollected: [], justBonus: 0 };
  }

  const stepMs = Math.min(Math.max(dtMs, 0), config.maxFrameMs);
  const stepSec = stepMs / 1000;
  const elapsedDelta = input.cadenceSpm === undefined ? stepMs : Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  const elapsedMs = state.elapsedMs + elapsedDelta;

  const progress = input.startingDifficulty === undefined ? spawnProgress(elapsedMs, config)
    : (difficultyAt(elapsedMs, input.startingDifficulty, config) - 1) / 4;
  // The walk is constant for the whole run; only the start eases up from a standstill.
  const speed = input.cadenceSpm === undefined
    ? rampTo(state.speed, config.walkSpeed, stepMs, config.speedLerpMs)
    : Math.min(config.maxCadenceSpeed, Math.max(0, Number.isFinite(input.cadenceSpm) ? input.cadenceSpm : 0)
      / config.cadenceForMaxSpeed * config.maxCadenceSpeed);
  const distance = state.distance + speed * stepSec;
  const lane = clampLane(input.lane, config);
  const isShielding = Boolean(input.isShielding);

  const wantsJump = Boolean(input.jump);
  const tookOff = wantsJump && !state.jumpHeld && state.jumpStartedMs === null;
  const flightStartedMs = tookOff ? elapsedMs : state.jumpStartedMs;
  const lastTakeoffMs = flightStartedMs ?? state.lastTakeoffMs;
  let jumpStartedMs = flightStartedMs;
  if (jumpStartedMs !== null && elapsedMs - jumpStartedMs >= config.jump.durationMs) jumpStartedMs = null;
  const jumpPhase = jumpStartedMs === null ? 0 : (elapsedMs - jumpStartedMs) / config.jump.durationMs;
  const jumpHeight = jumpStartedMs === null ? 0 : Math.sin(Math.PI * jumpPhase) * config.jump.height;
  // Hands on hips is not a jog: the shield and the gun never run together. Nor
  // does a jump: arms up to jump must not spray bullets on the way over.
  const isFiring = input.stepEvents === undefined
    ? Boolean(input.isFiring) && !isShielding && jumpStartedMs === null
    : input.stepEvents > 0;
  const crossed = advanceHazards(state.obstacles, lane, speed * stepSec, state.elapsedMs, elapsedMs, lastTakeoffMs, config);
  // The boss is just a big enemy: it walks in, and contact costs one HP.
  const movedEnemies = state.enemies.map((enemy) => {
    const extra = enemy.kind ? config.enemyTypes[enemy.kind].approachSpeed : 0;
    return advance(enemy, Math.max(2, speed + extra) * stepSec);
  }).filter(enemy => hasSafeHazardArrival(enemy, crossed.obstacles, speed, config));
  const spores = advanceSpores(state.spores, speed * stepSec, config);
  const isInSpore = isInsideSpore(spores);
  const spore = sporeDamage(state, isInSpore, isShielding, elapsedMs, config);
  const braved = shieldPoints(state, isInSpore, isShielding, elapsedMs, config);
  const sporePending = hasPendingSpore(spores);
  const movedBullets = state.bullets.map((bullet) => advance(bullet, -config.bulletSpeed * stepSec));

  const shots = resolveShots(movedBullets, movedEnemies, config, elapsedMs);
  const liveHitCombo = elapsedMs - state.lastEnemyHitMs < config.hitCombo.timeoutMs ? state.comboHits : 0;

  const obstacles = crossed.obstacles;
  const bossDefeated = state.bossDefeated || shots.killed.some(e => e.kind === 'boss');

  // While the grace window is open, enemies pass straight through instead of
  // being consumed -- being hit must never clear the road for free.
  const isGraced = elapsedMs < state.invulnUntilMs;
  const survivors = isGraced
    ? shots.enemies
    : shots.enemies.filter((enemy) => !isHit(enemy, lane, config));
  const hitCount = isGraced ? 0 : shots.enemies.length - survivors.length + Number(crossed.hit);

  const liveEnemies = survivors.filter((enemy) => enemy.z <= config.despawnZ);
  const liveBoss = liveEnemies.find(e => e.kind === 'boss');
  // A cloud ahead holds back new enemies until the player is through it, and
  // the boss walks in with only the enemies already on the trail.
  const spawned = sporePending || liveBoss
    ? { enemies: liveEnemies, seed: state.seed, nextSpawnMs: Math.max(state.nextSpawnMs, elapsedMs), nextId: state.nextId }
    : spawnDue(
      { enemies: liveEnemies, seed: state.seed },
      { elapsedMs, nextSpawnMs: state.nextSpawnMs, progress, nextId: state.nextId },
      config,
    );

  const fired = input.stepEvents !== undefined ? fireSteps(shots.bullets.filter(bullet => bullet.z >= config.spawnZ), lane, input.stepEvents, config) : fireDue(
    { bullets: shots.bullets.filter((bullet) => bullet.z >= config.spawnZ), cooldownMs: state.fireCooldownMs },
    { lane, isFiring, stepMs },
    config,
  );

  // A hit costs exactly one HP no matter how many enemies land on the same
  // frame; the grace window then covers the rest of the pile-up.
  // Spores keep their own cooldown, so they stack with an enemy hit.
  const hp = crossed.drowned ? 0 : Math.max(0, state.hp - (hitCount > 0 ? 1 : 0) - spore.damage);
  const tookDamage = hitCount > 0 || spore.damage > 0;

  // The stage goal, if this run has one. `goalKills` is absent for an endless
  // run, and a run with no goal can never be cleared -- only ended.
  const killCount = state.killCount + shots.kills;
  const isCleared = !crossed.drowned && config.goalKills !== undefined && killCount >= config.goalKills && (!config.requireBoss || bossDefeated);
  let nextId = spawned.nextId;
  // One boss at a time. An endless run meets a new one every `triggerKills`
  // kills; a run with a goal meets exactly one, just before the goal.
  const bossDue = !liveBoss && killCount >= state.nextBossKills;
  const shouldSpawnBoss = bossDue && !crossed.drowned && obstacles.every(o => o.status === 'cleared') && !sporePending;
  const nextBossKills = !shouldSpawnBoss ? state.nextBossKills
    : config.goalKills !== undefined ? Number.POSITIVE_INFINITY : killCount + config.boss.triggerKills;
  if (shouldSpawnBoss) {
    // Enemies already on the trail stay; only a row spawned this very step,
    // still on the spawn line where the boss stands, makes way for it.
    spawned.enemies = spawned.enemies.filter(e => e.id === undefined || e.id < state.nextId);
    spawned.enemies.push({ id: nextId++, kind: 'boss', hp: config.enemyTypes.boss.hp, lane: 1, z: config.spawnZ, previousZ: config.spawnZ });
  }
  let nextObstacleMs = state.nextObstacleMs;
  // Keep a hazard until its verdict is in, even if a fast step carried it past despawnZ first.
  const retainedHazards = obstacles.filter(o => o.z <= config.despawnZ || o.status !== 'cleared');
  const isBossPhase = Boolean(liveBoss) || bossDue;
  if (hp > 0 && !isCleared && !sporePending && elapsedMs >= nextObstacleMs && retainedHazards.length < config.obstacle.poolSize && !isBossPhase) {
    const typeRoll = random(spawned.seed);
    const widthRoll = random(typeRoll.seed);
    const sideRoll = random(widthRoll.seed);
    spawned.seed = sideRoll.seed;
    const total = config.obstacle.logWeight + config.obstacle.stoneWeight + config.obstacle.riverWeight;
    const kind: TrailHazard['kind'] = typeRoll.value * total < config.obstacle.logWeight ? 'log' :
      typeRoll.value * total < config.obstacle.logWeight + config.obstacle.stoneWeight ? 'stones' : 'river';
    const body = { id: nextId++, kind, z: config.spawnZ, previousZ: config.spawnZ, status: 'approaching' as const };
    const hazard: TrailHazard = kind === 'river' || widthRoll.value >= .5
      ? { ...body, startLane: 0, laneCount: 3 }
      : { ...body, kind, startLane: sideRoll.value < .5 ? 0 : 1, laneCount: 2 };
    retainedHazards.push(hazard);
    nextObstacleMs = elapsedMs + config.obstacle.intervalMs;
  }
  spawned.enemies = spawned.enemies.filter(enemy => hasSafeHazardArrival(enemy, retainedHazards, speed, config));
  const sporeConfig = input.startingDifficulty === undefined ? config : { ...config,
    spore: { ...config.spore, intervalMs: config.spore.intervalMs * (1.4 - progress * .8) } };
  const spawnsSpore = hp > 0 && !isCleared && canSpawnSpore(state, retainedHazards, elapsedMs, isBossPhase, sporeConfig) && spores.length === 0;
  const nextSpores = spawnsSpore ? [...spores, createSporeCloud(nextId++, config)] : spores;
  const nextSporeMs = spawnsSpore ? elapsedMs + sporeConfig.spore.intervalMs : state.nextSporeMs;
  // Existing orbs roll in first; this step's kills drop theirs behind them.
  const chained = chainKills(state, shots.killed, tookDamage, elapsedMs, config);
  const rolled = advanceOrbs(state.orbs, speed * stepSec, config);
  const dropped = dropOrbs(rolled.orbs, shots.killed, chained.values, nextId, config);
  nextId = dropped.nextId;
  const swept = isCleared ? collectAll(dropped.orbs) : { collected: 0, collectedIds: [] };
  // Orbs, plus braving a spore cloud behind the shield; see core/scoring.ts.
  const movementMs = state.movementMs + (speed > 0 ? elapsedDelta : 0);
  const activityPoints = input.cadenceSpm === undefined ? 0
    : (Math.floor(movementMs / 1000) - Math.floor(state.movementMs / 1000)) * config.movementPointsPerSecond
      + crossed.cleared * config.obstaclePoints;
  const score = state.score + rolled.collected + dropped.banked + swept.collected + braved.points + activityPoints;

  return {
    ...state,
    obstacles: retainedHazards, nextObstacleMs, jumpStartedMs, lastTakeoffMs, jumpHeight,
    spores: nextSpores, nextSporeMs, nextSporeTickMs: spore.nextTickMs, isInSpore, isShielding,
    jumpHeld: wantsJump, jumpCount: state.jumpCount + Number(tookOff),
    hitAtMs: tookDamage ? elapsedMs : state.hitAtMs, justImpacts: shots.impacts,
    bossSpawned: state.bossSpawned || shouldSpawnBoss, bossDefeated, nextBossKills,
    lane,
    hp,
    nextId,
    score,
    ...chained.chain,
    orbs: isCleared ? [] : dropped.orbs,
    justCollected: [...rolled.collectedIds, ...swept.collectedIds],
    nextShieldPointMs: braved.nextPointMs,
    justBonus: braved.points + activityPoints,
    distance,
    speed,
    enemies: spawned.enemies,
    bullets: fired.bullets,
    isFiring,
    fireCooldownMs: fired.cooldownMs,
    elapsedMs,
    movementMs,
    nextSpawnMs: spawned.nextSpawnMs,
    invulnUntilMs: hitCount > 0 ? elapsedMs + config.invulnMs : state.invulnUntilMs,
    justHit: tookDamage,
    justFired: fired.didFire,
    justKilled: shots.killed,
    killCount,
    comboHits: liveHitCombo + shots.impacts.length,
    lastEnemyHitMs: shots.impacts.length > 0 ? elapsedMs : state.lastEnemyHitMs,
    isCleared,
    // Clearing the goal ends the run just as surely as running out of HP --
    // one is a win and one is a loss, and /result tells them apart by isCleared.
    isOver: hp === 0 || isCleared,
    deathReason: crossed.drowned ? 'drowned' : hp > 0 ? null : hitCount === 0 && spore.damage > 0 ? 'poisoned' : 'damage',
    seed: spawned.seed,
  };
}

export function isInvulnerable(state: GameState): boolean {
  return state.elapsedMs < state.invulnUntilMs;
}

/** A run with a boss-gated goal meets its boss one kill short of the goal. */
function firstBossKills(config: RunConfig): number {
  return config.requireBoss && config.goalKills !== undefined
    ? Math.max(0, config.goalKills - 1)
    : config.boss.triggerKills;
}

function centreLane(config: RunConfig): number {
  return (config.laneCount - 1) / 2;
}

function advance(body: GameBody, deltaZ: number): GameBody {
  return { ...body, previousZ: body.z, z: body.z + deltaZ };
}

/** Five timed spawn stages, from the normal rate (1) to the highest rate (5). */
function spawnProgress(elapsedMs: number, config: RunConfig): number {
  // Keep the existing ramp's duration at walking speed, with four transitions.
  const stageDurationMs = (config.rampDistance / config.walkSpeed) * 1000 / 4;
  let stageIndex = 0;
  while (stageIndex < 4 && elapsedMs >= (stageIndex + 1) * stageDurationMs) stageIndex += 1;
  return stageIndex / 4;
}

export function difficultyAt(elapsedMs: number, startingDifficulty = 1, config: RunConfig = CONFIG.game): number {
  const start = Number.isFinite(startingDifficulty) ? Math.min(5, Math.max(1, Math.round(startingDifficulty))) : 1;
  return Math.min(5, start + Math.floor(Math.max(0, elapsedMs) / config.difficultyIntervalMs));
}

function fireSteps(bullets: GameBody[], lane: number, count: number, config: RunConfig) {
  const steps = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const muzzleZ = config.playerZ - config.playerRadius;
  return { bullets: [...bullets, ...Array.from({ length: Math.min(steps, config.bulletPoolSize) }, () =>
    ({ lane, z: muzzleZ, previousZ: muzzleZ }))], cooldownMs: 0, didFire: steps > 0 };
}

function spawnIntervalAt(progress: number, config: RunConfig): number {
  return config.spawnIntervalMs + (config.minSpawnIntervalMs - config.spawnIntervalMs) * progress;
}

/**
 * Steps towards a target at a fixed rate -- `target` per `rampMs` -- and lands
 * on it exactly, so the walk holds one constant speed once it is up to pace.
 * Measured in ms rather than frames, so every refresh rate ramps alike.
 */
function rampTo(current: number, target: number, stepMs: number, rampMs: number): number {
  if (rampMs <= 0) return target;
  const step = (Math.abs(target) * stepMs) / rampMs;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}

/**
 * Whether an enemy's body covers `lane`. Most stand in one lane; a kind with a
 * `laneSpan` (the boss) is that many lanes wide, centred on its own lane, and
 * blocks -- and can be shot -- in all of them.
 */
export function occupiesLane(enemy: GameBody, lane: number, config: RunConfig): boolean {
  const span = enemy.kind ? config.enemyTypes[enemy.kind].laneSpan : 1;
  return Math.abs(lane - enemy.lane) <= (span - 1) / 2;
}

/**
 * Swept test: did the enemy cross the player's band during this step? Comparing
 * only the new z would let a fast enemy tunnel straight through on a long frame.
 */
function isHit(enemy: GameBody, lane: number, config: RunConfig): boolean {
  if (!occupiesLane(enemy, lane, config)) return false;
  const reach = config.playerRadius + (enemy.kind ? config.enemyTypes[enemy.kind].radius : config.enemyRadius);
  return enemy.z >= config.playerZ - reach && enemy.previousZ <= config.playerZ + reach;
}

/**
 * Bullets against enemies. Both are swept over the step, because a bullet covers
 * more ground per frame than an enemy is wide. Each bullet damages one enemy;
 * only the final hit removes that enemy and awards a kill.
 */
function resolveShots(
  bullets: GameBody[],
  enemies: GameBody[],
  config: RunConfig,
  elapsedMs: number,
): { bullets: GameBody[]; enemies: GameBody[]; kills: number; killed: KillMark[]; impacts: KillMark[] } {
  const updated = enemies.map(e => ({ ...e }));
  const impacts: KillMark[] = [];
  const deadEnemies = new Set<number>();
  const spentBullets = new Set<number>();

  bullets.forEach((bullet, bulletIndex) => {
    const targetIndex = updated.findIndex(
      (enemy, enemyIndex) =>
        !deadEnemies.has(enemyIndex) &&
        occupiesLane(enemy, bullet.lane, config) &&
        bullet.z - ((enemy.kind ? config.enemyTypes[enemy.kind].radius : config.enemyRadius) + config.bulletRadius) <= enemy.z &&
        bullet.previousZ + ((enemy.kind ? config.enemyTypes[enemy.kind].radius : config.enemyRadius) + config.bulletRadius) >= enemy.previousZ,
    );
    if (targetIndex === -1) return;
    const target = updated[targetIndex]!;
    target.hp = (target.hp ?? 1) - 1;
    target.lastHitMs = elapsedMs;
    // Burst where the bullet struck: on a wide boss that is the bullet's lane.
    impacts.push({ lane: bullet.lane, z: target.z, kind: target.kind });
    if (target.hp <= 0) deadEnemies.add(targetIndex);
    spentBullets.add(bulletIndex);
  });

  return {
    bullets: bullets.filter((_, index) => !spentBullets.has(index)),
    enemies: updated.filter((_, index) => !deadEnemies.has(index)),
    impacts,
    kills: deadEnemies.size,
    killed: [...deadEnemies].map((index) => ({ lane: enemies[index]!.lane, z: enemies[index]!.z, ...(enemies[index]!.kind ? { kind: enemies[index]!.kind } : {}) })),
  };
}

function fireDue(
  { bullets, cooldownMs }: { bullets: GameBody[]; cooldownMs: number },
  { lane, isFiring, stepMs }: { lane: number; isFiring: boolean; stepMs: number },
  config: RunConfig,
): { bullets: GameBody[]; cooldownMs: number; didFire: boolean } {
  const remainingMs = Math.max(0, cooldownMs - stepMs);
  if (!isFiring || remainingMs > 0) return { bullets, cooldownMs: isFiring ? remainingMs : 0, didFire: false };

  const muzzleZ = config.playerZ - config.playerRadius;
  return {
    bullets: [...bullets, { lane, z: muzzleZ, previousZ: muzzleZ }],
    cooldownMs: config.fireIntervalMs,
    didFire: true,
  };
}

function spawnDue(
  { enemies, seed }: { enemies: GameBody[]; seed: number },
  { elapsedMs, nextSpawnMs, progress, nextId }: { elapsedMs: number; nextSpawnMs: number; progress: number; nextId: number },
  config: RunConfig,
): { enemies: GameBody[]; seed: number; nextSpawnMs: number; nextId: number } {
  // Keep one slot for a boss, and wait for enough room to spawn the whole row.
  const availableSlots = config.enemyPoolSize - enemies.length - 1;
  if (elapsedMs < nextSpawnMs || availableSlots <= 0) return { enemies, seed, nextSpawnMs, nextId };

  const row = pickRow(seed, progress, config);
  if (row.lanes.length > availableSlots) return { enemies, seed, nextSpawnMs, nextId };
  let liveSeed = row.seed;
  const spawnedEnemies = row.lanes.map((lane) => {
    const roll = random(liveSeed); liveSeed = roll.seed;
    const kind = roll.value < .5 ? 'weak' : roll.value < .85 ? 'normal' : 'tank';
    return { id: nextId++, kind, hp: config.enemyTypes[kind].hp, lane, z: config.spawnZ, previousZ: config.spawnZ } as GameBody;
  });

  return {
    enemies: [...enemies, ...spawnedEnemies],
    seed: liveSeed,
    nextId,
    nextSpawnMs: elapsedMs + spawnIntervalAt(progress, config),
  };
}

/** Early stages use one or two lanes; stages 4–5 mostly fill all three. */
function pickRow(
  seed: number,
  progress: number,
  config: RunConfig,
): { lanes: number[]; seed: number } {
  const first = random(seed);
  const firstLane = Math.min(config.laneCount - 1, Math.floor(first.value * config.laneCount));

  const roll = random(first.seed);
  const tripleChance = progress >= 1 ? config.tripleSpawnChance.stage5
    : progress >= .75 ? config.tripleSpawnChance.stage4 : 0;
  if (config.maxLanesPerRow >= 3 && config.laneCount >= 3 && roll.value < tripleChance) {
    const others = laneIndices(config).filter(lane => lane !== firstLane);
    return { lanes: [firstLane, ...others.slice(0, 2)], seed: roll.seed };
  }
  const wantsSecond =
    config.maxLanesPerRow >= 2 && config.laneCount >= 2 &&
    (progress >= .75 || roll.value < config.doubleSpawnChance * progress);
  if (!wantsSecond) return { lanes: [firstLane], seed: roll.seed };

  const others = laneIndices(config).filter((lane) => lane !== firstLane);
  const pick = random(roll.seed);
  const secondLane = others[Math.min(others.length - 1, Math.floor(pick.value * others.length))]!;

  return { lanes: [firstLane, secondLane], seed: pick.seed };
}

function laneIndices(config: RunConfig): number[] {
  return Array.from({ length: config.laneCount }, (_, index) => index);
}

function random(seed: number): { value: number; seed: number } {
  const next = (seed * LCG_MULTIPLIER + LCG_INCREMENT) >>> 0;
  return { value: next / LCG_MODULUS, seed: next };
}
