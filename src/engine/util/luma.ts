/**
 * Frame brightness, as one number.
 *
 * TOR 3 (ระบบปรับเทียบกล้อง) asks /calibrate to report แสงสว่าง. Pose confidence
 * collapses in a dark room and again in a blown-out one, so this is a real
 * pre-flight check rather than a decoration -- but it only has to be an average,
 * which is why it is a few lines of arithmetic on a downsampled frame.
 *
 * Kept here rather than in pose/ because it is pure: the canvas glue that feeds
 * it lives in pose/exposure.ts.
 */

import { CONFIG } from '@/engine/config';

/** Rec. 601 luma weights -- perceived brightness, not the channel mean. */
const RED_WEIGHT = 0.299;
const GREEN_WEIGHT = 0.587;
const BLUE_WEIGHT = 0.114;

const CHANNELS = 4;
const MAX_CHANNEL = 255;

export type LightingVerdict = 'dark' | 'ok' | 'bright';

/**
 * Mean perceived brightness of RGBA pixel data, normalised to 0..1.
 * Returns null for empty or malformed data rather than NaN, so a caller can
 * hold its previous reading instead of rendering nonsense.
 */
export function meanLuma(data: ArrayLike<number> | null | undefined): number | null {
  if (!data || data.length < CHANNELS) return null;

  const pixels = Math.floor(data.length / CHANNELS);
  let total = 0;

  for (let index = 0; index < pixels; index += 1) {
    const offset = index * CHANNELS;
    total +=
      RED_WEIGHT * data[offset]! +
      GREEN_WEIGHT * data[offset + 1]! +
      BLUE_WEIGHT * data[offset + 2]!;
  }

  const mean = total / pixels / MAX_CHANNEL;
  return Number.isFinite(mean) ? clamp01(mean) : null;
}

export function classifyLighting(
  luma: number | null,
  config = CONFIG.calibration,
): LightingVerdict | null {
  if (luma === null) return null;
  if (luma < config.minLuma) return 'dark';
  if (luma > config.maxLuma) return 'bright';
  return 'ok';
}

export type DistanceVerdict = 'far' | 'ok' | 'close';

/**
 * Rough distance from shoulder width, as a fraction of the frame. A narrow
 * pair of shoulders means the player is too far for the knees to track; a wide
 * pair means their legs are already out of frame.
 */
export function classifyDistance(
  shoulderWidth: number | null,
  config = CONFIG.calibration,
): DistanceVerdict | null {
  if (shoulderWidth === null || !Number.isFinite(shoulderWidth)) return null;
  if (shoulderWidth < config.minShoulderWidth) return 'far';
  if (shoulderWidth > config.maxShoulderWidth) return 'close';
  return 'ok';
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
