/** Small stateless numeric helpers shared by the detectors. */

import type { Point2D } from '@/engine/types';

/**
 * Exponential moving average. A null/undefined previous value seeds the filter
 * with the incoming sample so the first frame is not dragged toward zero.
 */
export function ema(previous: number | null | undefined, next: number, alpha: number): number {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) {
    return next;
  }
  return previous + alpha * (next - previous);
}

/** Appends a timestamp and returns a NEW array holding only entries inside the window. */
export function pushWithinWindow(timestamps: number[], nowMs: number, windowMs: number): number[] {
  return [...timestamps, nowMs].filter((t) => nowMs - t <= windowMs);
}

/** Midpoint of two {x, y} points. */
export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Steps per minute implied by a list of step timestamps. Needs at least two. */
export function cadenceSpm(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  const elapsedMs = timestamps[timestamps.length - 1] - timestamps[0];
  if (elapsedMs <= 0) return 0;
  return (60000 * (timestamps.length - 1)) / elapsedMs;
}
