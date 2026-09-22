/**
 * One-way sync: game state -> Three.js meshes. Holds no state of its own, so the
 * scene can always be rebuilt from the reducer alone.
 *
 * Every scrolling layer shares one contract -- `{ items: [{ mesh, baseZ }], span,
 * startZ }` -- so markers, motes and any future layer all recycle through the
 * same function. Instanced scatter recycles itself, since it writes into an
 * instance buffer rather than moving Object3Ds.
 */

import type * as THREE_NS from 'three';

import type { createScene } from '@/engine/render/scene';
import type { EnemyPool } from '@/engine/render/actors/enemies';
import type { PlayerRefs } from '@/engine/render/actors/player';
import type { GameBody, GameConfig, GameState, ScrollLayer } from '@/engine/types';

/** Everything createScene hands back. The sync layer only ever reads from it. */
export type SceneRefs = Awaited<ReturnType<typeof createScene>>;

/** A pooled bullet: a pivot that moves, and a blade that tumbles inside it. */
interface BulletSlot {
  mesh: THREE_NS.Object3D;
  blade: THREE_NS.Mesh;
}

/** Motes add drift on top of the shared recycling contract. */
interface MoteLayer extends ScrollLayer {
  items: (ScrollLayer['items'][number] & { initialY: number; initialX: number; phase: number })[];
}

import { CONFIG } from '@/engine/config';
import { laneToX, isInvulnerable } from '@/engine/core/state';

/** Blink cycle while the grace window is open. */
const BLINK_PERIOD_MS = 160;
const BLINK_OPACITY = 0.25;
const LANE_LERP = 0.35;

export function syncScene(
  sceneRefs: SceneRefs,
  state: GameState,
  dtMs = 16.67,
  config: GameConfig = CONFIG.game,
  actorsVisible = true,
): void {
  const dtSec = Math.min(dtMs / 1000, 0.1);

  if (state.justHit) sceneRefs.cameraFeedback?.hit();
  sceneRefs.cameraFeedback?.update(dtSec);

  if (sceneRefs.player) {
    sceneRefs.player.group.visible = actorsVisible;
  }

  if (actorsVisible) {
    syncPlayer(sceneRefs.player, state, dtSec, config);
    syncEnemies(sceneRefs.enemyPool, state.enemies, state.elapsedMs, dtSec, config);
    stageKills(sceneRefs, state, config);
    sceneRefs.enemyPool?.updateCorpses(dtSec, state.speed);
    sceneRefs.effects?.update(dtSec, state.speed);
    syncBullets(sceneRefs.bulletPool?.items, state.bullets, state.elapsedMs, config);
  } else {
    if (sceneRefs.enemyPool) {
      for (const slot of sceneRefs.enemyPool.items) slot.group.visible = false;
      for (const corpse of sceneRefs.enemyPool.corpses) corpse.group.visible = false;
    }
    if (sceneRefs.bulletPool) {
      for (const slot of sceneRefs.bulletPool.items) slot.mesh.visible = false;
    }
  }

  sceneRefs.trailEdge?.update(state.distance);
  sceneRefs.applyBiome?.(state.distance, state.elapsedMs);
  syncRecycled(sceneRefs.markers as unknown as ScrollLayer, state.distance);
  sceneRefs.scatter?.scroll(state.distance);
  sceneRefs.landmarks?.scroll(state.distance);
  syncMotes(sceneRefs.motes as unknown as MoteLayer, state.distance, state.elapsedMs);
  sceneRefs.clouds?.scroll(state.distance, state.elapsedMs);
}

function syncPlayer(
  player: PlayerRefs | null | undefined,
  state: GameState,
  dtSec: number,
  config: GameConfig,
): void {
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
  } else if (state.isFiring) {
    // `isFiring` IS the jog signal: setPose() derives it from the jog detector.
    // This read used to be `state.isJogging`, a field the reducer never sets, so
    // the faster run cycle never played.
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
function syncEnemies(
  pool: EnemyPool | null | undefined,
  enemies: GameBody[],
  elapsedMs: number,
  dtSec: number,
  config: GameConfig,
): void {
  if (!pool) return;

  let animated = 0;

  for (let index = 0; index < pool.items.length; index += 1) {
    const slot = pool.items[index]!;
    const enemy = enemies[index];

    if (!enemy) {
      slot.group.visible = false;
      continue;
    }

    slot.group.visible = true;
    slot.group.position.x = laneToX(enemy.lane, config);
    slot.group.position.z = enemy.z;

    if (slot.aura) {
      // Threats become louder as they approach without changing collision rules.
      const proximity = Math.min(1, Math.max(0, (enemy.z + 55) / 55));
      const pulse = 1 + Math.sin(elapsedMs * 0.009 + index * 1.7) * 0.12;
      slot.aura.scale.setScalar(pulse * (0.82 + proximity * 0.28));
    }

    if (!pool.isRigged) {
      // The stand-in has nothing to animate, so it tumbles instead.
      if (!slot.spin) continue;
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

function syncBullets(
  pool: BulletSlot[] | null | undefined,
  bullets: GameBody[],
  elapsedMs: number,
  config: GameConfig,
): void {
  if (!pool) return;

  for (let index = 0; index < pool.length; index += 1) {
    const { mesh } = pool[index]!;
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
function stageKills(sceneRefs: SceneRefs, state: GameState, config: GameConfig): void {
  if (state.justKilled.length === 0) return;

  sceneRefs.cameraFeedback?.kill(state.justKilled.length);

  for (const kill of state.justKilled) {
    const x = laneToX(kill.lane, config);
    sceneRefs.enemyPool?.spawnDeath(x, kill.z);
    sceneRefs.effects?.burst(x, config.enemyRadius + 0.6, kill.z);
  }
}

/** Shared by every layer of discrete meshes that scrolls with the run. */
function syncRecycled(layer: ScrollLayer | null | undefined, distance: number): void {
  if (!layer) return;
  const offset = distance % layer.span;

  for (const item of layer.items) {
    const shifted = item.baseZ - layer.startZ + offset;
    item.mesh.position.z = layer.startZ + (shifted % layer.span);
  }
}

/** Dust motes drift as they scroll, so the air does not read as static. */
function syncMotes(motes: MoteLayer | null | undefined, distance: number, elapsedMs: number): void {
  if (!motes) return;
  syncRecycled(motes, distance);

  for (const item of motes.items) {
    item.mesh.position.y = item.initialY + Math.sin(elapsedMs * 0.0025 + item.phase) * 0.35;
    item.mesh.position.x = item.initialX + Math.cos(elapsedMs * 0.0018 + item.phase) * 0.3;
  }
}
