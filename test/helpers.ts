/** Headless test helpers. Synthetic poses live in the engine, shared with the dev fake body. */

import type { PoseLandmarks } from '@/engine/types';

export { makePose } from '@/engine/pose/syntheticPose';
export type { MakePoseOptions } from '@/engine/pose/syntheticPose';

const FRAME_MS = 1000 / 30;

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
