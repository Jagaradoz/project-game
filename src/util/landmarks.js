/** Turning raw MediaPipe landmark arrays into the few measurements detectors need. */

import { CONFIG, LANDMARK } from '../config.js';
import { midpoint } from './smooth.js';

/** True when the landmark exists and MediaPipe is confident enough about it. */
export function isVisible(landmark, minVisibility = CONFIG.pose.minVisibility) {
  return Boolean(landmark) && Number.isFinite(landmark.x) && landmark.visibility >= minVisibility;
}

/** All landmarks at the given indices clear the visibility bar. */
export function allVisible(landmarks, indices, minVisibility) {
  return indices.every((i) => isVisible(landmarks[i], minVisibility));
}

/**
 * Derives the scale-invariant body measurements both detectors are built on.
 *
 * Normalising by shoulder width and torso length is what makes the thresholds
 * independent of how far the subject stands from the camera -- a phone propped
 * on a desk frames the body very differently from a laptop.
 *
 * Returns null when the required landmarks are not confidently visible, so
 * callers can hold their previous state instead of reacting to garbage.
 */
export function measureBody(landmarks, minVisibility = CONFIG.pose.minVisibility) {
  const required = [
    LANDMARK.LEFT_SHOULDER,
    LANDMARK.RIGHT_SHOULDER,
    LANDMARK.LEFT_HIP,
    LANDMARK.RIGHT_HIP,
  ];
  if (!landmarks || !allVisible(landmarks, required, minVisibility)) return null;

  const leftShoulder = landmarks[LANDMARK.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARK.RIGHT_SHOULDER];
  const leftHip = landmarks[LANDMARK.LEFT_HIP];
  const rightHip = landmarks[LANDMARK.RIGHT_HIP];

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);

  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
  const torsoLength = Math.abs(shoulderMid.y - hipMid.y);

  // Degenerate geometry (subject side-on, or a collapsed detection) would make
  // the normalised values explode. Refuse rather than emit nonsense.
  if (shoulderWidth < 1e-3 || torsoLength < 1e-3) return null;

  const leftKnee = landmarks[LANDMARK.LEFT_KNEE];
  const rightKnee = landmarks[LANDMARK.RIGHT_KNEE];
  const kneesVisible = isVisible(leftKnee, minVisibility) && isVisible(rightKnee, minVisibility);

  return {
    shoulderMid,
    hipMid,
    shoulderWidth,
    torsoLength,
    centerX: (shoulderMid.x + hipMid.x) / 2,
    kneesVisible,
    leftKnee: kneesVisible ? leftKnee : null,
    rightKnee: kneesVisible ? rightKnee : null,
  };
}
