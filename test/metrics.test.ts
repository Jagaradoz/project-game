import { expect, it } from 'vitest';
import { createMetrics } from '@/engine/core/metrics';
import { trialResult } from '@/lib/testing/evaluation';

it('reports empty measurements as unavailable and aggregates latency with bounded storage', () => {
  const metrics = createMetrics();
  expect(metrics.snapshot().latencyP95Ms).toBeNull();
  for (let i = 1; i <= 100; i++) metrics.response(i % 2 ? 'knees' : 'clap', i);
  expect(metrics.snapshot().latencyMeanMs).toBe(50.5);
  expect(metrics.snapshot().latencyP95Ms).toBe(95);
  expect(metrics.snapshot().latencySamples).toBe(100);
  metrics.response('knees', NaN);
  expect(metrics.snapshot().latencySamples).toBe(100);
  expect(metrics.snapshot().latencyByPose.knees).toMatchObject({ samples: 50, minMs: 1, maxMs: 99, meanMs: 50 });
  expect(metrics.snapshot().latencyByPose.clap).toMatchObject({ samples: 50, p95Ms: 96 });
  expect(metrics.snapshot().latencyByPose.hips).toEqual({ meanMs: null, p95Ms: null, minMs: null, maxMs: null, samples: 0 });
});
it('compares first and last minute render FPS and counts body-loss episodes', () => {
  const metrics = createMetrics();
  for (let i = 1; i <= 36000; i++) metrics.render(i * (1000 / 30), 1000 / 30);
  metrics.bodyLoss();
  expect(metrics.snapshot().fpsMean).toBeCloseTo(30);
  expect(metrics.snapshot().firstMinuteFps).toBeCloseTo(30);
  expect(metrics.snapshot().lastMinuteFps).toBeCloseTo(30);
  expect(metrics.snapshot().fpsDeclinePercent).toBeCloseTo(0);
  expect(metrics.snapshot().bodyLossIncidents).toBe(1);
  expect(metrics.snapshot()).toBe(metrics.snapshot());
  metrics.reset();
  expect(metrics.snapshot().latencySamples).toBe(0);
});
it('error rate counts missed and wrong prompts, and passes only on a complete trial', () => {
  expect(trialResult({ correct: 9, missed: 1, incorrect: 0 })).toEqual({ attempts: 10, errorPercent: 10, isComplete: true, passes: true });
  expect(trialResult({ correct: 8, missed: 1, incorrect: 1 }).passes).toBe(false);
  expect(trialResult({ correct: 5, missed: 0, incorrect: 0 })).toMatchObject({ errorPercent: 0, isComplete: false, passes: false });
  expect(trialResult({ correct: 0, missed: 0, incorrect: 0 }).errorPercent).toBeNull();
});
