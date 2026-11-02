import { describe, expect, it } from 'vitest';
import {
  createEvaluationState, promptKey, summarizeEvaluation, summarizePose, updateEvaluation, wilsonInterval,
  type EvaluationAttempt, type EvaluationState,
} from '@/engine/core/autoEvaluation';
import { createPracticeState, type PracticeState } from '@/engine/core/practice';
import type { PoseEvent } from '@/engine/core/trial';

const CONFIG = { attemptMs: 5000, maxAttempts: 3 };
const base = createPracticeState();
const cue = (overrides: Partial<PracticeState>): PracticeState => ({ ...base, phase: 'active', round: 1, step: 0, count: 0, ...overrides });
const lateralOut = cue({ pose: 'lateral', laneStep: 'out', nextSide: 'LEFT' });
const lateralBack = cue({ pose: 'lateral', laneStep: 'back', nextSide: 'LEFT' });
const leftKnee = cue({ pose: 'knees', targetKnee: 'LEFT' });
const hips = cue({ pose: 'hips' });

/** Opens the cue at t=0, then plays one frame at `nowMs`. */
function play(prompted: PracticeState, events: PoseEvent[], nowMs: number, next = prompted, isTracking = true): EvaluationState {
  const opened = updateEvaluation(createEvaluationState(), prompted, prompted, [], true, 0, CONFIG);
  return updateEvaluation(opened, prompted, next, events, isTracking, nowMs, CONFIG);
}

describe('promptKey', () => {
  it('scores only active guided cues, plus the clap setup cue', () => {
    expect(promptKey(cue({ pose: 'hips', phase: 'ready' }))).toBeNull();
    expect(promptKey(cue({ pose: 'clap', phase: 'ready' }))).toMatchObject({ target: null });
    expect(promptKey(cue({ pose: 'clap', phase: 'rest' }))).toBeNull();
    expect(promptKey(cue({ pose: 'hips', mode: 'free' }))).toBeNull();
    expect(promptKey(cue({ pose: 'knees', targetKnee: null }))).toBeNull();
  });
  it('targets the prompted side going out and the centre coming back', () => {
    expect(promptKey(lateralOut)?.target).toBe('LEFT');
    expect(promptKey(lateralBack)?.target).toBe('CENTER');
    expect(promptKey(leftKnee)?.target).toBe('LEFT_KNEE');
    expect(promptKey(lateralOut)?.key).not.toBe(promptKey(lateralBack)?.key);
  });
});

describe('updateEvaluation outcomes', () => {
  it('scores a correct side step with its cue-to-detection response time', () => {
    const state = play(lateralOut, [{ pose: 'lateral', lane: 'LEFT' }], 640, lateralBack);
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]).toMatchObject({ pose: 'lateral', target: 'LEFT', outcome: 'correct', responseMs: 640, detected: null });
    // The return-to-centre cue opens at once as the next attempt.
    expect(state.open).toMatchObject({ target: 'CENTER', openedMs: 640 });
  });
  it('scores a step to the other side as a wrong lane, once', () => {
    const state = play(lateralOut, [{ pose: 'lateral', lane: 'RIGHT' }], 300);
    expect(state.attempts[0]).toMatchObject({ outcome: 'wrongLane', responseMs: null, detected: { lane: 'RIGHT' } });
    expect(state.open).toBeNull();
    const later = updateEvaluation(state, lateralOut, lateralOut, [{ pose: 'lateral', lane: 'CENTER' }], true, 900, CONFIG);
    expect(later.attempts).toHaveLength(1);
  });
  it('scores the other knee as a wrong knee', () => {
    expect(play(leftKnee, [{ pose: 'knees', knee: 'RIGHT' }], 200).attempts[0]?.outcome).toBe('wrongKnee');
    expect(play(leftKnee, [{ pose: 'knees', knee: 'LEFT' }], 200).attempts[0]?.outcome).toBe('correct');
  });
  it('records which movement was recognised instead', () => {
    const state = play(hips, [{ pose: 'clap' }], 200);
    expect(state.attempts[0]).toMatchObject({ outcome: 'otherMovement', detected: { pose: 'clap' } });
  });
  it('scores a cue with no detection inside the window as missed', () => {
    expect(play(hips, [], 4999).attempts).toHaveLength(0);
    expect(play(hips, [], 5000).attempts[0]).toMatchObject({ outcome: 'missed', detected: null, closedMs: 5000 });
  });
  it('lets a matching detection win over a wrong one in the same frame', () => {
    const state = play(lateralOut, [{ pose: 'knees', knee: 'LEFT' }, { pose: 'lateral', lane: 'LEFT' }], 100, lateralBack);
    expect(state.attempts[0]?.outcome).toBe('correct');
  });
  it('scores a clap that arms and completes from its setup cue in one frame', () => {
    const ready = cue({ pose: 'clap', phase: 'ready' });
    const counted = cue({ pose: 'clap', phase: 'ready', count: 1 });
    const state = updateEvaluation(createEvaluationState(), ready, counted, [{ pose: 'clap' }], true, 0, CONFIG);
    expect(state.attempts[0]).toMatchObject({ pose: 'clap', outcome: 'correct', responseMs: 0 });
    expect(state.open).toMatchObject({ key: promptKey(counted)?.key });
  });
});

describe('updateEvaluation voiding', () => {
  it('voids an open attempt when tracking is lost, ignoring its detections', () => {
    const state = play(hips, [{ pose: 'hips' }], 200, hips, false);
    expect(state.attempts).toHaveLength(0);
    expect(state.voided.tracking).toBe(1);
    expect(updateEvaluation(state, hips, hips, [], false, 300, CONFIG)).toBe(state);
  });
  it('voids on a pause, and opens the cue again once it returns', () => {
    const paused = { ...hips, phase: 'paused' as const, pauseReason: 'Tab hidden' };
    const state = play(hips, [], 200, paused);
    expect(state.voided.paused).toBe(1);
    const resumed = updateEvaluation(state, hips, hips, [], true, 1000, CONFIG);
    expect(resumed.open).toMatchObject({ openedMs: 1000 });
  });
  it('counts a tracking pause as lost tracking', () => {
    const paused = { ...hips, phase: 'paused' as const, pauseReason: 'Tracking unavailable' };
    expect(play(hips, [], 200, paused).voided.tracking).toBe(1);
  });
  it('voids on a skip or a cue change between pose frames', () => {
    const opened = updateEvaluation(createEvaluationState(), hips, hips, [], true, 0, CONFIG);
    const skipped = cue({ pose: 'knees', step: 1, targetKnee: 'LEFT' });
    const state = updateEvaluation(opened, skipped, skipped, [], true, 100, CONFIG);
    expect(state.voided.cueChanged).toBe(1);
    expect(state.attempts).toHaveLength(0);
    expect(state.open).toMatchObject({ pose: 'knees', openedMs: 100 });
  });
  it('does not score a cue again after it was decided, even across a pause', () => {
    const wrong = play(hips, [{ pose: 'clap' }], 100);
    const paused = updateEvaluation(wrong, hips, { ...hips, phase: 'paused' }, [], true, 200, CONFIG);
    const resumed = updateEvaluation(paused, hips, hips, [], true, 300, CONFIG);
    expect(resumed.open).toBeNull();
    expect(resumed.voided.paused).toBe(0);
  });
  it('keeps only the most recent attempts and counts the dropped ones', () => {
    let state = createEvaluationState();
    for (let count = 0; count < 5; count++) {
      const shown = cue({ pose: 'hips', count });
      state = updateEvaluation(state, shown, cue({ pose: 'hips', count: count + 1 }), [{ pose: 'hips' }], true, count * 1000, CONFIG);
    }
    expect(state.attempts.map(a => a.id)).toEqual([3, 4, 5]);
    expect(state.dropped).toBe(2);
  });
});

describe('summaries', () => {
  it('computes a 95% Wilson interval', () => {
    expect(wilsonInterval(0, 0)).toEqual({ value: null, low: null, high: null });
    const none = wilsonInterval(0, 10);
    expect(none.value).toBe(0);
    expect(none.low).toBe(0);
    expect(none.high).toBeCloseTo(0.2775, 3);
    const some = wilsonInterval(2, 20);
    expect(some.value).toBeCloseTo(0.1);
    expect(some.low).toBeCloseTo(0.0279, 3);
    expect(some.high).toBeCloseTo(0.3010, 3);
    expect(wilsonInterval(10, 10).high).toBeCloseTo(1);
  });
  it('tallies outcomes, error rate, pass and response times per pose and overall', () => {
    const attempt = (id: number, overrides: Partial<EvaluationAttempt>): EvaluationAttempt => ({
      id, pose: 'lateral', target: 'LEFT', round: 1, openedMs: 0, closedMs: 0, outcome: 'correct', responseMs: 400, detected: null, ...overrides });
    const attempts = [
      ...Array.from({ length: 18 }, (_, i) => attempt(i + 1, { responseMs: (i + 1) * 100 })),
      attempt(19, { outcome: 'wrongLane', responseMs: null, detected: { pose: 'lateral', lane: 'RIGHT' } }),
      attempt(20, { pose: 'clap', target: null, outcome: 'otherMovement', responseMs: null, detected: { pose: 'hips' } }),
      attempt(21, { pose: 'knees', target: 'LEFT_KNEE', outcome: 'missed', responseMs: null }),
    ];
    const lateral = summarizePose(attempts.filter(a => a.pose === 'lateral'), 10);
    expect(lateral).toMatchObject({ attempts: 19, correct: 18, errors: { missed: 0, wrongLane: 1, wrongKnee: 0, otherMovement: 0 }, passes: true });
    expect(lateral.responseMeanMs).toBe(950);
    expect(lateral.responseP95Ms).toBe(1800);
    const state = { ...createEvaluationState(), attempts, dropped: 4 };
    const summary = summarizeEvaluation(state);
    expect(summary.byPose.clap).toMatchObject({ attempts: 1, correct: 0, passes: false, otherByPose: { hips: 1 }, responseMeanMs: null, responseP95Ms: null });
    expect(summary.byPose.hips).toMatchObject({ attempts: 0, passes: null, errorRate: { value: null } });
    expect(summary.overall).toMatchObject({ attempts: 21, correct: 18, errors: { missed: 1, wrongLane: 1, otherMovement: 1 } });
    expect(summary.overall.errorRate.value).toBeCloseTo(3 / 21);
    expect(summary.dropped).toBe(4);
    expect(summary.voided).toEqual({ tracking: 0, paused: 0, cueChanged: 0 });
  });
});
