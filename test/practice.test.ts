import { describe, expect, it } from 'vitest';
import { createPracticeState, practiceCommand, updatePractice, tickPractice, PRACTICE_DURATION_MS } from '@/engine/core/practice';
import type { PracticeReadout, PracticeState } from '@/engine/core/practice';
import type { PoseId } from '@/engine/core/trial';

const still: PracticeReadout = { lane: 'CENTER', upKnee: null, isHandsOnHips: false, clapArmed: false };
function start(pose: PoseId): PracticeState {
  return practiceCommand(practiceCommand(createPracticeState(), { type: 'select', pose }), { type: 'start' });
}
const frame: typeof updatePractice = (state, events = [], readout = still) => updatePractice(state, events, readout);

describe('guided practice', () => {
  it('defaults to guided lane practice with five repetitions and requires Start', () => {
    const state = createPracticeState();
    expect(state).toMatchObject({ mode: 'guided', pose: 'lateral', goal: 5, phase: 'idle', count: 0 });
    expect(frame(state, [{ pose: 'lateral', lane: 'LEFT' }], still)).toBe(state);
  });

  it('counts complete centre-side-centre lane repetitions and alternates sides', () => {
    let state = start('lateral');
    expect(frame(state, [], { ...still, lane: 'LEFT' })).toBe(state);
    state = frame(state, [], still);
    expect(frame(state, [{ pose: 'lateral', lane: 'RIGHT' }], still)).toBe(state);
    state = frame(state, [{ pose: 'lateral', lane: 'LEFT' }], { ...still, lane: 'LEFT' });
    expect(state).toMatchObject({ count: 0, laneStep: 'back' });
    state = frame(state, [{ pose: 'lateral', lane: 'CENTER' }], still);
    expect(state).toMatchObject({ count: 1, nextSide: 'RIGHT', phase: 'ready' });
    state = frame(state, [], still);
    state = frame(state, [{ pose: 'lateral', lane: 'RIGHT' }], { ...still, lane: 'RIGHT' });
    state = frame(state, [{ pose: 'lateral', lane: 'CENTER' }], still);
    expect(state).toMatchObject({ count: 2, nextSide: 'LEFT' });
  });

  it('seeds a knee without counting then requires the prompted opposite side', () => {
    let state = start('knees');
    expect(frame(state, [{ pose: 'knees', knee: 'RIGHT' }], still)).toBe(state);
    state = frame(state, [{ pose: 'knees', knee: 'LEFT' }], { ...still, upKnee: 'LEFT' });
    expect(state).toMatchObject({ count: 0, targetKnee: 'RIGHT' });
    expect(frame(state, [{ pose: 'knees', knee: 'LEFT' }], still)).toBe(state);
    expect(frame(state, [{ pose: 'knees' }], still)).toBe(state);
    state = frame(state, [{ pose: 'hips' }, { pose: 'knees', knee: 'RIGHT' }], still);
    expect(state).toMatchObject({ count: 1, targetKnee: 'LEFT' });
    state = frame(state, [{ pose: 'knees', knee: 'LEFT' }, { pose: 'knees', knee: 'RIGHT' }], still);
    expect(state).toMatchObject({ count: 2, targetKnee: 'RIGHT' });
  });

  it('requires hands off hips before each new hold', () => {
    let state = start('hips');
    const held = { ...still, isHandsOnHips: true };
    expect(frame(state, [{ pose: 'hips' }], held)).toBe(state);
    state = frame(state, [], still);
    state = frame(state, [{ pose: 'clap' }, { pose: 'hips' }], held);
    expect(state).toMatchObject({ count: 1, phase: 'ready' });
    expect(frame(state, [{ pose: 'hips' }], held)).toBe(state);
    state = frame(state, [], still);
    expect(frame(state, [{ pose: 'hips' }], held).count).toBe(2);
  });

  it('requires an armed clap, including previous arming on the disarm frame', () => {
    let state = start('clap');
    expect(frame(state, [{ pose: 'knees', knee: 'LEFT' }], still)).toBe(state);
    state = frame(state, [], { ...still, clapArmed: true });
    expect(state.phase).toBe('active');
    state = frame(state, [{ pose: 'clap' }], still);
    expect(state).toMatchObject({ count: 1, phase: 'ready' });
    expect(frame(state, [], still)).toBe(state);
    expect(frame(state, [{ pose: 'clap' }], still)).toBe(state);
    expect(frame(state, [{ pose: 'clap' }], { ...still, clapArmed: true }).count).toBe(2);
  });

  it.each([5, 10] as const)('completes exactly %i repetitions before an automatic transition', goal => {
    let state = practiceCommand(createPracticeState(), { type: 'goal', goal });
    state = practiceCommand(state, { type: 'select', pose: 'clap' });
    state = practiceCommand(state, { type: 'start' });
    for (let i = 0; i < goal; i++) state = frame(state, [{ pose: 'clap' }], { ...still, clapArmed: true });
    expect(state).toMatchObject({ count: goal, phase: 'complete', results: { clap: 'completed' } });
    expect(frame(state, [{ pose: 'clap' }], still)).toBe(state);
    expect(tickPractice(state, 2999).phase).toBe('complete');
    expect(tickPractice(state, 3000).phase).toBe('rest');
  });

  it('pauses without counting and resume discards a partial lane repetition', () => {
    let state = frame(start('lateral'), [], still);
    state = frame(state, [{ pose: 'lateral', lane: 'LEFT' }], { ...still, lane: 'LEFT' });
    state = practiceCommand(state, { type: 'pause', reason: 'Tracking lost' });
    expect(state).toMatchObject({ phase: 'paused', pauseReason: 'Tracking lost', count: 0 });
    expect(frame(state, [{ pose: 'lateral', lane: 'CENTER' }], still)).toBe(state);
    state = practiceCommand(state, { type: 'resume' });
    expect(state).toMatchObject({ phase: 'ready', laneStep: 'out', pauseReason: null });
    state = frame(state, [], still);
    expect(frame(state, [{ pose: 'lateral', lane: 'CENTER' }], still)).toBe(state);
  });

  it('preserves successful counts on resume but re-seeds knees', () => {
    let state = frame(start('knees'), [], { ...still, upKnee: 'LEFT' });
    state = frame(state, [{ pose: 'knees', knee: 'RIGHT' }], still);
    state = practiceCommand(state, { type: 'pause' });
    state = practiceCommand(state, { type: 'resume' });
    expect(state).toMatchObject({ count: 1, phase: 'ready', targetKnee: null });
    state = frame(state, [{ pose: 'knees', knee: 'RIGHT' }], { ...still, upKnee: 'RIGHT' });
    expect(state).toMatchObject({ count: 1, targetKnee: 'LEFT' });
  });

  it('locks the goal during ready, active and paused phases', () => {
    let state = start('hips');
    expect(practiceCommand(state, { type: 'goal', goal: 10 })).toBe(state);
    state = frame(state, [], still);
    expect(practiceCommand(state, { type: 'goal', goal: 10 })).toBe(state);
    state = practiceCommand(state, { type: 'pause' });
    expect(practiceCommand(state, { type: 'goal', goal: 10 })).toBe(state);
  });


  it('locks the goal after completion until the whole session is restarted', () => {
    let state = completePose(start('clap'));
    expect(practiceCommand(state, { type: 'goal', goal: 10 })).toBe(state);
    state = practiceCommand(state, { type: 'restart' });
    state = practiceCommand(state, { type: 'goal', goal: 10 });
    expect(state).toMatchObject({ goal: 10, count: 0, phase: 'idle', sessionStarted: false, pose: 'lateral' });
  });

  it('preserves the checkpoint through free practice and requires explicit guided resume', () => {
    let state = tickPractice(start('knees'), 1000);
    state = frame(state, [], { ...still, upKnee: 'LEFT' });
    state = frame(state, [{ pose: 'knees', knee: 'RIGHT' }], still);
    state = practiceCommand(state, { type: 'mode', mode: 'free' });
    expect(state).toMatchObject({ mode: 'free', phase: 'paused', count: 1, elapsedMs: 1000 });
    expect(frame(state, [{ pose: 'clap' }], still)).toBe(state);
    expect(tickPractice(state, 10000)).toBe(state);
    expect(practiceCommand(state, { type: 'resume' })).toBe(state);
    expect(practiceCommand(state, { type: 'select', pose: 'clap' })).toBe(state);
    state = practiceCommand(state, { type: 'mode', mode: 'guided' });
    expect(state.phase).toBe('paused');
    state = practiceCommand(state, { type: 'resume' });
    expect(state).toMatchObject({ phase: 'ready', pose: 'knees', count: 1, targetKnee: null });
  });

  it('completes four poses, rests and repeats while accumulating totals', () => {
    let state = practiceCommand(createPracticeState(), { type: 'start' });
    for (let i = 0; i < 4; i++) state = tickPractice(completePose(state), 3000);
    expect(state).toMatchObject({ phase: 'rest', round: 1, completedRounds: 1, remainingPhaseMs: 20000,
      totals: { lateral: 5, knees: 5, hips: 5, clap: 5 } });
    expect(frame(state, [{ pose: 'clap' }], still)).toBe(state);
    expect(tickPractice(state, 19999).phase).toBe('rest');
    state = tickPractice(state, 20000);
    expect(state).toMatchObject({ phase: 'ready', pose: 'lateral', count: 0, round: 2, elapsedMs: 32000 });
    state = completePose(state);
    expect(state.totals.lateral).toBe(10);
    for (let i = 0; i < 3; i++) state = completePose(tickPractice(state, 3000));
    expect(state).toMatchObject({ phase: 'complete', pose: 'clap', completedRounds: 2 });
    expect(practiceCommand(state, { type: 'finish' }).completedRounds).toBe(2);
  });

  it('skips a pose once, cancels its transition and records incomplete rounds', () => {
    let state = practiceCommand(createPracticeState(), { type: 'start' });
    for (let i = 0; i < 4; i++) state = practiceCommand(state, { type: 'skip' });
    expect(state).toMatchObject({ phase: 'rest', skips: 4, completedRounds: 0 });
    expect(practiceCommand(state, { type: 'skip' })).toBe(state);
    state = practiceCommand(state, { type: 'continue' });
    expect(state).toMatchObject({ pose: 'lateral', phase: 'ready', round: 2 });
    state = completePose(state);
    state = practiceCommand(state, { type: 'skip' });
    expect(state).toMatchObject({ pose: 'knees', phase: 'ready', skips: 4, remainingPhaseMs: 0 });
    expect(tickPractice(state, 4000).pose).toBe('knees');
  });

  it.each(['complete', 'rest'] as const)('preserves %s countdown through pause and resume', phase => {
    let state = completePose(start('clap'));
    if (phase === 'rest') state = tickPractice(state, 3000);
    state = tickPractice(state, 1000);
    const remaining = state.remainingPhaseMs, elapsed = state.elapsedMs;
    state = practiceCommand(state, { type: 'pause', reason: 'Tracking unavailable' });
    expect(tickPractice(state, 9000)).toBe(state);
    state = practiceCommand(state, { type: 'resume' });
    expect(state).toMatchObject({ phase, remainingPhaseMs: remaining, elapsedMs: elapsed, pauseReason: null });
  });

  it('ends immediately at 20 minutes before counting further reps', () => {
    let state = tickPractice(start('hips'), PRACTICE_DURATION_MS - 1);
    state = tickPractice(state, 10);
    expect(state).toMatchObject({ phase: 'summary', elapsedMs: PRACTICE_DURATION_MS, finishReason: 'time', unfinishedPose: 'hips' });
    expect(frame(state, [{ pose: 'hips' }], still)).toBe(state);
    expect(tickPractice(state, 1000)).toBe(state);
  });

  it('expires during transition/rest without advancing or inventing unfinished poses', () => {
    let state = completePose(start('clap'));
    state = { ...state, elapsedMs: PRACTICE_DURATION_MS - 1 };
    expect(tickPractice(state, 3000)).toMatchObject({ phase: 'summary', pose: 'clap', round: 1, unfinishedPose: null });
    state = tickPractice({ ...state, elapsedMs: 0 }, 3000);
    expect(tickPractice({ ...state, elapsedMs: PRACTICE_DURATION_MS - 1 }, 20000)).toMatchObject({ phase: 'summary', round: 1, unfinishedPose: null });
  });

  it('finishes manually and reset cancels every pending transition', () => {
    let state = tickPractice(start('knees'), 500);
    state = practiceCommand(state, { type: 'pause' });
    state = practiceCommand(state, { type: 'finish' });
    expect(state).toMatchObject({ phase: 'summary', unfinishedPose: 'knees', finishReason: 'manual', elapsedMs: 500 });
    expect(practiceCommand(state, { type: 'finish' })).toBe(state);
    state = practiceCommand(completePose(start('clap')), { type: 'restart' });
    expect(state).toEqual(createPracticeState());
    expect(tickPractice(state, 10000)).toBe(state);
  });

  it('carries elapsed time across a long transition/rest tick and ignores invalid deltas', () => {
    const state = completePose(start('clap'));
    expect(tickPractice(state, 24000)).toMatchObject({ phase: 'ready', round: 2, elapsedMs: 24000 });
    for (const delta of [0, -1, NaN, Infinity]) expect(tickPractice(state, delta)).toBe(state);
    expect(practiceCommand(createPracticeState(), { type: 'finish' }).phase).toBe('idle');
    expect(practiceCommand(createPracticeState(), { type: 'continue' }).phase).toBe('idle');
  });
});

function completePose(initial: PracticeState): PracticeState {
  let state = initial;
  if (state.pose === 'knees') state = frame(state, [], { ...still, upKnee: 'LEFT' });
  while (state.count < state.goal) {
    if (state.pose === 'lateral') {
      state = frame(state, [], still);
      state = frame(state, [{ pose: 'lateral', lane: state.nextSide }], { ...still, lane: state.nextSide });
      state = frame(state, [{ pose: 'lateral', lane: 'CENTER' }], still);
    } else if (state.pose === 'knees') {
      state = frame(state, [{ pose: 'knees', knee: state.targetKnee! }], still);
    } else {
      state = frame(state, [], { ...still, clapArmed: true });
      state = frame(state, [{ pose: state.pose }], { ...still, isHandsOnHips: state.pose === 'hips', clapArmed: true });
    }
  }
  return state;
}
