/**
 * One-way sync: game state -> Three.js low-poly meshes. Holds no state of its own,
 * so the scene can always be rebuilt from the reducer alone.
 *
 * Handles smooth forward movement recycling for road segments, curbs, roadside
 * scenery props, lane dashes, and background mountain parallax.
 */

import { CONFIG } from '../config.js?v=1.8.1';
import { laneToX, isInvulnerable } from './state.js?v=1.8.1';

/** Blink cycle while the grace window is open. */
const BLINK_PERIOD_MS = 160;
const BLINK_OPACITY = 0.25;

export function syncScene(sceneRefs, state, dtMs = 16.67, config = CONFIG.game) {
  const dtSec = Math.min(dtMs / 1000, 0.1);
  syncPlayer(sceneRefs.player, state, dtSec, config);
  syncEnemies(sceneRefs.enemyPool, state.enemies, state.elapsedMs, config);
  syncBullets(sceneRefs.bulletPool, state.bullets, config);
  syncDashes(sceneRefs.dashes, state.distance);
  syncRoadSegments(sceneRefs.roadSegments, state.distance);
  syncScenery(sceneRefs.scenery, state.distance);
  syncFireflies(sceneRefs.fireflies, state.distance, state.elapsedMs);
  syncMountains(sceneRefs.mountains, state.distance);
}

function syncPlayer(player, state, dtSec, config) {
  if (!player) return;

  const targetX = laneToX(state.lane, config);
  const currentX = player.group.position.x;

  // Smooth position interpolation
  player.group.position.x += (targetX - currentX) * 0.35;
  player.group.position.z = config.playerZ;

  // Dynamic banking tilt when switching lanes
  const deltaX = targetX - currentX;
  const targetRoll = -deltaX * 0.25;
  player.group.rotation.z += (targetRoll - player.group.rotation.z) * 0.2;
  const targetYaw = deltaX * 0.15;
  player.group.rotation.y += (targetYaw - player.group.rotation.y) * 0.2;

  // Invulnerability blink across all active character materials
  const isBlinkOn = Math.floor(state.elapsedMs / BLINK_PERIOD_MS) % 2 === 1;
  const opacity = isInvulnerable(state) && isBlinkOn ? BLINK_OPACITY : 1;
  if (player.materials) {
    for (const mat of player.materials) {
      mat.opacity = opacity;
    }
  }

  // Skeletal animation mixer update
  if (player.mixer) {
    player.mixer.update(dtSec);
  }

  // Animation state transitions
  if (state.isOver) {
    player.playAnimation?.('death', 0.2, false);
  } else if (state.isJogging) {
    player.playAnimation?.('run', 0.15, true);
    if (player.currentAction) {
      player.currentAction.timeScale = 1.35;
    }
  } else {
    player.playAnimation?.('run', 0.2, true);
    if (player.currentAction) {
      player.currentAction.timeScale = 1.0;
    }
  }

  // Procedural geometric animation if fallback / orb is active
  if (player.fallbackVisible) {
    if (player.ring) {
      player.ring.rotation.z = state.elapsedMs * 0.003;
    }
    if (player.body) {
      player.body.rotation.y = state.elapsedMs * 0.0015;
      player.body.rotation.x = Math.sin(state.elapsedMs * 0.008) * 0.08;
    }
  }
}

/** Enemies rotate slowly to feel like active low-poly combat drones. */
function syncEnemies(pool, enemies, elapsedMs, config) {
  for (let index = 0; index < pool.length; index += 1) {
    const mesh = pool[index];
    const enemy = enemies[index];

    if (!enemy) {
      mesh.visible = false;
      continue;
    }

    mesh.visible = true;
    mesh.position.x = laneToX(enemy.lane, config);
    mesh.position.z = enemy.z;
    mesh.rotation.y = elapsedMs * 0.003 + index;
    mesh.rotation.x = elapsedMs * 0.002 + index;
  }
}

function syncBullets(pool, bullets, config) {
  for (let index = 0; index < pool.length; index += 1) {
    const mesh = pool[index];
    const bullet = bullets[index];

    if (!bullet) {
      mesh.visible = false;
      continue;
    }

    mesh.visible = true;
    mesh.position.x = laneToX(bullet.lane, config);
    mesh.position.z = bullet.z;
  }
}

/** Recycled lane markings. */
function syncDashes(dashes, distance) {
  if (!dashes) return;
  const offset = distance % dashes.span;

  for (const dash of dashes.items) {
    const shifted = dash.baseZ - dashes.startZ + offset;
    dash.mesh.position.z = dashes.startZ + (shifted % dashes.span);
  }
}

/** Road segments and hazard curbs scroll smoothly with distance. */
function syncRoadSegments(roadSegments, distance) {
  if (!roadSegments) return;
  const offset = distance % roadSegments.span;

  for (const segment of roadSegments.items) {
    const shifted = segment.baseZ - roadSegments.startZ + offset;
    segment.group.position.z = roadSegments.startZ + (shifted % roadSegments.span);
  }
}

/** Roadside low-poly trees, rocks, and light pylons recycled smoothly. */
function syncScenery(scenery, distance) {
  if (!scenery) return;
  const offset = distance % scenery.span;

  for (const item of scenery.items) {
    const shifted = item.baseZ - scenery.startZ + offset;
    item.group.position.z = scenery.startZ + (shifted % scenery.span);
  }
}

/** Floating woodland fireflies with undulating wave motion. */
function syncFireflies(fireflies, distance, elapsedMs) {
  if (!fireflies) return;
  const offset = distance % fireflies.span;

  for (const item of fireflies.items) {
    const shifted = item.baseZ - fireflies.startZ + offset;
    item.mesh.position.z = fireflies.startZ + (shifted % fireflies.span);
    item.mesh.position.y = item.initialY + Math.sin(elapsedMs * 0.0025 + item.phase) * 0.35;
    item.mesh.position.x = item.initialX + Math.cos(elapsedMs * 0.0018 + item.phase) * 0.3;
  }
}

/** Horizon mountains with subtle parallax scrolling. */
function syncMountains(mountains, distance) {
  if (!mountains) return;
  const parallaxDistance = distance * 0.12;
  const offset = parallaxDistance % mountains.span;

  for (const item of mountains.items) {
    const shifted = item.baseZ - mountains.startZ + offset;
    item.group.position.z = mountains.startZ + (shifted % mountains.span);
  }
}
