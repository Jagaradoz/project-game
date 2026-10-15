import { expect, it } from 'vitest';
import { createMetrics } from '@/engine/core/metrics';
import { accuracyResult, countingError } from '@/lib/testing/evaluation';

it('reports empty measurements as unavailable and aggregates latency with bounded storage', () => {
  const metrics = createMetrics();
  expect(metrics.snapshot().latencyP95Ms).toBeNull();
  for (let i = 1; i <= 100; i++) metrics.response(i);
  expect(metrics.snapshot().latencyMeanMs).toBe(50.5);
  expect(metrics.snapshot().latencyP95Ms).toBe(95);
  expect(metrics.snapshot().latencySamples).toBe(100);
  metrics.response(NaN);
  expect(metrics.snapshot().latencySamples).toBe(100);
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
it('accuracy uses scored ground truth, not detector confidence', () => {
  expect(accuracyResult({ correct: 9, missed: 1, incorrect: 0 })).toEqual({ attempts: 10, percent: 90, passes: true });
  expect(accuracyResult({ correct: 8, missed: 1, incorrect: 1 }).passes).toBe(false);
  expect(accuracyResult({ correct: 0, missed: 0, incorrect: 0 }).percent).toBeNull();
  expect(countingError(95, 100)).toBe(5);
  expect(countingError(0, 0)).toBeNull();
});
