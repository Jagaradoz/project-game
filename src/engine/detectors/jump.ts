import type { JumpState, PoseLandmarks, JumpConfig } from '@/engine/types';
import { CONFIG, LANDMARK } from '@/engine/config';
import { measureBody, isVisible } from '@/engine/util/landmarks';

export function createJumpState(): JumpState {
  return { isCalibrated: false, feetVisible: false, justJumped: false, jumpCount: 0,
    airborne: false, baseline: null, calibrationStartMs: null, candidateMs: null,
    landedMs: null, lastSeenMs: null, needsLanding: false };
}

export function updateJump(state: JumpState, pose: PoseLandmarks | null | undefined,
  nowMs: number, config: JumpConfig = CONFIG.jump): JumpState {
  const body = measureBody(pose);
  const left = pose?.[LANDMARK.LEFT_ANKLE];
  const right = pose?.[LANDMARK.RIGHT_ANKLE];
  const valid = body && isVisible(left) && isVisible(right) &&
    [left, right].every(foot => foot && foot.x >= 0 && foot.x <= 1 && foot.y >= 0 && foot.y <= 1) &&
    [body.hipMid.y, body.torsoLength, left?.y, right?.y].every(Number.isFinite);
  if (!valid || !body || !left || !right) {
    const stale = state.lastSeenMs === null || nowMs - state.lastSeenMs > config.missingResetMs;
    return { ...(stale ? { ...createJumpState(), jumpCount: state.jumpCount } : state),
      justJumped: false, feetVisible: false, candidateMs: null, landedMs: null, needsLanding: true };
  }
  const sample = { hip: body.hipMid.y, left: left.y, right: right.y, torso: body.torsoLength };
  if (!state.isCalibrated || !state.baseline) {
    const old = state.baseline;
    const stable = old && Math.abs(sample.hip - old.hip) < sample.torso * .08 &&
      Math.abs(sample.left - old.left) < sample.torso * .08 && Math.abs(sample.right - old.right) < sample.torso * .08;
    const start = stable ? state.calibrationStartMs ?? nowMs : nowMs;
    const baseline = stable && old ? {
      hip: old.hip * .9 + sample.hip * .1, left: old.left * .9 + sample.left * .1,
      right: old.right * .9 + sample.right * .1, torso: old.torso * .9 + sample.torso * .1,
    } : sample;
    return { ...state, baseline, calibrationStartMs: start, isCalibrated: nowMs - start >= config.calibrationMs,
      feetVisible: true, justJumped: false, lastSeenMs: nowMs, needsLanding: false };
  }
  const base = state.baseline;
  const hipRise = (base.hip - sample.hip) / base.torso;
  const footRise = Math.min(base.left - sample.left, base.right - sample.right) / base.torso;
  const landed = Math.abs(hipRise) < .1 && Math.abs(base.left - sample.left) / base.torso < .1 &&
    Math.abs(base.right - sample.right) / base.torso < .1;
  const lost = !state.feetVisible;
  if (state.airborne || state.needsLanding || lost) {
    const landedMs = landed ? state.landedMs ?? nowMs : null;
    const ready = landedMs !== null && nowMs - landedMs >= config.landingMs;
    return { ...state, feetVisible: true, justJumped: false, lastSeenMs: nowMs,
      landedMs, candidateMs: null, airborne: ready ? false : state.airborne, needsLanding: !ready };
  }
  const rising = hipRise >= config.hipRise && footRise >= config.footRise;
  const candidateMs = rising ? state.candidateMs ?? nowMs : null;
  const justJumped = candidateMs !== null && nowMs - candidateMs >= config.confirmMs;
  return { ...state, feetVisible: true, lastSeenMs: nowMs, candidateMs, justJumped,
    airborne: justJumped, jumpCount: state.jumpCount + Number(justJumped), landedMs: null };
}
