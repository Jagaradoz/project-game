/** Synthetic MediaPipe landmark arrays, so the detectors can be tested headless. */

import { LANDMARK } from '@/engine/config';
import type { PoseLandmarks } from '@/engine/types';

export interface MakePoseOptions {
  centerX?: number;
  scale?: number;
  leftKneeLift?: number;
  rightKneeLift?: number;
  hipShift?: number;
  visibility?: number;
}

const LANDMARK_COUNT = 33;
const FRAME_MS = 1000 / 30;

/**
 * Builds a 33-landmark pose facing the camera.
 *
 * Image y grows downward, so a SMALLER knee y means a HIGHER knee. MediaPipe's
 * "left" is the subject's own left, which in raw camera space sits at the
 * larger x.
 *
 * `scale` is overall body size -- halving it simulates standing twice as far
 * from the camera. `hipShift` offsets the pelvis (hips + knees) only, modelling
 * the pelvis swinging over the support leg while jogging. The knee lifts are
 * fractions of a torso length.
 */
export function makePose({
  centerX = 0.5,
  scale = 1,
  leftKneeLift = 0,
  rightKneeLift = 0,
  hipShift = 0,
  visibility = 1,
}: MakePoseOptions = {}): PoseLandmarks {
  const shoulderWidth = 0.24 * scale;
  const hipWidth = 0.16 * scale;
  const torso = 0.2 * scale;
  const thigh = torso;

  const shoulderY = 0.3;
  const hipY = shoulderY + torso;
  const restKneeY = hipY + thigh;

  const landmarks = Array.from({ length: LANDMARK_COUNT }, () => ({
    x: centerX,
    y: 0.5,
    z: 0,
    visibility,
  }));

  const set = (index: number, x: number, y: number) => {
    landmarks[index] = { x, y, z: 0, visibility };
  };

  set(LANDMARK.LEFT_SHOULDER, centerX + shoulderWidth / 2, shoulderY);
  set(LANDMARK.RIGHT_SHOULDER, centerX - shoulderWidth / 2, shoulderY);
  const pelvisX = centerX + hipShift;
  set(LANDMARK.LEFT_HIP, pelvisX + hipWidth / 2, hipY);
  set(LANDMARK.RIGHT_HIP, pelvisX - hipWidth / 2, hipY);
  set(LANDMARK.LEFT_KNEE, pelvisX + hipWidth / 2, restKneeY - leftKneeLift * torso);
  set(LANDMARK.RIGHT_KNEE, pelvisX - hipWidth / 2, restKneeY - rightKneeLift * torso);

  return landmarks;
}

/** Feeds `frames` poses through a detector reducer at a fixed frame rate. */
export function run<S>(
  state: S,
  reducer: (state: S, landmarks: PoseLandmarks, nowMs: number) => S,
  frames: number,
  poseAt: (frameIndex: number, nowMs: number) => PoseLandmarks,
  startMs = 0,
): { state: S; endMs: number } {
  let current = state;
  let nowMs = startMs;
  for (let i = 0; i < frames; i += 1) {
    current = reducer(current, poseAt(i, nowMs), nowMs);
    nowMs += FRAME_MS;
  }
  return { state: current, endMs: nowMs };
}

export { FRAME_MS };
