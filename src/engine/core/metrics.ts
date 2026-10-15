export interface MetricsSnapshot {
  latencyMeanMs: number | null;
  latencyP95Ms: number | null;
  latencyMinMs: number | null;
  latencyMaxMs: number | null;
  latencySamples: number;
  fpsMean: number | null;
  firstMinuteFps: number | null;
  lastMinuteFps: number | null;
  fpsDeclinePercent: number | null;
  bodyLossIncidents: number;
}

/** Bounded 1 ms histogram and rolling 60-second FPS buckets, even on long visits. */
export function createMetrics() {
  const histogram = new Uint32Array(10001);
  const seconds = new Map<number, { frames: number; ms: number }>();
  let count = 0, sum = 0, min = Infinity, max = 0, frames = 0, ms = 0;
  let firstFrames = 0, firstMs = 0, latestMs = 0, incidents = 0;
  let cached: MetricsSnapshot | null = null;
  return {
    response(value: number) {
      if (!Number.isFinite(value) || value < 0) return;
      count++; sum += value; min = Math.min(min, value); max = Math.max(max, value);
      histogram[Math.min(10000, Math.ceil(value))]++;
      cached = null;
    },
    render(elapsedMs: number, intervalMs: number) {
      if (!Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(elapsedMs)) return;
      frames++; ms += intervalMs; latestMs = elapsedMs;
      if (elapsedMs <= 60000.001) { firstFrames++; firstMs += intervalMs; }
      const second = Math.max(0, Math.ceil(elapsedMs / 1000) - 1);
      const bucket = seconds.get(second) ?? { frames: 0, ms: 0 };
      bucket.frames++; bucket.ms += intervalMs; seconds.set(second, bucket);
      for (const key of seconds.keys()) if (key < second - 59) seconds.delete(key);
      cached = null;
    },
    bodyLoss() { incidents++; cached = null; },
    snapshot(): MetricsSnapshot {
      if (cached) return cached;
      let seen = 0, p95: number | null = null;
      if (count) for (let i = 0; i < histogram.length; i++) {
        seen += histogram[i];
        if (seen >= Math.ceil(count * .95)) { p95 = i === 10000 && max > 10000 ? max : i; break; }
      }
      const lastFrames = [...seconds.values()].reduce((total, bucket) => total + bucket.frames, 0);
      const lastMs = [...seconds.values()].reduce((total, bucket) => total + bucket.ms, 0);
      const first = latestMs >= 60000 && firstMs > 0 ? firstFrames * 1000 / firstMs : null;
      const last = latestMs >= 120000 && lastMs > 0 ? lastFrames * 1000 / lastMs : null;
      cached = { latencyMeanMs: count ? sum / count : null, latencyP95Ms: p95,
        latencyMinMs: count ? min : null, latencyMaxMs: count ? max : null, latencySamples: count,
        fpsMean: ms ? frames * 1000 / ms : null, firstMinuteFps: first, lastMinuteFps: last,
        fpsDeclinePercent: first !== null && last !== null ? Math.max(0, (first - last) / first * 100) : null,
        bodyLossIncidents: incidents };
      return cached;
    },
    reset() {
      histogram.fill(0); seconds.clear(); count = sum = frames = ms = firstFrames = firstMs = latestMs = incidents = max = 0;
      min = Infinity; cached = null;
    },
  };
}
