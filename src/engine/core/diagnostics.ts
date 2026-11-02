import type { EvaluationAttempt, EvaluationSummary } from './autoEvaluation';
import type { MetricsSnapshot } from './metrics';
import type { PracticeState } from './practice';
import type { TrialState } from './trial';

export const DIAGNOSTIC_CATEGORIES = ['lifecycle', 'tracking', 'detection', 'practice', 'evaluation', 'trial', 'performance', 'error'] as const;
export type DiagnosticCategory = typeof DIAGNOSTIC_CATEGORIES[number];
export interface DiagnosticEvent {
  id: number;
  timestamp: string;
  elapsedMs: number;
  category: DiagnosticCategory;
  event: string;
  data: Readonly<Record<string, unknown>>;
}
export interface DiagnosticSnapshot {
  startedAt: string;
  events: readonly DiagnosticEvent[];
  dropped: number;
}
/** Smoothed pipeline readings at export time. */
export interface PerformanceReading {
  poseFps: number | null;
  renderFps: number | null;
  processingMs: number | null;
  inferenceMs: number | null;
  model: string | null;
  delegate: string | null;
}
/** Guide Mode's continuous evaluation: the summary plus every retained scored attempt. */
export interface EvaluationReport {
  summary: EvaluationSummary;
  attempts: readonly EvaluationAttempt[];
}
export interface DiagnosticReport extends DiagnosticSnapshot {
  schemaVersion: 3;
  appVersion: string;
  exportedAt: string;
  practice: PracticeState;
  trial: TrialState;
  metrics: MetricsSnapshot;
  performance: PerformanceReading;
  evaluation: EvaluationReport;
}
export interface ReportInputs {
  practice: PracticeState;
  trial: TrialState;
  metrics: MetricsSnapshot;
  performance: PerformanceReading;
  evaluation: EvaluationReport;
}

/** Immutable snapshots only change on events; storage is bounded for long visits. */
export function createDiagnosticLog(startedAtMs = Date.now(), startClockMs = performance.now()) {
  let sequence = 0;
  let lastElapsedMs = 0;
  let snapshot: DiagnosticSnapshot = { startedAt: new Date(startedAtMs).toISOString(), events: [], dropped: 0 };
  return {
    append(category: DiagnosticCategory, event: string, data: Readonly<Record<string, unknown>> = {}, clockMs = performance.now()) {
      const elapsedMs = Math.max(lastElapsedMs, clockMs - startClockMs, 0);
      lastElapsedMs = elapsedMs;
      const entry: DiagnosticEvent = { id: ++sequence, timestamp: new Date(startedAtMs + elapsedMs).toISOString(), elapsedMs, category, event, data };
      const overflow = snapshot.events.length >= 500;
      snapshot = { ...snapshot, events: [...(overflow ? snapshot.events.slice(1) : snapshot.events), entry], dropped: snapshot.dropped + Number(overflow) };
    },
    snapshot: () => snapshot,
    clear() { snapshot = { ...snapshot, events: [], dropped: 0 }; },
    report(appVersion: string, inputs: ReportInputs): DiagnosticReport {
      return { ...snapshot, schemaVersion: 3, appVersion, exportedAt: new Date().toISOString(), ...inputs };
    },
  };
}
