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

import { CONFIG } from '../config.js';
import { LATERAL } from '../detectors/lateral.js';
import { clampLane } from './state.js';

const KEY_LEFT = new Set(['ArrowLeft', 'a', 'A']);
const KEY_RIGHT = new Set(['ArrowRight', 'd', 'D']);

const POSE_LANES = {
  [LATERAL.LEFT]: 0,
  [LATERAL.CENTER]: 1,
  [LATERAL.RIGHT]: 2,
};

export function createInput(config = CONFIG.game) {
  let lane = clampLane((config.laneCount - 1) / 2, config);
  let isFiring = true; // Keyboard-only play still shoots, so it is playable solo.
  let lastPoseLabel = null;
  let hasPose = false;
  let detachKeyboard = () => {};

  /** @param {string|null} label A LATERAL.* value, or null when no body is tracked. */
  function setPose(label, isJogging) {
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
  function clearPose() {
    hasPose = true;
    isFiring = false;
    lastPoseLabel = null;
  }

  function step(delta) {
    lane = clampLane(lane + delta, config);
    // The next differing pose label wins the lane back.
    lastPoseLabel = null;
    if (!hasPose) isFiring = true;
  }

  function attachKeyboard(target = window) {
    const onKeyDown = (event) => {
      if (event.repeat) return;
      if (KEY_LEFT.has(event.key)) {
        step(-1);
        event.preventDefault();
      } else if (KEY_RIGHT.has(event.key)) {
        step(1);
        event.preventDefault();
      }
    };

    target.addEventListener('keydown', onKeyDown);
    detachKeyboard = () => target.removeEventListener('keydown', onKeyDown);
    return detachKeyboard;
  }

  function read() {
    return { lane, isFiring };
  }

  function reset() {
    lane = clampLane((config.laneCount - 1) / 2, config);
    lastPoseLabel = null;
    if (!hasPose) isFiring = true;
  }

  return { setPose, clearPose, attachKeyboard, detach: () => detachKeyboard(), read, reset, step };
}
