import { describe, expect, it } from 'vitest';
import { createPracticeState, practiceCommand, updatePractice } from '@/engine/core/practice';
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

  it.each([5, 10] as const)('completes exactly %i repetitions and waits for manual Next', goal => {
    let state = practiceCommand(createPracticeState(), { type: 'goal', goal });
    state = practiceCommand(state, { type: 'select', pose: 'clap' });
    state = practiceCommand(state, { type: 'start' });
    for (let i = 0; i < goal; i++) state = frame(state, [{ pose: 'clap' }], { ...still, clapArmed: true });
    expect(state).toMatchObject({ count: goal, phase: 'complete', results: { clap: 'completed' } });
    expect(frame(state, [{ pose: 'clap' }], still)).toBe(state);
    expect(practiceCommand(state, { type: 'next' }).phase).toBe('summary');
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

  it('resets the selected counter when changing a completed pose goal', () => {
    let state = start('clap');
    for (let i = 0; i < 5; i++) state = frame(state, [{ pose: 'clap' }], { ...still, clapArmed: true });
    state = practiceCommand(state, { type: 'goal', goal: 10 });
    expect(state).toMatchObject({ goal: 10, count: 0, phase: 'idle' });
    state = practiceCommand(state, { type: 'start' });
    expect(state.results.clap).toBe('pending');
  });

  it('switches modes and selection without counting in free practice', () => {
    let state = practiceCommand(start('clap'), { type: 'mode', mode: 'free' });
    expect(state).toMatchObject({ mode: 'free', phase: 'idle' });
    expect(frame(state, [{ pose: 'clap' }], still)).toBe(state);
    expect(practiceCommand(state, { type: 'start' })).toBe(state);
    state = practiceCommand(state, { type: 'select', pose: 'knees' });
    expect(state).toMatchObject({ mode: 'free', pose: 'knees', count: 0 });
    state = practiceCommand(state, { type: 'mode', mode: 'guided' });
    expect(state).toMatchObject({ mode: 'guided', phase: 'idle' });
  });

  it('supports restart, skips, and a four-pose summary', () => {
    let state = practiceCommand(start('lateral'), { type: 'skip' });
    expect(state).toMatchObject({ pose: 'knees', results: { lateral: 'skipped' } });
    expect(practiceCommand(state, { type: 'next' })).toBe(state);
    state = practiceCommand(state, { type: 'skip' });
    state = practiceCommand(state, { type: 'skip' });
    state = practiceCommand(state, { type: 'start' });
    for (let i = 0; i < 5; i++) state = frame(state, [{ pose: 'clap' }], { ...still, clapArmed: true });
    state = practiceCommand(state, { type: 'restart' });
    expect(state).toMatchObject({ phase: 'idle', count: 0, results: { clap: 'pending', hips: 'skipped' } });
    state = practiceCommand(state, { type: 'skip' });
    expect(state).toMatchObject({ phase: 'summary', results: { lateral: 'skipped', knees: 'skipped', hips: 'skipped', clap: 'skipped' } });
    expect(practiceCommand(state, { type: 'skip' })).toBe(state);
  });
});
