import { CONFIG, LANDMARK } from '@/engine/config';
import { isVisible, measureBody } from '@/engine/util/landmarks';
import type { ClapState, PoseLandmarks } from '@/engine/types';

export function createClapState(): ClapState {
  return { justClapped: false, clapCount: 0, armed: false, candidateMs: null, separatedMs: null, hasHands: false };
}

/** A clap is an open-to-closed edge above the head, never merely an arm raise. */
export function updateClap(state: ClapState, pose: PoseLandmarks | null | undefined, nowMs: number,
  config = CONFIG.clap): ClapState {
  const body = measureBody(pose);
  const left = pose?.[LANDMARK.LEFT_WRIST];
  const right = pose?.[LANDMARK.RIGHT_WRIST];
  if (!body || !left || !right || !isVisible(left) || !isVisible(right)) {
    return { ...state, justClapped: false, armed: false, candidateMs: null, separatedMs: null, hasHands: false };
  }
  const distance = Math.hypot(left.x - right.x, left.y - right.y) / body.shoulderWidth;
  const aboveHead = left.y < body.shoulderMid.y - config.minRise * body.torsoLength
    && right.y < body.shoulderMid.y - config.minRise * body.torsoLength;
  const separated = distance >= config.openDistanceSw;
  const separatedMs = separated ? state.separatedMs ?? nowMs : null;
  const armed = state.armed || (separatedMs !== null && nowMs - separatedMs >= config.rearmMs);
  const candidateMs = armed && aboveHead && distance <= config.closeDistanceSw ? state.candidateMs ?? nowMs : null;
  const justClapped = candidateMs !== null && nowMs - candidateMs >= config.confirmMs;
  return { justClapped, clapCount: state.clapCount + Number(justClapped), armed: justClapped ? false : armed,
    candidateMs: justClapped ? null : candidateMs, separatedMs, hasHands: true };
}
