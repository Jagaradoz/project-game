/**
 * Hands on hips (ท้าวเอว), held. `isActive` is a level signal -- the shield is
 * up for exactly as long as the pose is -- with enter/exit delays so a frame
 * of noise neither raises nor drops it.
 *
 * Hands resting on the hips are the one pose that covers the hip landmarks,
 * so this detector reads its own landmarks at a lower visibility floor and
 * reuses the last good hip positions while they are hidden.
 */

import type { HandsOnHipsConfig, HandsOnHipsState, Point2D, PoseLandmark, PoseLandmarks } from '@/engine/types';
import { CONFIG, LANDMARK } from '@/engine/config';
import { isVisible } from '@/engine/util/landmarks';
import { midpoint } from '@/engine/util/smooth';

export function createHandsOnHipsState(): HandsOnHipsState {
  return { isActive: false, holdCount: 0, candidateMs: null, releaseMs: null, lastHips: null, hasArms: false };
}

function resolveHips(state: HandsOnHipsState, pose: PoseLandmarks, nowMs: number,
  config: HandsOnHipsConfig): HandsOnHipsState['lastHips'] {
  const left = pose[LANDMARK.LEFT_HIP];
  const right = pose[LANDMARK.RIGHT_HIP];
  if (isVisible(left, config.minVisibility) && isVisible(right, config.minVisibility)) {
    return { left: { x: left.x, y: left.y }, right: { x: right.x, y: right.y }, atMs: nowMs };
  }
  const held = state.lastHips;
  return held && nowMs - held.atMs <= config.occlusionHoldMs ? held : null;
}

function sideOnHip(wrist: PoseLandmark, elbow: PoseLandmark, hip: Point2D, midX: number,
  torso: number, shoulderWidth: number, config: HandsOnHipsConfig): boolean {
  const nearHip = Math.hypot(wrist.x - hip.x, wrist.y - hip.y) <= config.maxHipDist * torso;
  const elbowOut = Math.abs(elbow.x - midX) - Math.abs(wrist.x - midX) >= config.minElbowOut * shoulderWidth;
  return nearHip && elbowOut;
}

/** Both hands on their own hip, elbows out. Null when the arms cannot be read. */
function readPose(pose: PoseLandmarks, hips: NonNullable<HandsOnHipsState['lastHips']>,
  config: HandsOnHipsConfig): boolean | null {
  const at = (i: number) => pose[i];
  const parts = [LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER, LANDMARK.LEFT_ELBOW,
    LANDMARK.RIGHT_ELBOW, LANDMARK.LEFT_WRIST, LANDMARK.RIGHT_WRIST].map(at);
  if (!parts.every(p => isVisible(p, config.minVisibility))) return null;
  const [ls, rs, le, re, lw, rw] = parts;
  const shoulderMid = midpoint(ls, rs);
  const shoulderWidth = Math.abs(ls.x - rs.x);
  const torso = Math.abs(midpoint(hips.left, hips.right).y - shoulderMid.y);
  if (shoulderWidth < 1e-3 || torso < 1e-3) return null;
  return sideOnHip(lw, le, hips.left, shoulderMid.x, torso, shoulderWidth, config) &&
    sideOnHip(rw, re, hips.right, shoulderMid.x, torso, shoulderWidth, config);
}

export function updateHandsOnHips(state: HandsOnHipsState, pose: PoseLandmarks | null | undefined,
  nowMs: number, config: HandsOnHipsConfig = CONFIG.handsOnHips): HandsOnHipsState {
  const lastHips = pose ? resolveHips(state, pose, nowMs, config) : state.lastHips;
  const posed = pose && lastHips ? readPose(pose, lastHips, config) : null;
  const hasArms = posed !== null;
  const isPosed = posed === true;

  if (!state.isActive) {
    const candidateMs = isPosed ? state.candidateMs ?? nowMs : null;
    const raised = candidateMs !== null && nowMs - candidateMs >= config.enterMs;
    return { ...state, lastHips, hasArms, candidateMs: raised ? null : candidateMs, releaseMs: null,
      isActive: raised, holdCount: state.holdCount + Number(raised) };
  }
  const releaseMs = isPosed ? null : state.releaseMs ?? nowMs;
  const dropped = releaseMs !== null && nowMs - releaseMs >= config.exitMs;
  return { ...state, lastHips, hasArms, candidateMs: null, releaseMs: dropped ? null : releaseMs, isActive: !dropped };
}
