import type { GameBody, RunConfig, TrailHazard } from '@/engine/types';

export function hazardBlocksLane(hazard: TrailHazard, lane: number): boolean {
  return lane >= hazard.startLane && lane < hazard.startLane + hazard.laneCount;
}

function heightAt(timeMs: number, startedMs: number | null, config: RunConfig): number {
  if (startedMs === null) return 0;
  const phase = (timeMs - startedMs) / config.jump.durationMs;
  return phase <= 0 || phase >= 1 ? 0 : Math.sin(Math.PI * phase) * config.jump.height;
}

/** Test the whole portion of a swept crossing that overlaps this frame. */
export function advanceHazards(
  hazards: TrailHazard[], lane: number, deltaZ: number,
  fromMs: number, toMs: number, jumpStartedMs: number | null, config: RunConfig,
): { obstacles: TrailHazard[]; hit: boolean; drowned: boolean } {
  let hit = false;
  let drowned = false;
  const obstacles = hazards.map(source => {
    const reach = config.playerRadius + (source.kind === 'river' ? config.obstacle.riverRadius : config.obstacle.radius);
    const entryZ = config.playerZ - reach;
    const exitZ = config.playerZ + reach;
    const obstacle = { ...source, previousZ: source.z, z: source.z + deltaZ };
    if (source.status === 'cleared') return obstacle;
    const contact = obstacle.z >= entryZ && source.z <= exitZ;
    if (contact && hazardBlocksLane(obstacle, lane)) {
      const enter = deltaZ > 0 ? Math.max(0, (entryZ - source.z) / deltaZ) : 0;
      const exit = deltaZ > 0 ? Math.min(1, (exitZ - source.z) / deltaZ) : 1;
      const startHeight = heightAt(fromMs + enter * (toMs - fromMs), jumpStartedMs, config);
      const endHeight = heightAt(fromMs + exit * (toMs - fromMs), jumpStartedMs, config);
      // The sine flight arc is concave: its minimum over contact is an endpoint.
      if (Math.min(startHeight, endHeight) < config.jump.clearance) {
        if (obstacle.kind === 'river') drowned = true;
        else if (!obstacle.hit) { hit = true; obstacle.hit = true; }
      }
    }
    obstacle.status = obstacle.z > exitZ ? 'cleared' : contact ? 'crossing' : 'approaching';
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
    const hazardReach = config.playerRadius + (hazard.kind === 'river' ? config.obstacle.riverRadius : config.obstacle.radius);
    const enter = (config.playerZ - hazardReach - hazard.z) / trailSpeed;
    const exit = (config.playerZ + hazardReach - hazard.z) / trailSpeed;
    return enemyExit < enter - padding || enemyEnter > exit + padding;
  });
}
