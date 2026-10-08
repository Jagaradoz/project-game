import type { ShadowQuality } from '@/engine/types';

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
