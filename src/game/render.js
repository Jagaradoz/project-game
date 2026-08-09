/**
 * One-way sync: game state -> Three.js meshes. Holds no state of its own, so the
 * scene can always be rebuilt from the reducer alone.
 *
 * The player's x is ASSIGNED from the lane, never tweened towards it. A lane
 * change is one frame, hard, exactly on centre -- that is the snap the game is
 * built around.
 */

import { CONFIG } from '../config.js';
import { laneToX, isInvulnerable } from './state.js';

/** Blink cycle while the grace window is open. */
const BLINK_PERIOD_MS = 160;
const BLINK_OPACITY = 0.25;

export function syncScene(sceneRefs, state, config = CONFIG.game) {
  syncPlayer(sceneRefs.player, state, config);
  syncPool(sceneRefs.enemyPool, state.enemies, config);
  syncPool(sceneRefs.bulletPool, state.bullets, config);
  syncDashes(sceneRefs.dashes, state.distance);
}

function syncPlayer(player, state, config) {
  player.position.x = laneToX(state.lane, config);
  player.position.z = config.playerZ;

  const isBlinkOn = Math.floor(state.elapsedMs / BLINK_PERIOD_MS) % 2 === 1;
  player.material.opacity = isInvulnerable(state) && isBlinkOn ? BLINK_OPACITY : 1;
}

/** Bodies are interchangeable, so one loop drives both the enemy and bullet pools. */
function syncPool(pool, bodies, config) {
  for (let index = 0; index < pool.length; index += 1) {
    const mesh = pool[index];
    const body = bodies[index];

    if (!body) {
      mesh.visible = false;
      continue;
    }

    mesh.visible = true;
    mesh.position.x = laneToX(body.lane, config);
    mesh.position.z = body.z;
  }
}

/** Dashes wrap through a fixed span, so a handful of boxes read as endless road. */
function syncDashes(dashes, distance) {
  const offset = distance % dashes.span;

  for (const dash of dashes.items) {
    const shifted = dash.baseZ - dashes.startZ + offset;
    dash.mesh.position.z = dashes.startZ + (shifted % dashes.span);
  }
}
