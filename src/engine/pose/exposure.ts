/**
 * Feeds a downsampled camera frame to the luma maths in util/luma.ts.
 *
 * All the logic worth asserting is there; this is the canvas glue. One reusable
 * 32x24 canvas, throttled, so the calibration readout costs nothing next to
 * pose inference.
 */

import { CONFIG } from '@/engine/config';
import { meanLuma } from '@/engine/util/luma';

export interface ExposureSampler {
  /** Returns the latest reading, resampling at most once per interval. */
  sample(video: HTMLVideoElement, nowMs: number): number | null;
  dispose(): void;
}

export function createExposureSampler(config = CONFIG.calibration): ExposureSampler {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let lastSampleMs = -Infinity;
  let luma: number | null = null;

  function ensureContext(): CanvasRenderingContext2D | null {
    if (ctx) return ctx;
    if (typeof document === 'undefined') return null;

    canvas = document.createElement('canvas');
    canvas.width = config.sampleWidth;
    canvas.height = config.sampleHeight;
    // The frame is only ever averaged, so tell the browser it can skip the
    // expensive read-back path.
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    return ctx;
  }

  return {
    sample(video: HTMLVideoElement, nowMs: number): number | null {
      if (nowMs - lastSampleMs < config.sampleIntervalMs) return luma;
      if (!video.videoWidth || !video.videoHeight) return luma;

      const context = ensureContext();
      if (!context) return luma;

      lastSampleMs = nowMs;
      try {
        context.drawImage(video, 0, 0, config.sampleWidth, config.sampleHeight);
        const frame = context.getImageData(0, 0, config.sampleWidth, config.sampleHeight);
        luma = meanLuma(frame.data);
      } catch {
        // A tainted canvas or a frame that is not ready yet. Keep the last
        // reading rather than flickering the calibration panel.
      }
      return luma;
    },

    dispose(): void {
      ctx = null;
      canvas = null;
      luma = null;
    },
  };
}
