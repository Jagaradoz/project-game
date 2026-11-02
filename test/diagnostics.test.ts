import { describe, expect, it } from 'vitest';
import { createDiagnosticLog } from '@/engine/core/diagnostics';
import { createPracticeState } from '@/engine/core/practice';
import { createTrialState } from '@/engine/core/trial';
import { createMetrics } from '@/engine/core/metrics';
import { createEvaluationState, summarizeEvaluation } from '@/engine/core/autoEvaluation';

describe('Test Mode diagnostic log', () => {
  it('bounds history and keeps stable ordered snapshots with a drop count', () => {
    const log = createDiagnosticLog(0, 0);
    const empty = log.snapshot();
    for (let i = 0; i < 505; i++) log.append('detection', 'movement', { pose: 'clap' }, i);
    expect(empty.events).toHaveLength(0);
    expect(log.snapshot().events).toHaveLength(500);
    expect(log.snapshot().dropped).toBe(5);
    expect(log.snapshot().events[0].id).toBe(6);
    expect(log.snapshot().events.at(-1)?.id).toBe(505);
    expect(log.snapshot()).toBe(log.snapshot());
    log.append('tracking', 'lost', {}, 1);
    expect(log.snapshot().events.at(-1)?.elapsedMs).toBe(504);
  });

  it('clears history without losing session metadata or reusing event IDs', () => {
    const log = createDiagnosticLog(0, 0);
    log.append('lifecycle', 'ready', {}, 10);
    log.clear();
    expect(log.snapshot()).toEqual({ startedAt: new Date(0).toISOString(), events: [], dropped: 0 });
    log.append('error', 'camera', { message: 'Denied' }, 20);
    expect(log.snapshot().events[0].id).toBe(2);
  });

  it('exports version, session times, results and measurements as JSON', () => {
    const log = createDiagnosticLog(0, 0);
    log.append('practice', 'counted', { expected: 'clap', detected: 'clap', count: 1 }, 20);
    const practice = createPracticeState(), trial = createTrialState(), metrics = createMetrics().snapshot();
    const performance = { poseFps: 30, renderFps: 60, processingMs: 2, inferenceMs: 18, model: 'lite', delegate: 'GPU' };
    const evaluation = { summary: summarizeEvaluation(createEvaluationState()), attempts: [] };
    const report = JSON.parse(JSON.stringify(log.report('2.35.0-alpha.0', { practice, trial, metrics, performance, evaluation })));
    expect(report).toMatchObject({ schemaVersion: 3, appVersion: '2.35.0-alpha.0', practice, trial, metrics, performance, evaluation });
    expect(report.events[0]).toMatchObject({ elapsedMs: 20, category: 'practice' });
    expect(report.exportedAt).toBeTruthy();
    expect(report).not.toHaveProperty('landmarks');
    expect(report).not.toHaveProperty('video');
  });
});
