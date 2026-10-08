/** MediaPipe PoseLandmarker lifecycle: load, detect, report which backend won. */

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseLandmarkerOptions } from '@mediapipe/tasks-vision';

import { CONFIG, MODEL_URLS, MEDIAPIPE_WASM_URL } from '@/engine/config';
import type { PoseConfig, PoseLandmarks, PoseModelName } from '@/engine/types';

export type PoseDelegate = 'GPU' | 'CPU';

export interface PoseInitResult {
  delegate: PoseDelegate | null;
  model: string;
  connections: { start: number; end: number }[];
}

export interface PoseDetectResult {
  landmarks: PoseLandmarks | null;
  inferenceMs: number;
}

let landmarker: PoseLandmarker | null = null;
let delegateInUse: PoseDelegate | null = null;
let lastTimestampMs = -1;
let initRequestId = 0;

/**
 * Loads the WASM runtime and model, preferring the GPU delegate.
 *
 * The CPU retry is not optional: the WebGL delegate fails outright on a number
 * of Android and iOS Safari builds, and without the fallback the page just dies
 * on exactly the mobile hardware we are trying to measure.
 */
export async function initPose(config: PoseConfig = CONFIG.pose): Promise<PoseInitResult> {
  closePose();
  const requestId = initRequestId;
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  const modelAssetPath = MODEL_URLS[config.model as PoseModelName];
  if (!modelAssetPath) throw new Error(`Unknown model "${config.model}". Expected one of: ${Object.keys(MODEL_URLS).join(', ')}`);

  const options: PoseLandmarkerOptions = {
    runningMode: 'VIDEO',
    numPoses: config.numPoses,
    minPoseDetectionConfidence: config.minPoseDetectionConfidence,
    minPosePresenceConfidence: config.minPosePresenceConfidence,
    minTrackingConfidence: config.minTrackingConfidence,
    outputSegmentationMasks: false,
  };

  let instance: PoseLandmarker;
  let delegate: PoseDelegate;
  try {
    instance = await PoseLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath, delegate: 'GPU' },
    });
    delegate = 'GPU';
  } catch (gpuError) {
    if (requestId !== initRequestId) throw gpuError;
    console.warn('GPU delegate unavailable, falling back to CPU:', gpuError);
    instance = await PoseLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { modelAssetPath, delegate: 'CPU' },
    });
    delegate = 'CPU';
  }

  if (requestId !== initRequestId) {
    instance.close();
    throw new Error('Pose initialization cancelled.');
  }
  landmarker = instance;
  delegateInUse = delegate;

  return { delegate: delegateInUse, model: config.model, connections: PoseLandmarker.POSE_CONNECTIONS };
}

/**
 * Runs one inference and reports how long it took.
 *
 * MediaPipe rejects timestamps that are not strictly increasing, and
 * performance.now() can return the same value twice inside one millisecond, so
 * the timestamp is nudged forward rather than passed through raw.
 */
export function detect(video: HTMLVideoElement, nowMs: number): PoseDetectResult {
  if (!landmarker) throw new Error('initPose() must complete before detect() is called.');

  const timestampMs = Math.max(nowMs, lastTimestampMs + 1);
  lastTimestampMs = timestampMs;

  const startedAt = performance.now();
  const result = landmarker.detectForVideo(video, timestampMs);
  const inferenceMs = performance.now() - startedAt;

  return { landmarks: result?.landmarks?.[0] ?? null, inferenceMs };
}

export function getDelegate() {
  return delegateInUse;
}

export function closePose() {
  initRequestId += 1;
  landmarker?.close();
  landmarker = null;
  delegateInUse = null;
  lastTimestampMs = -1;
}
