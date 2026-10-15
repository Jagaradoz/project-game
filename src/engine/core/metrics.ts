import { POSE_IDS, type PoseId } from '@/engine/core/trial';

export interface LatencySummary {
  meanMs: number | null;
  p95Ms: number | null;
  minMs: number | null;
  maxMs: number | null;
  samples: number;
}

export interface MetricsSnapshot {
  latencyMeanMs: number | null;
  latencyP95Ms: number | null;
  latencyMinMs: number | null;
  latencyMaxMs: number | null;
  latencySamples: number;
  /** Detection-to-render latency split by the pose that triggered it. */
  latencyByPose: Record<PoseId, LatencySummary>;
  fpsMean: number | null;
  firstMinuteFps: number | null;
  lastMinuteFps: number | null;
  fpsDeclinePercent: number | null;
  bodyLossIncidents: number;
}

export const EMPTY_LATENCY: LatencySummary = { meanMs: null, p95Ms: null, minMs: null, maxMs: null, samples: 0 };

/** Bounded 1 ms histogram, so a long visit never grows memory. */
function createLatency() {
  const histogram = new Uint32Array(10001);
  let count = 0, sum = 0, min = Infinity, max = 0;
  return {
    add(value: number) {
      count++; sum += value; min = Math.min(min, value); max = Math.max(max, value);
      histogram[Math.min(10000, Math.ceil(value))]++;
    },
    summary(): LatencySummary {
      if (!count) return EMPTY_LATENCY;
      let seen = 0, p95: number | null = null;
      for (let i = 0; i < histogram.length; i++) {
        seen += histogram[i];
        if (seen >= Math.ceil(count * .95)) { p95 = i === 10000 && max > 10000 ? max : i; break; }
      }
      return { meanMs: sum / count, p95Ms: p95, minMs: min, maxMs: max, samples: count };
    },
    reset() { histogram.fill(0); count = sum = max = 0; min = Infinity; },
  };
}

/** Latency per pose plus overall, and rolling 60-second FPS buckets. */
export function createMetrics() {
  const overall = createLatency();
  const byPose = Object.fromEntries(POSE_IDS.map(pose => [pose, createLatency()])) as Record<PoseId, ReturnType<typeof createLatency>>;
  const seconds = new Map<number, { frames: number; ms: number }>();
  let frames = 0, ms = 0;
  let firstFrames = 0, firstMs = 0, latestMs = 0, incidents = 0;
  let cached: MetricsSnapshot | null = null;
  return {
    response(pose: PoseId, value: number) {
      if (!Number.isFinite(value) || value < 0) return;
      overall.add(value); byPose[pose].add(value);
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
      const latency = overall.summary();
      const lastFrames = [...seconds.values()].reduce((total, bucket) => total + bucket.frames, 0);
      const lastMs = [...seconds.values()].reduce((total, bucket) => total + bucket.ms, 0);
      const first = latestMs >= 60000 && firstMs > 0 ? firstFrames * 1000 / firstMs : null;
      const last = latestMs >= 120000 && lastMs > 0 ? lastFrames * 1000 / lastMs : null;
      cached = { latencyMeanMs: latency.meanMs, latencyP95Ms: latency.p95Ms,
        latencyMinMs: latency.minMs, latencyMaxMs: latency.maxMs, latencySamples: latency.samples,
        latencyByPose: Object.fromEntries(POSE_IDS.map(pose => [pose, byPose[pose].summary()])) as Record<PoseId, LatencySummary>,
        fpsMean: ms ? frames * 1000 / ms : null, firstMinuteFps: first, lastMinuteFps: last,
        fpsDeclinePercent: first !== null && last !== null ? Math.max(0, (first - last) / first * 100) : null,
        bodyLossIncidents: incidents };
      return cached;
    },
    reset() {
      overall.reset(); for (const pose of POSE_IDS) byPose[pose].reset();
      seconds.clear(); frames = ms = firstFrames = firstMs = latestMs = incidents = 0;
      cached = null;
    },
  };
}
