import type { ShadowQuality } from '@/engine/types';

/** Rendering budgets only; pose accuracy, hazards and enemies stay the same. */
export const GRAPHICS_PRESETS = {
  low: { pixelRatio: 1, shadowMapSize: 0, sceneryFraction: 0.3, detailFraction: 0, moteFraction: 0, maxFps: 30 },
  medium: { pixelRatio: 1.5, shadowMapSize: 1024, sceneryFraction: 0.65, detailFraction: 0.5, moteFraction: 0.5, maxFps: 45 },
  high: { pixelRatio: 2, shadowMapSize: 2048, sceneryFraction: 1, detailFraction: 1, moteFraction: 1, maxFps: 60 },
} as const satisfies Record<ShadowQuality, object>;

export function isGraphicsQuality(value: unknown): value is ShadowQuality {
  return value === 'low' || value === 'medium' || value === 'high';
}

/** Keep fractional frame intervals so 45fps does not collapse to 30 on a 60Hz display. */
export function createFrameBudget() {
  let nextMs: number | null = null;
  return {
    reset() { nextMs = null; },
    consume(nowMs: number, quality: ShadowQuality): boolean {
      const interval = 1000 / GRAPHICS_PRESETS[quality].maxFps;
      if (nextMs !== null && nowMs + 0.01 < nextMs) return false;
      const deadline = nextMs ?? nowMs;
      nextMs = deadline + (Math.floor(Math.max(0, nowMs - deadline) / interval) + 1) * interval;
      return true;
    },
  };
}

const WARMUP_MS = 1000;
const WINDOW_MS = 3000;
const MAX_SAMPLE_MS = 1000;
const MEDIUM_FPS = 45;
const LOW_FPS = 26;

/** Recheck throughout play; two slow windows prevent a lone stall changing quality. */
export function createQualityMonitor() {
  let warmupMs = 0;
  let sampleMs = 0;
  let frames = 0;
  let slowWindows = 0;
  let lowWindows = 0;

  function reset(): void {
    warmupMs = sampleMs = frames = slowWindows = lowWindows = 0;
  }

  return {
    reset,
    sample(dtMs: number, current: ShadowQuality, suspended = false): ShadowQuality | null {
      if (suspended || !Number.isFinite(dtMs) || dtMs <= 0 || dtMs > MAX_SAMPLE_MS) {
        reset();
        return null;
      }
      if (current === 'low') return null;
      if (warmupMs < WARMUP_MS) { warmupMs += dtMs; return null; }
      sampleMs += dtMs;
      frames += 1;
      if (sampleMs < WINDOW_MS) return null;
      const fps = frames * 1000 / sampleMs;
      sampleMs = frames = 0;
      slowWindows = fps < MEDIUM_FPS ? slowWindows + 1 : 0;
      lowWindows = fps < LOW_FPS ? lowWindows + 1 : 0;
      const next = lowWindows >= 2 ? 'low' : slowWindows >= 2 && current === 'high' ? 'medium' : null;
      if (next) { slowWindows = lowWindows = 0; }
      return next;
    },
  };
}
