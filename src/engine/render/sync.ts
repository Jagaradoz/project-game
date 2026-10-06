/**
 * One-way sync: game state -> Three.js meshes. Holds no state of its own, so the
 * scene can always be rebuilt from the reducer alone.
 *
 * Every scrolling layer shares one contract -- `{ items: [{ mesh, baseZ }], span,
 * startZ }` -- so markers, motes and any future layer all recycle through the
 * same function. Instanced scatter recycles itself, since it writes into an
 * instance buffer rather than moving Object3Ds.
 */


import type { createScene } from '@/engine/render/scene';
import type { PlayerRefs } from '@/engine/render/actors/player';
import type { GameConfig, GameState, ScrollLayer } from '@/engine/types';

/** Everything createScene hands back. The sync layer only ever reads from it. */
export type SceneRefs = Awaited<ReturnType<typeof createScene>>;

/** Motes add drift on top of the shared recycling contract. */
interface MoteLayer extends ScrollLayer {
  items: (ScrollLayer['items'][number] & { initialY: number; initialX: number; phase: number })[];
}

import { CONFIG } from '@/engine/config';
import { laneToX, isInvulnerable } from '@/engine/core/state';
import { TRAIL_Y } from '@/engine/render/world/ground';

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
  const newEvents = sceneRefs.lastEventsMs !== state.elapsedMs;

  if (newEvents && state.justHit) sceneRefs.cameraFeedback?.hit();
  sceneRefs.cameraFeedback?.update(dtSec);

  if (sceneRefs.player) {
    sceneRefs.player.group.visible = actorsVisible;
  }

  if (actorsVisible) {
    syncPlayer(sceneRefs.player, newEvents ? state : { ...state, justHit: false, justFired: false }, dtSec, config);
    sceneRefs.enemyPool?.sync(state.enemies, state.elapsedMs, dtSec, state.bossWarningLane !== null);
    sceneRefs.obstaclePool?.sync(state.obstacles, state.elapsedMs);
    if (newEvents) stageKills(sceneRefs, state, config);
    sceneRefs.enemyPool?.updateCorpses(dtSec, state.speed);
    sceneRefs.effects?.update(dtSec, state.speed);
    sceneRefs.bulletPool?.sync(state, dtSec, sceneRefs.player?.characterId ?? config.defaultCharacter);
  } else {
    if (sceneRefs.enemyPool) {
      for (const slot of sceneRefs.enemyPool.items) slot.group.visible = false;
      for (const corpse of sceneRefs.enemyPool.corpses) corpse.group.visible = false;
    }
    if (sceneRefs.bulletPool) {
      for (const slot of sceneRefs.bulletPool.items) slot.mesh.visible = false;
    }
    sceneRefs.obstaclePool?.hide();
    sceneRefs.bulletPool?.hide();
  }

  sceneRefs.trailEdge?.update(state.distance);
  syncRecycled(sceneRefs.markers as unknown as ScrollLayer, state.distance);
  sceneRefs.scatter?.scroll(state.distance);
  sceneRefs.landmarks?.scroll(state.distance);
  syncMotes(sceneRefs.motes as unknown as MoteLayer, state.distance, state.elapsedMs);
  sceneRefs.clouds?.scroll(state.distance, state.elapsedMs);
  sceneRefs.lastEventsMs = state.elapsedMs;
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
  player.group.position.y = TRAIL_Y + state.jumpHeight;

  // Bank into a lane change, then settle back upright.
  const deltaX = targetX - currentX;
  const targetRoll = -deltaX * 0.25;
  player.group.rotation.z += (targetRoll - player.group.rotation.z) * 0.2;
  const targetYaw = deltaX * 0.15;
  player.group.rotation.y += (targetYaw - player.group.rotation.y) * 0.2;

  const isBlinkOn = Math.floor(state.elapsedMs / BLINK_PERIOD_MS) % 2 === 1;
  const opacity = !state.isOver && isInvulnerable(state) && isBlinkOn ? BLINK_OPACITY : 1;
  if (player.materials) {
    for (const material of player.materials) material.opacity = opacity;
  }

  updatePlayerAnimation(player, state, dtSec);

  if (player.fallbackVisible) {
    if (player.ring) player.ring.rotation.z = state.elapsedMs * 0.003;
    if (player.body) {
      player.body.rotation.y = state.elapsedMs * 0.0015;
      player.body.rotation.x = Math.sin(state.elapsedMs * 0.008) * 0.08;
    }
  }
}

/** Each actual shot starts a fresh attack; rapid shots cut off the prior swing. */
export function updatePlayerAnimation(
  player: PlayerRefs,
  state: Pick<GameState, 'isOver' | 'isFiring' | 'justFired'> & Partial<Pick<GameState, 'isCleared' | 'justHit' | 'jumpStartedMs'>>,
  dtSec: number,
): void {
  if (state.isOver) {
    player.playAnimation(state.isCleared ? 'idle' : 'death', 0.2, Boolean(state.isCleared));
  } else if (state.justHit) {
    player.playAnimation('hit', .04, false, true);
  } else if (player.currentActionName === 'hit' && player.currentAction?.isRunning()) {
    // Complete recoil even when the jogging detector keeps firing.
  } else if (state.jumpStartedMs != null) {
    player.playAnimation('jump', .06, false);
  } else if (state.justFired) {
    player.playAnimation('shoot', 0.06, false, true);
  } else if (player.currentActionName !== 'shoot' || !player.currentAction?.isRunning()) {
    player.playAnimation('run', 0.1, true);
  }
  player.mixer?.update(dtSec);
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
    sceneRefs.enemyPool?.spawnDeath(x, kill.z, kill.kind);
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
