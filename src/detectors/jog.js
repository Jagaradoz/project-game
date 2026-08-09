/**
 * Jogging-in-place detector.
 *
 * A naive "knee went up" test fires on squats, on bobbing, and on the subject
 * walking toward the camera. The signal used here is the DIFFERENCE between the
 * two knees instead:
 *
 *     kneeDelta = (rightKnee.y - leftKnee.y) / torsoLength
 *
 * Symmetric motion (squat, bob, camera shake) cancels out of a difference;
 * alternating motion does not. Dividing by torso length keeps the thresholds
 * independent of distance from the camera. Positive delta means the LEFT knee is
 * higher, because image y grows downward.
 *
 * Pure reducer, same as the lateral detector.
 */

import { CONFIG } from '../config.js';
import { ema, pushWithinWindow, cadenceSpm } from '../util/smooth.js';
import { measureBody } from '../util/landmarks.js';

export const UP_KNEE = { LEFT: 'LEFT', RIGHT: 'RIGHT', NONE: null };

export function createJogState() {
  return {
    isJogging: false,
    cadenceSpm: 0,
    kneeDelta: 0,
    upKnee: UP_KNEE.NONE,
    peakSinceTransition: 0,
    stepTimestamps: [],
    stepCount: 0,
    hasKnees: false,
  };
}

export function updateJog(state, landmarks, nowMs, config = CONFIG.jog) {
  const body = measureBody(landmarks);

  // Knees out of frame or low confidence: keep the state machine frozen but let
  // the jogging flag time out on its own, so it cannot latch on forever.
  if (!body || !body.kneesVisible) {
    return { ...state, hasKnees: false, ...deriveJogging(state.stepTimestamps, nowMs, config) };
  }

  const rawDelta = (body.rightKnee.y - body.leftKnee.y) / body.torsoLength;
  const kneeDelta = ema(state.kneeDelta, rawDelta, config.smoothing);
  const candidate = classifyUpKnee(kneeDelta, state.upKnee, config);

  const isTransition = candidate !== state.upKnee;
  // Only commit a step if the state we are LEAVING actually reached a real
  // amplitude. This is what rejects small sways that merely graze the threshold.
  const isRealStep =
    isTransition && state.upKnee !== UP_KNEE.NONE && state.peakSinceTransition >= config.peakThreshold;

  const stepTimestamps = isRealStep
    ? pushWithinWindow(state.stepTimestamps, nowMs, config.windowMs)
    : state.stepTimestamps.filter((t) => nowMs - t <= config.windowMs);

  return {
    ...state,
    hasKnees: true,
    kneeDelta,
    upKnee: candidate,
    peakSinceTransition: isTransition
      ? Math.abs(kneeDelta)
      : Math.max(state.peakSinceTransition, Math.abs(kneeDelta)),
    stepTimestamps,
    stepCount: state.stepCount + (isRealStep ? 1 : 0),
    ...deriveJogging(stepTimestamps, nowMs, config),
  };
}

/** Which knee is up, holding the previous answer inside the dead zone. */
function classifyUpKnee(kneeDelta, currentUpKnee, config) {
  if (kneeDelta > config.crossThreshold) return UP_KNEE.LEFT;
  if (kneeDelta < -config.crossThreshold) return UP_KNEE.RIGHT;
  return currentUpKnee;
}

/**
 * Jogging requires enough alternations recently, at a cadence a human could
 * actually produce, with the most recent step not yet stale.
 */
function deriveJogging(stepTimestamps, nowMs, config) {
  const recent = stepTimestamps.filter((t) => nowMs - t <= config.windowMs);
  const cadence = cadenceSpm(recent);
  const lastStepMs = recent.length > 0 ? recent[recent.length - 1] : -Infinity;

  const isJogging =
    recent.length >= config.minStepsInWindow &&
    cadence >= config.minCadenceSpm &&
    cadence <= config.maxCadenceSpm &&
    nowMs - lastStepMs < config.timeoutMs;

  return { isJogging, cadenceSpm: cadence };
}
