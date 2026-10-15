import { CONFIG } from '@/engine/config';
import { clampLane } from '@/engine/core/state';
import type { GameInput, GameState } from '@/engine/types';

/** Character-only demonstration: no combat, score, health loss or scrolling world. */
export function advanceDemo(state: GameState, input: GameInput, dtMs: number): GameState {
  const dt = Math.min(Math.max(0, dtMs), CONFIG.game.maxFrameMs);
  const elapsedMs = state.elapsedMs + dt;
  const start = input.jump && state.jumpStartedMs === null ? elapsedMs : state.jumpStartedMs;
  const jumpStartedMs = start !== null && elapsedMs - start < CONFIG.game.jump.durationMs ? start : null;
  const jumpHeight = jumpStartedMs === null ? 0 : Math.sin((elapsedMs - jumpStartedMs) / CONFIG.game.jump.durationMs * Math.PI) * CONFIG.game.jump.height;
  const cadence = Math.max(0, input.cadenceSpm ?? 0);
  const speed = Math.min(CONFIG.game.maxCadenceSpeed, cadence / CONFIG.game.cadenceForMaxSpeed * CONFIG.game.maxCadenceSpeed);
  const bullets = state.bullets.map(b => ({ ...b, previousZ: b.z, z: b.z - CONFIG.game.bulletSpeed * dt / 1000 }))
    .filter(b => b.z > -25);
  const steps = Math.min(CONFIG.game.bulletPoolSize, Math.max(0, Math.floor(input.stepEvents ?? 0)));
  for (let i = 0; i < steps; i++) bullets.push({ lane: input.lane, z: CONFIG.game.playerZ - CONFIG.game.playerRadius, previousZ: CONFIG.game.playerZ - CONFIG.game.playerRadius });
  return { ...state, elapsedMs, lane: clampLane(input.lane), speed, distance: 0,
    movementMs: state.movementMs + (speed > 0 ? dt : 0), jumpStartedMs, jumpHeight,
    jumpCount: state.jumpCount + Number(start === elapsedMs), isShielding: Boolean(input.isShielding),
    bullets, justFired: steps > 0, isFiring: steps > 0 };
}
