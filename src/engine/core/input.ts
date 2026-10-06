/**
 * Turns body signals (and a keyboard fallback) into the two values the game
 * reducer wants: which lane, and whether the player is shooting. The march is
 * constant, so jogging controls the gun, not the legs.
 *
 * The lateral detector already emits exactly three states, so the mapping is
 * ABSOLUTE -- LEFT is lane 0, CENTRE is lane 1, RIGHT is lane 2. Nothing here
 * accumulates or steps, which is what makes the lean position and the lane index
 * impossible to drift apart. The keyboard, having no absolute position to read,
 * steps relatively and hands control back the moment the body moves again.
 */

import { CONFIG } from '@/engine/config';
import { LATERAL } from '@/engine/detectors/lateral';
import { clampLane } from '@/engine/core/state';
import type { GameConfig, GameInput, InputHandle, LateralLabel } from '@/engine/types';

const KEY_LEFT = new Set(['ArrowLeft', 'a', 'A']);
const KEY_RIGHT = new Set(['ArrowRight', 'd', 'D']);

const POSE_LANES: Record<LateralLabel, number> = {
  [LATERAL.LEFT]: 0,
  [LATERAL.CENTER]: 1,
  [LATERAL.RIGHT]: 2,
};

export function createInput(config: GameConfig = CONFIG.game): InputHandle {
  let lane = clampLane((config.laneCount - 1) / 2, config);
  let isFiring = true; // Keyboard-only play still shoots, so it is playable solo.
  let lastPoseLabel: LateralLabel | null = null;
  let hasPose = false;
  let devFire = false;
  let pendingJump = false;
  let detachKeyboard: () => void = () => {};

  /** `label` is null when no body is tracked. */
  function setPose(label: LateralLabel | null, isJogging: boolean): void {
    hasPose = true;
    isFiring = Boolean(isJogging);

    // Only a CHANGE of label takes the lane back from the keyboard, so tapping a
    // key while standing centred does not fight the detector every frame.
    if (label !== null && label !== lastPoseLabel) {
      const poseLane = POSE_LANES[label];
      if (poseLane !== undefined) lane = clampLane(poseLane, config);
    }
    lastPoseLabel = label;
  }

  /** No body tracked: hold the last lane and hold fire. The march continues. */
  function clearPose(): void {
    pendingJump = false;
    hasPose = true;
    isFiring = false;
    lastPoseLabel = null;
  }

  function step(delta: number): void {
    lane = clampLane(lane + delta, config);
    // The next differing pose label wins the lane back.
    lastPoseLabel = null;
    if (!hasPose) isFiring = true;
  }

  function attachKeyboard(target: EventTarget = window): () => void {
    const onKeyDown = (event: Event) => {
      const key = event as KeyboardEvent;
      const focusedControl = key.target instanceof HTMLElement
        && key.target.closest('button, input, select, textarea, a');
      if (focusedControl) return;
      if (['ArrowUp', 'w', 'W', 'j', 'J'].includes(key.key)) {
        if (!key.repeat) pendingJump = true;
        key.preventDefault();
        return;
      }
      if (key.key === ' ') {
        devFire = true;
        key.preventDefault();
        return;
      }
      if (key.repeat) return;
      if (KEY_LEFT.has(key.key)) {
        step(-1);
        key.preventDefault();
      } else if (KEY_RIGHT.has(key.key)) {
        step(1);
        key.preventDefault();
      }
    };
    const onKeyUp = (event: Event) => {
      if ((event as KeyboardEvent).key === ' ') devFire = false;
    };
    const onBlur = () => {
      devFire = false;
      pendingJump = false;
    };

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
    detachKeyboard = () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      devFire = false;
    };
    return detachKeyboard;
  }

  function read(): GameInput {
    const jump = pendingJump;
    pendingJump = false;
    return { lane, isFiring: isFiring || devFire, ...(jump ? { jump: true } : {}) };
  }

  function reset(): void {
    pendingJump = false;
    lane = clampLane((config.laneCount - 1) / 2, config);
    lastPoseLabel = null;
    devFire = false;
    if (!hasPose) isFiring = true;
  }

  return {
    requestJump: () => { pendingJump = true; },
    setPose, clearPose, attachKeyboard, detach: () => detachKeyboard(), read, reset, step,
    setDevFire: (active) => { devFire = active; },
  };
}
