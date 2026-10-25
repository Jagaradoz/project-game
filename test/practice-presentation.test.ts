import { describe, expect, it } from 'vitest';
import { createPracticeState, practiceCommand, updatePractice } from '@/engine/core/practice';
import { practiceCue } from '@/lib/testing/practicePresentation';

const still = { lane: 'CENTER' as const, upKnee: null, isHandsOnHips: false, clapArmed: false };

describe('one-action pose guidance', () => {
  it('follows the actual lateral target and explains the direction back to centre', () => {
    let p = practiceCommand(createPracticeState(), { type: 'start' });
    p = updatePractice(p, [], still);
    expect(practiceCue(p, 'CENTER')).toMatchObject({ title: 'Move left', direction: 'left' });
    p = updatePractice(p, [{ pose: 'lateral', lane: 'LEFT' }], { ...still, lane: 'LEFT' });
    expect(practiceCue(p, 'LEFT')).toMatchObject({ title: 'Return to centre', detail: 'Move right to the middle.', direction: 'right' });
    p = updatePractice(p, [{ pose: 'lateral', lane: 'CENTER' }], still);
    expect(practiceCue(p, 'CENTER')).toMatchObject({ title: 'Move right', direction: 'right' });
    p = updatePractice(p, [], still);
    p = updatePractice(p, [{ pose: 'lateral', lane: 'RIGHT' }], { ...still, lane: 'RIGHT' });
    expect(practiceCue(p, 'RIGHT')).toMatchObject({ title: 'Return to centre', detail: 'Move left to the middle.', direction: 'left' });
  });
  it('asks for centre during setup and names the exact knee after seeding', () => {
    const initial = createPracticeState();
    expect(practiceCue(initial, 'CENTER').title).toBe('Stand in the centre');
    expect(practiceCue(practiceCommand(initial, { type: 'start' }), 'RIGHT').direction).toBe('left');
    let p = practiceCommand(practiceCommand(initial, { type: 'select', pose: 'knees' }), { type: 'start' });
    expect(practiceCue(p, 'CENTER').title).toBe('Lift either knee');
    p = updatePractice(p, [], { ...still, upKnee: 'LEFT' });
    expect(practiceCue(p, 'CENTER').title).toBe('Lift your right knee');
    p = updatePractice(p, [{ pose: 'knees', knee: 'RIGHT' }], still);
    expect(practiceCue(p, 'CENTER').title).toBe('Lift your left knee');
  });
  it('distinguishes preparation from the action for hands and claps', () => {
    let p = practiceCommand(practiceCommand(createPracticeState(), { type: 'select', pose: 'hips' }), { type: 'start' });
    expect(practiceCue(p, 'CENTER').title).toBe('Release your hands');
    p = updatePractice(p, [], still);
    expect(practiceCue(p, 'CENTER').title).toBe('Hands on hips');
    p = practiceCommand(practiceCommand(createPracticeState(), { type: 'select', pose: 'clap' }), { type: 'start' });
    expect(practiceCue(p, 'CENTER').title).toBe('Separate your hands');
    p = updatePractice(p, [], { ...still, clapArmed: true });
    expect(practiceCue(p, 'CENTER')).toMatchObject({ title: 'Clap overhead', direction: 'up' });
  });
  it('replaces movement instructions when paused, resting, or finished', () => {
    let p = practiceCommand(createPracticeState(), { type: 'start' });
    p = practiceCommand(p, { type: 'pause' });
    expect(practiceCue(p, 'LEFT')).toMatchObject({ title: 'Session paused', direction: null });
    expect(practiceCue({ ...p, phase: 'rest', remainingPhaseMs: 11000 }, 'LEFT')).toMatchObject({ title: 'Rest', detail: 'Next round in 11s.', direction: null });
    expect(practiceCue({ ...p, phase: 'complete', remainingPhaseMs: 2000 }, 'LEFT')).toMatchObject({ title: 'Pose complete', detail: 'Next pose in 2s.' });
    expect(practiceCue(practiceCommand(p, { type: 'finish' }), 'LEFT').title).toBe('Session complete');
  });
});
