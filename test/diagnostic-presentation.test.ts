import { describe, expect, it } from 'vitest';
import type { DiagnosticEvent } from '@/engine/core/diagnostics';
import { diagnosticMessage, logTime } from '@/lib/testing/diagnosticPresentation';

const event = (category: DiagnosticEvent['category'], name: string, data: DiagnosticEvent['data'] = {}): DiagnosticEvent => ({
  id: 1, category, event: name, data, timestamp: '2026-10-25T00:00:00.000Z', elapsedMs: 1695230,
});

describe('readable diagnostic presentation', () => {
  it('omits empty performance samples, while preserving the original data', () => {
    const sample = event('performance', 'sample', { poseFps: null, renderFps: null, processingMs: null, latency: { lateral: { meanMs: null } } });
    const original = JSON.stringify(sample);
    expect(diagnosticMessage(sample)).toBeNull();
    expect(JSON.stringify(sample)).toBe(original);
    expect(diagnosticMessage(event('performance', 'sample', { poseFps: 28.4, processingMs: 0 }))).toBe('Camera 28 fps · Processing 0 ms');
  });
  it('turns detector and session events into short instructions and outcomes', () => {
    expect(diagnosticMessage(event('practice', 'counted', { pose: 'knees', count: 2, goal: 5 }))).toBe('Knee lifts: 2/5 reps');
    expect(diagnosticMessage(event('tracking', 'ready'))).toBe('Tracking ready');
    expect(diagnosticMessage(event('detection', 'movement', { pose: 'lateral', lane: 'LEFT' }))).toBe('Moved left');
    expect(diagnosticMessage(event('practice', 'session-finished', { reason: 'time' }))).toBe('20-minute session complete');
    expect(diagnosticMessage(event('practice', 'paused', { reason: 'Tracking unavailable' }))).toBe('Paused: Tracking unavailable');
  });
  it('formats a single elapsed timestamp and bounds unexpected text', () => {
    expect(logTime(1695230)).toBe('28:15');
    expect(logTime(NaN)).toBe('00:00');
    expect(logTime(-100)).toBe('00:00');
    expect(diagnosticMessage(event('error', 'runtime-error', { message: 'x'.repeat(500) }))).toHaveLength(160);
    expect(diagnosticMessage(event('lifecycle', 'new-system-event'))).toBe('New system event');
  });
});
