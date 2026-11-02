import type { PoseEvaluation, RateInterval } from '@/engine/core/autoEvaluation';
import type { LatencySummary, MetricsSnapshot } from '@/engine/core/metrics';
import { POSE_IDS, type PoseId } from '@/engine/core/trial';

const POSE_SHORT: Record<PoseId, string> = { lateral: 'side step', knees: 'knee lift', hips: 'hands on hips', clap: 'clap' };

export function whole(value: number | null, suffix = ''): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(0)}${suffix}`;
}

/** "12% (5–30%)": error rate with its 95% interval. */
export function ratePercent(rate: RateInterval): string {
  if (rate.value === null) return '—';
  const interval = rate.low !== null && rate.high !== null ? ` (${whole(rate.low * 100)}–${whole(rate.high * 100)}%)` : '';
  return `${whole(rate.value * 100)}%${interval}`;
}

export function meanP95(mean: number | null, p95: number | null): string {
  return mean === null && p95 === null ? '—' : `${whole(mean)} / ${whole(p95)} ms`;
}

/** Count of other-movement errors, naming what was recognised instead: "2 (knee lift 1, clap 1)". */
export function otherMovements(evaluation: PoseEvaluation): string {
  const total = evaluation.errors.otherMovement;
  const parts = POSE_IDS.filter(pose => evaluation.otherByPose[pose] > 0).map(pose => `${POSE_SHORT[pose]} ${evaluation.otherByPose[pose]}`);
  return parts.length ? `${total} (${parts.join(', ')})` : `${total}`;
}

/** Table cells for one movement, in column order. Lane errors only apply to side steps, knee errors to knee lifts. */
export function evaluationCells(pose: PoseId | 'overall', evaluation: PoseEvaluation, latency: LatencySummary | null): string[] {
  const lane = pose === 'lateral' || pose === 'overall' ? `${evaluation.errors.wrongLane}` : '—';
  const knee = pose === 'knees' || pose === 'overall' ? `${evaluation.errors.wrongKnee}` : '—';
  const verdict = evaluation.passes === null ? '' : evaluation.passes ? ' · pass' : ' · fail';
  return [
    `${evaluation.attempts}`, `${evaluation.correct}`, `${evaluation.errors.missed}`, lane, knee, otherMovements(evaluation),
    `${ratePercent(evaluation.errorRate)}${verdict}`,
    meanP95(evaluation.responseMeanMs, evaluation.responseP95Ms),
    latency && latency.samples ? meanP95(latency.meanMs, latency.p95Ms) : '—',
  ];
}

export interface SystemReadings { poseFps: number | null; renderFps: number | null; inferenceMs: number | null; processingMs: number | null }

/** Label / value pairs for the system row. */
export function systemReadings(live: SystemReadings, metrics: MetricsSnapshot): [string, string][] {
  return [
    ['Pose FPS', whole(live.poseFps)], ['Render FPS', whole(live.renderFps)],
    ['Inference', whole(live.inferenceMs, ' ms')], ['Processing', whole(live.processingMs, ' ms')],
    ['First / last minute FPS', `${whole(metrics.firstMinuteFps)} / ${whole(metrics.lastMinuteFps)}`],
    ['FPS decline', whole(metrics.fpsDeclinePercent, '%')],
    ['Body-loss incidents', `${metrics.bodyLossIncidents}`],
  ];
}
