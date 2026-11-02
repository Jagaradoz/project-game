import { describe, expect, it } from 'vitest';
import { summarizePose, type EvaluationAttempt } from '@/engine/core/autoEvaluation';
import { createMetrics, EMPTY_LATENCY } from '@/engine/core/metrics';
import { evaluationCells, meanP95, otherMovements, ratePercent, systemReadings } from '@/lib/testing/evaluationPresentation';
import type { DiagnosticEvent } from '@/engine/core/diagnostics';
import { diagnosticMessage } from '@/lib/testing/diagnosticPresentation';

const attempt = (overrides: Partial<EvaluationAttempt>): EvaluationAttempt => ({
  id: 1, pose: 'knees', target: 'LEFT_KNEE', round: 1, openedMs: 0, closedMs: 0, outcome: 'correct', responseMs: 500, detected: null, ...overrides });

describe('evaluation presentation', () => {
  it('formats error rates with their interval and empty values as dashes', () => {
    expect(ratePercent({ value: null, low: null, high: null })).toBe('—');
    expect(ratePercent({ value: 0.1, low: 0.028, high: 0.301 })).toBe('10% (3–30%)');
    expect(meanP95(null, null)).toBe('—');
    expect(meanP95(412.4, 600)).toBe('412 / 600 ms');
  });
  it('lists the movement recognised instead', () => {
    const evaluation = summarizePose([
      attempt({ outcome: 'otherMovement', detected: { pose: 'clap' } }),
      attempt({ outcome: 'otherMovement', detected: { pose: 'lateral', lane: 'LEFT' } }),
    ]);
    expect(otherMovements(evaluation)).toBe('2 (side step 1, clap 1)');
    expect(otherMovements(summarizePose([]))).toBe('0');
  });
  it('builds one row per movement, showing lane and knee errors only where they apply', () => {
    const evaluation = summarizePose([attempt({}), attempt({ outcome: 'wrongKnee', responseMs: null, detected: { pose: 'knees', knee: 'RIGHT' } })], 10);
    const latency = { ...EMPTY_LATENCY, meanMs: 80, p95Ms: 120, samples: 3 };
    expect(evaluationCells('knees', evaluation, latency)).toEqual(['2', '1', '0', '—', '1', '0', '50% (9–91%) · fail', '500 / 500 ms', '80 / 120 ms']);
    expect(evaluationCells('lateral', summarizePose([]), EMPTY_LATENCY)).toEqual(['0', '0', '0', '0', '—', '0', '—', '—', '—']);
    expect(evaluationCells('overall', evaluation, null)[3]).toBe('0');
  });
  it('lists the system readings', () => {
    const readings = systemReadings({ poseFps: 29.6, renderFps: null, inferenceMs: 18.2, processingMs: 2 }, createMetrics().snapshot());
    expect(Object.fromEntries(readings)).toMatchObject({ 'Pose FPS': '30', 'Render FPS': '—', Inference: '18 ms', 'First / last minute FPS': '— / —', 'Body-loss incidents': '0' });
  });
  it('describes scored and voided attempts in the event log', () => {
    const event = (name: string, data: DiagnosticEvent['data']): DiagnosticEvent => ({ id: 1, category: 'evaluation', event: name, data, timestamp: '', elapsedMs: 0 });
    expect(diagnosticMessage(event('attempt', { pose: 'lateral', outcome: 'correct', responseMs: 612.4 }))).toBe('Side steps: correct · 612 ms');
    expect(diagnosticMessage(event('attempt', { pose: 'knees', outcome: 'wrongKnee', responseMs: null }))).toBe('Knee lifts: wrong knee');
    expect(diagnosticMessage(event('voided', { pose: 'clap', reason: 'tracking' }))).toBe('Overhead clap: not scored (tracking lost)');
  });
});
