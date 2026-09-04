/**
 * One-way sync: game state -> Three.js meshes. Holds no state of its own, so the
 * scene can always be rebuilt from the reducer alone.
 *
 * Every scrolling layer shares one contract -- `{ items: [{ mesh, baseZ }], span,
 * startZ }` -- so markers, motes and any future layer all recycle through the
 * same function. Instanced scatter recycles itself, since it writes into an
 * instance buffer rather than moving Object3Ds.
 */

import { CONFIG } from '../config.js?v=1.11.0';
import { laneToX, isInvulnerable } from './state.js?v=1.11.0';

/** Blink cycle while the grace window is open. */
const BLINK_PERIOD_MS = 160;
const BLINK_OPACITY = 0.25;
const LANE_LERP = 0.35;

export function syncScene(sceneRefs, state, dtMs = 16.67, config = CONFIG.game) {
  const dtSec = Math.min(dtMs / 1000, 0.1);

  syncPlayer(sceneRefs.player, state, dtSec, config);
  syncEnemies(sceneRefs.enemyPool, state.enemies, state.elapsedMs, dtSec, config);
  stageKills(sceneRefs, state, config);
  sceneRefs.enemyPool?.updateCorpses(dtSec, state.speed);
  sceneRefs.effects?.update(dtSec, state.speed);
  syncBullets(sceneRefs.bulletPool?.items, state.bullets, state.elapsedMs, config);

  sceneRefs.trailEdge?.update(state.distance);
  sceneRefs.applyBiome?.(state.distance, state.elapsedMs);
  syncRecycled(sceneRefs.markers, state.distance);
  sceneRefs.scatter?.scroll(state.distance);
  syncMotes(sceneRefs.motes, state.distance, state.elapsedMs);
  sceneRefs.clouds?.scroll(state.distance, state.elapsedMs);
}

function syncPlayer(player, state, dtSec, config) {
  if (!player) return;

  const targetX = laneToX(state.lane, config);
  const currentX = player.group.position.x;

  player.group.position.x += (targetX - currentX) * LANE_LERP;
  player.group.position.z = config.playerZ;

  // Bank into a lane change, then settle back upright.
  const deltaX = targetX - currentX;
  const targetRoll = -deltaX * 0.25;
  player.group.rotation.z += (targetRoll - player.group.rotation.z) * 0.2;
  const targetYaw = deltaX * 0.15;
  player.group.rotation.y += (targetYaw - player.group.rotation.y) * 0.2;

  const isBlinkOn = Math.floor(state.elapsedMs / BLINK_PERIOD_MS) % 2 === 1;
  const opacity = isInvulnerable(state) && isBlinkOn ? BLINK_OPACITY : 1;
  if (player.materials) {
    for (const material of player.materials) material.opacity = opacity;
  }

  if (player.mixer) player.mixer.update(dtSec);

  if (state.isOver) {
    player.playAnimation?.('death', 0.2, false);
  } else if (state.isJogging) {
    player.playAnimation?.('run', 0.15, true);
    if (player.currentAction) player.currentAction.timeScale = 1.35;
  } else {
    player.playAnimation?.('run', 0.2, true);
    if (player.currentAction) player.currentAction.timeScale = 1.0;
  }

  if (player.fallbackVisible) {
    if (player.ring) player.ring.rotation.z = state.elapsedMs * 0.003;
    if (player.body) {
      player.body.rotation.y = state.elapsedMs * 0.0015;
      player.body.rotation.x = Math.sin(state.elapsedMs * 0.008) * 0.08;
    }
  }
}

/**
 * Enemies are skinned meshes, so the work is capped: the pool is walked in order
 * and only the first few close enough to read get their mixer stepped. Anything
 * further away holds its pose.
 */
function syncEnemies(pool, enemies, elapsedMs, dtSec, config) {
  if (!pool) return;

  let animated = 0;

  for (let index = 0; index < pool.items.length; index += 1) {
    const slot = pool.items[index];
    const enemy = enemies[index];

    if (!enemy) {
      slot.group.visible = false;
      continue;
    }

    slot.group.visible = true;
    slot.group.position.x = laneToX(enemy.lane, config);
    slot.group.position.z = enemy.z;

    if (!pool.isRigged) {
      // The stand-in has nothing to animate, so it tumbles instead.
      slot.spin.rotation.y = elapsedMs * 0.003 + index;
      slot.spin.rotation.x = elapsedMs * 0.002 + index;
      continue;
    }

    if (slot.mixer && animated < pool.animatedCount && enemy.z > pool.animateBeyondZ) {
      slot.mixer.update(dtSec);
      animated += 1;
    }
  }
}

function syncBullets(pool, bullets, elapsedMs, config) {
  if (!pool) return;

  for (let index = 0; index < pool.length; index += 1) {
    const { mesh } = pool[index];
    const bullet = bullets[index];

    if (!bullet) {
      mesh.visible = false;
      continue;
    }

    mesh.visible = true;
    mesh.position.x = laneToX(bullet.lane, config);
    mesh.position.z = bullet.z;
    // Tumbling, so a thrown blade does not slide through the air rigid.
    mesh.rotation.z = elapsedMs * 0.02 + index;
  }
}

/**
 * Turns the frame's kills into something you can see: a body that falls where it
 * stood, and a burst of bone chips. The reducer reports the positions because an
 * enemy is gone from its list by the time we get here.
 */
function stageKills(sceneRefs, state, config) {
  if (state.justKilled.length === 0) return;

  for (const kill of state.justKilled) {
    const x = laneToX(kill.lane, config);
    sceneRefs.enemyPool?.spawnDeath(x, kill.z);
    sceneRefs.effects?.burst(x, config.enemyRadius + 0.6, kill.z);
  }
}

/** Shared by every layer of discrete meshes that scrolls with the run. */
function syncRecycled(layer, distance) {
  if (!layer) return;
  const offset = distance % layer.span;

  for (const item of layer.items) {
    const shifted = item.baseZ - layer.startZ + offset;
    item.mesh.position.z = layer.startZ + (shifted % layer.span);
  }
}

/** Dust motes drift as they scroll, so the air does not read as static. */
function syncMotes(motes, distance, elapsedMs) {
  if (!motes) return;
  syncRecycled(motes, distance);

  for (const item of motes.items) {
    item.mesh.position.y = item.initialY + Math.sin(elapsedMs * 0.0025 + item.phase) * 0.35;
    item.mesh.position.x = item.initialX + Math.cos(elapsedMs * 0.0018 + item.phase) * 0.3;
  }
}
