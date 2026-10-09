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

import { CONFIG } from '@/engine/config';
import { ema, pushWithinWindow, cadenceSpm } from '@/engine/util/smooth';
import { measureBody } from '@/engine/util/landmarks';
import type { JogConfig, JogState, PoseLandmarks, UpKnee as UpKneeSide } from '@/engine/types';

export const UP_KNEE = { LEFT: 'LEFT', RIGHT: 'RIGHT', NONE: null } as const;

export function createJogState(): JogState {
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

export function updateJog(
  state: JogState,
  landmarks: PoseLandmarks | null | undefined,
  nowMs: number,
  config: JogConfig = CONFIG.jog,
): JogState {
  const body = measureBody(landmarks);

  // Missing knees reset the phase so returning on the other foot cannot invent
  // a step. Recent real steps still time out normally.
  if (!body || !body.kneesVisible || !body.leftKnee || !body.rightKnee) {
    return {
      ...state,
      hasKnees: false,
      kneeDelta: 0,
      upKnee: UP_KNEE.NONE,
      peakSinceTransition: 0,
      ...deriveJogging(state.stepTimestamps, nowMs, config),
    };
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
function classifyUpKnee(kneeDelta: number, currentUpKnee: UpKneeSide, config: JogConfig): UpKneeSide {
  if (kneeDelta > config.crossThreshold) return UP_KNEE.LEFT;
  if (kneeDelta < -config.crossThreshold) return UP_KNEE.RIGHT;
  return currentUpKnee;
}

/**
 * Jogging requires enough alternations recently, at a cadence a human could
 * actually produce, with the most recent step not yet stale.
 */
function deriveJogging(
  stepTimestamps: number[],
  nowMs: number,
  config: JogConfig,
): { isJogging: boolean; cadenceSpm: number } {
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
