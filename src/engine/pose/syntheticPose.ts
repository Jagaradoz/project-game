/** Synthetic MediaPipe landmark arrays: for headless tests and the dev fake body. */

import { LANDMARK } from '@/engine/config';
import type { PoseLandmarks } from '@/engine/types';

export interface MakePoseOptions {
  centerX?: number;
  scale?: number;
  leftKneeLift?: number;
  rightKneeLift?: number;
  hipShift?: number;
  visibility?: number;
  /** Arm pose. 'down' hangs loose at the sides; 'leftUp' raises only the left arm. */
  arms?: 'down' | 'up' | 'hips' | 'leftUp';
  /** Visibility of the hip landmarks alone, to model hands covering them. */
  hipVisibility?: number;
}

const LANDMARK_COUNT = 33;

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
  arms = 'down',
  hipVisibility = visibility,
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

  const set = (index: number, x: number, y: number, vis = visibility) => {
    landmarks[index] = { x, y, z: 0, visibility: vis };
  };

  set(LANDMARK.LEFT_SHOULDER, centerX + shoulderWidth / 2, shoulderY);
  set(LANDMARK.RIGHT_SHOULDER, centerX - shoulderWidth / 2, shoulderY);
  const pelvisX = centerX + hipShift;
  set(LANDMARK.LEFT_HIP, pelvisX + hipWidth / 2, hipY, hipVisibility);
  set(LANDMARK.RIGHT_HIP, pelvisX - hipWidth / 2, hipY, hipVisibility);
  set(LANDMARK.LEFT_KNEE, pelvisX + hipWidth / 2, restKneeY - leftKneeLift * torso);
  set(LANDMARK.RIGHT_KNEE, pelvisX - hipWidth / 2, restKneeY - rightKneeLift * torso);

  // Arms, per side (+1 = subject's left, at larger x).
  const armSide = (sign: 1 | -1, pose: 'down' | 'up' | 'hips') => {
    const shoulderX = centerX + sign * shoulderWidth / 2;
    const [elbowIdx, wristIdx] = sign === 1
      ? [LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST]
      : [LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST];
    if (pose === 'up') {
      set(elbowIdx, shoulderX, shoulderY - torso * 0.5);
      set(wristIdx, shoulderX, shoulderY - torso);
    } else if (pose === 'hips') {
      set(elbowIdx, shoulderX + sign * shoulderWidth * 0.45, shoulderY + torso * 0.55);
      set(wristIdx, pelvisX + sign * hipWidth * 0.7, hipY - torso * 0.15);
    } else {
      set(elbowIdx, shoulderX + sign * 0.01, shoulderY + torso * 0.6);
      set(wristIdx, shoulderX + sign * 0.01, hipY + torso * 0.15);
    }
  };
  armSide(1, arms === 'leftUp' ? 'up' : arms);
  armSide(-1, arms === 'leftUp' ? 'down' : arms);

  return landmarks;
}
