import type { GameBody, RunConfig, TrailHazard } from '@/engine/types';

export function hazardBlocksLane(hazard: TrailHazard, lane: number): boolean {
  return lane >= hazard.startLane && lane < hazard.startLane + hazard.laneCount;
}

function hazardReach(hazard: TrailHazard, config: RunConfig): number {
  return config.playerRadius + (hazard.kind === 'river' ? config.obstacle.riverRadius : config.obstacle.radius);
}

/**
 * Beginner rule: a crossing is safe if, at any moment between the hazard reaching the player and its
 * centre passing them, the player was in the air or out of its lanes. Height never matters, and
 * `jump.leniency` stretches the window both ways for webcam latency: a jump that landed up to
 * `landingGraceMs` before still counts, and so does one taking off up to `takeoffGraceMs` after the
 * centre passed. The verdict waits for that late window to close.
 */
export function advanceHazards(
  hazards: TrailHazard[], lane: number, deltaZ: number,
  fromMs: number, toMs: number, lastTakeoffMs: number | null, config: RunConfig,
): { obstacles: TrailHazard[]; hit: boolean; drowned: boolean } {
  const { durationMs, leniency } = config.jump;
  const landedByMs = lastTakeoffMs === null ? -Infinity : lastTakeoffMs + durationMs + leniency.landingGraceMs;
  /** When, inside this step, a hazard moving from `startZ` reaches `z`. */
  const reachedAt = (startZ: number, z: number) =>
    startZ >= z || deltaZ <= 0 ? fromMs : fromMs + ((z - startZ) / deltaZ) * (toMs - fromMs);
  let hit = false;
  let drowned = false;
  const obstacles = hazards.map(source => {
    const obstacle = { ...source, previousZ: source.z, z: source.z + deltaZ };
    const entryZ = config.playerZ - hazardReach(source, config);
    if (source.status === 'cleared') return obstacle;
    if (obstacle.z < entryZ) { obstacle.status = 'approaching'; return obstacle; }
    const enteredMs = reachedAt(source.z, entryZ);
    if (obstacle.centredMs === undefined && obstacle.z >= config.playerZ) obstacle.centredMs = reachedAt(source.z, config.playerZ);
    const closesMs = obstacle.centredMs === undefined ? Infinity : obstacle.centredMs + leniency.takeoffGraceMs;
    const airborne = lastTakeoffMs !== null && lastTakeoffMs <= Math.min(toMs, closesMs) && landedByMs >= enteredMs;
    obstacle.covered = Boolean(source.covered) || airborne || !hazardBlocksLane(obstacle, lane);
    if (toMs < closesMs) { obstacle.status = 'crossing'; return obstacle; }
    if (!obstacle.covered) {
      if (obstacle.kind === 'river') drowned = true;
      else if (!obstacle.hit) { hit = true; obstacle.hit = true; }
    }
    obstacle.status = 'cleared';
    return obstacle;
  });
  return { obstacles, hit, drowned };
}

/** Keep a full jump's time free of enemy contact before and after each hazard. */
export function hasSafeHazardArrival(enemy: GameBody, hazards: TrailHazard[], speed: number, config: RunConfig): boolean {
  if (enemy.kind === 'boss' || enemy.z > config.playerZ + config.playerRadius) return true;
  const trailSpeed = Math.max(2, speed);
  const enemySpeed = Math.max(2, speed + (enemy.kind ? config.enemyTypes[enemy.kind].approachSpeed : 0));
  const enemyReach = config.playerRadius + (enemy.kind ? config.enemyTypes[enemy.kind].radius : config.enemyRadius);
  const enemyEnter = (config.playerZ - enemyReach - enemy.z) / enemySpeed;
  const enemyExit = (config.playerZ + enemyReach - enemy.z) / enemySpeed;
  const padding = config.jump.durationMs / 1000;
  return hazards.every(hazard => {
    if (hazard.status === 'cleared') return true;
    const reach = hazardReach(hazard, config);
    const enter = (config.playerZ - reach - hazard.z) / trailSpeed;
    const exit = (config.playerZ + reach - hazard.z) / trailSpeed;
    return enemyExit < enter - padding || enemyEnter > exit + padding;
  });
}
