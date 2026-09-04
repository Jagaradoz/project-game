/**
 * Skeleton overlay.
 *
 * The canvas carries the same CSS mirror transform as the video, so drawing
 * happens in raw landmark space with no flipping here.
 */

import { CONFIG } from '@/engine/config';
import { isVisible } from '@/engine/util/landmarks';
import type { DrawConfig, PoseConnection, PoseLandmarks } from '@/engine/types';

/** Matches the canvas backing store to the video's intrinsic size. */
export function resizeOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement): boolean {
  if (canvas.width === video.videoWidth && canvas.height === video.videoHeight) return false;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  return true;
}

export function clearOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** `connections` is PoseLandmarker.POSE_CONNECTIONS. */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: PoseLandmarks | null | undefined,
  connections: PoseConnection[],
  style: DrawConfig = CONFIG.draw,
): void {
  if (!landmarks) return;
  const { width, height } = ctx.canvas;

  ctx.lineWidth = style.boneWidth;
  ctx.strokeStyle = style.boneColor;
  ctx.beginPath();
  for (const { start, end } of connections) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b || !isVisible(a) || !isVisible(b)) continue;
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
  }
  ctx.stroke();

  // Joints are tinted by confidence so degrading tracking is obvious at a glance
  // rather than something you infer from the skeleton twitching.
  for (const landmark of landmarks) {
    if (!landmark) continue;
    ctx.fillStyle = isVisible(landmark) ? style.jointColor : style.lowConfidenceColor;
    ctx.beginPath();
    ctx.arc(landmark.x * width, landmark.y * height, style.jointRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}
