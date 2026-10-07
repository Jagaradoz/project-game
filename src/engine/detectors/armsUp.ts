/**
 * Both arms raised overhead. Emits a one-frame `justRaised` edge, which the
 * runtime turns into the same jump the body hop triggers. A raise only counts
 * once per lift: both arms have to come back down before the next one fires.
 */

import type { ArmsUpConfig, ArmsUpState, PoseLandmarks } from '@/engine/types';
import { CONFIG, LANDMARK } from '@/engine/config';
import { isVisible, measureBody } from '@/engine/util/landmarks';

export function createArmsUpState(): ArmsUpState {
  return { justRaised: false, raiseCount: 0, isRaised: false, needsLower: false,
    candidateMs: null, loweredMs: null, hasArms: false };
}

export function updateArmsUp(state: ArmsUpState, pose: PoseLandmarks | null | undefined,
  nowMs: number, config: ArmsUpConfig = CONFIG.armsUp): ArmsUpState {
  const body = measureBody(pose);
  const left = pose?.[LANDMARK.LEFT_WRIST];
  const right = pose?.[LANDMARK.RIGHT_WRIST];
  if (!body || !left || !right || !isVisible(left) || !isVisible(right)) {
    // Arms out of frame is what a full overhead reach often looks like, so the
    // raise is not cancelled -- only the pending confirmation is.
    return { ...state, justRaised: false, candidateMs: null, loweredMs: null, hasArms: false };
  }

  const line = body.shoulderMid.y;
  const raiseLine = line - config.minRise * body.torsoLength;
  const bothUp = left.y < raiseLine && right.y < raiseLine;
  const bothDown = left.y > line && right.y > line;

  if (state.needsLower) {
    const loweredMs = bothDown ? state.loweredMs ?? nowMs : null;
    const rearmed = loweredMs !== null && nowMs - loweredMs >= config.rearmMs;
    return { ...state, justRaised: false, hasArms: true, candidateMs: null,
      loweredMs: rearmed ? null : loweredMs, needsLower: !rearmed, isRaised: bothUp };
  }

  const candidateMs = bothUp ? state.candidateMs ?? nowMs : null;
  const justRaised = candidateMs !== null && nowMs - candidateMs >= config.confirmMs;
  return { ...state, hasArms: true, isRaised: bothUp, candidateMs: justRaised ? null : candidateMs,
    justRaised, needsLower: justRaised, loweredMs: null, raiseCount: state.raiseCount + Number(justRaised) };
}
