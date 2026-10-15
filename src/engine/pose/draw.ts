/**
 * Skeleton overlay.
 *
 * The canvas carries the same CSS mirror transform as the video, so drawing
 * happens in raw landmark space with no flipping here.
 */

import { CONFIG } from '@/engine/config';
import { isVisible } from '@/engine/util/landmarks';
import type { DrawConfig, LaneGuide, LateralLabel, PoseConnection, PoseLandmarks } from '@/engine/types';

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

/**
 * CSS pixels per canvas pixel, so the lane guide can size its lines and text in
 * on-screen units: the backing store is the camera's resolution, but the stage
 * shows it scaled by object-fit (cover on the full stages, contain on the
 * in-game thumbnail).
 */
export function overlayCssScale(canvas: HTMLCanvasElement): number {
  if (!canvas.width || !canvas.height || !canvas.clientWidth || !canvas.clientHeight) return 1;
  const sx = canvas.clientWidth / canvas.width;
  const sy = canvas.clientHeight / canvas.height;
  return getComputedStyle(canvas).objectFit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
}

/** Text on the mirrored canvas has to be flipped back locally to read correctly. */
function unmirroredText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function verticalLine(ctx: CanvasRenderingContext2D, x: number, dash: number[]): void {
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, ctx.canvas.height);
  ctx.stroke();
}

const LANE_NAMES: Record<LateralLabel, string> = { LEFT: 'LEFT', CENTER: 'CENTRE', RIGHT: 'RIGHT' };

/**
 * Lane bands anchored to the player's calibrated centre (see `laneGuide`). Drawn
 * under the skeleton: the active lane is filled, solid lines mark where the
 * label switches, a dashed line on the active side marks where it releases back
 * to centre, and the orange marker is the point actually measured.
 *
 * `flash` (0..1) brightens the active lane right after a change; `cssScale`
 * comes from `overlayCssScale`.
 */
export function drawLaneGuide(
  ctx: CanvasRenderingContext2D,
  guide: LaneGuide,
  flash: number,
  cssScale: number,
  style: DrawConfig = CONFIG.draw,
): void {
  const { width, height } = ctx.canvas;
  const px = 1 / Math.max(cssScale, 1e-3);
  const showText = height * cssScale >= style.laneLabelMinCssHeight;
  const labelY = style.laneLabelTopCssPx * px;
  ctx.save();
  ctx.font = `700 ${style.laneLabelCssPx * px}px ui-monospace, "JetBrains Mono", Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = style.laneLineCssPx * px;

  if (!guide.lanes || guide.baselineX === null) {
    drawCalibrationHint(ctx, guide, px, labelY, showText, style);
    ctx.restore();
    return;
  }

  const { left, right } = guide.lanes;
  const leftward = Math.sign(left.enterX - guide.baselineX) || 1;
  const edgeOf = (direction: number) => (direction > 0 ? width : 0);
  const zones: Array<[LateralLabel, number, number]> = [
    ['LEFT', left.enterX * width, edgeOf(leftward)],
    ['CENTER', left.enterX * width, right.enterX * width],
    ['RIGHT', right.enterX * width, edgeOf(-leftward)],
  ];
  for (const [label, a, b] of zones) {
    const isActive = label === guide.label;
    ctx.fillStyle = !guide.isTracking ? style.laneLostColor : isActive ? style.laneActiveColor : style.laneIdleFill;
    ctx.globalAlpha = !guide.isTracking ? 0.35 : isActive ? style.laneActiveAlpha + style.laneFlashAlpha * flash : 1;
    ctx.fillRect(Math.min(a, b), 0, Math.abs(b - a), height);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = guide.isTracking ? style.laneLineColor : style.laneLostColor;
  verticalLine(ctx, left.enterX * width, []);
  verticalLine(ctx, right.enterX * width, []);
  if (guide.isTracking && guide.label !== 'CENTER') {
    ctx.strokeStyle = style.boneColor;
    verticalLine(ctx, (guide.label === 'LEFT' ? left.exitX : right.exitX) * width, [6 * px, 5 * px]);
  }
  ctx.setLineDash([]);

  if (showText) {
    const gap = 8 * px;
    const outside = (x: number, direction: number, text: string) => x + direction * (ctx.measureText(text).width / 2 + gap);
    const labelAt: Record<LateralLabel, number> = {
      LEFT: outside(left.enterX * width, leftward, LANE_NAMES.LEFT),
      CENTER: guide.baselineX * width,
      RIGHT: outside(right.enterX * width, -leftward, LANE_NAMES.RIGHT),
    };
    for (const label of ['LEFT', 'CENTER', 'RIGHT'] as const) {
      ctx.fillStyle = guide.isTracking && label === guide.label ? style.laneTextColor : style.laneMutedTextColor;
      unmirroredText(ctx, LANE_NAMES[label], labelAt[label], labelY);
    }
  }

  if (guide.marker) drawMarker(ctx, guide.marker, px, style);
  ctx.restore();
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  marker: NonNullable<LaneGuide['marker']>,
  px: number,
  style: DrawConfig,
): void {
  const { width, height } = ctx.canvas;
  const x = marker.x * width, top = marker.topY * height, bottom = marker.bottomY * height;
  const size = 7 * px;
  ctx.strokeStyle = style.laneActiveColor;
  ctx.fillStyle = style.laneActiveColor;
  ctx.lineWidth = 3 * px;
  ctx.beginPath();
  ctx.moveTo(x, top - size * 2);
  ctx.lineTo(x, bottom + size * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, top - size);
  ctx.lineTo(x + size, top);
  ctx.lineTo(x, top + size);
  ctx.lineTo(x - size, top);
  ctx.closePath();
  ctx.fill();
}

/** Before a baseline exists there is nothing to draw lanes from: show where to stand and the hold progress. */
function drawCalibrationHint(
  ctx: CanvasRenderingContext2D,
  guide: LaneGuide,
  px: number,
  labelY: number,
  showText: boolean,
  style: DrawConfig,
): void {
  const cx = ctx.canvas.width / 2;
  ctx.strokeStyle = style.laneLineColor;
  ctx.globalAlpha = 0.6;
  verticalLine(ctx, cx, [6 * px, 5 * px]);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  const radius = 14 * px, ringY = labelY + radius + 4 * px;
  ctx.lineWidth = 4 * px;
  ctx.strokeStyle = style.laneMutedTextColor;
  ctx.beginPath();
  ctx.arc(cx, ringY, radius, 0, Math.PI * 2);
  ctx.stroke();
  if (guide.isTracking) {
    ctx.strokeStyle = style.laneActiveColor;
    ctx.beginPath();
    // Mirrored canvas: a counter-clockwise arc fills clockwise on screen.
    ctx.arc(cx, ringY, radius, -Math.PI / 2, -Math.PI / 2 - guide.calibrationProgress * Math.PI * 2, true);
    ctx.stroke();
  }
  if (showText) {
    ctx.fillStyle = style.laneTextColor;
    unmirroredText(ctx, guide.isTracking ? 'HOLD STILL IN THE MIDDLE' : 'STEP INTO VIEW', cx, ringY + radius + 16 * px);
  }
}
