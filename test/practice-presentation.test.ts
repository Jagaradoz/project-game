import { describe, expect, it } from 'vitest';
import { createPracticeState, practiceCommand, updatePractice } from '@/engine/core/practice';
import { practiceCue, practiceTrackingCue } from '@/lib/testing/practicePresentation';

const still = { lane: 'CENTER' as const, upKnee: null, isHandsOnHips: false, clapArmed: false };

describe('body tracking guidance', () => {
  const tracked = { isCameraRunning: true, hasBody: true, kneesVisible: true, isCalibrated: true };

  it('prioritizes camera access and missing body over stale detector readings', () => {
    expect(practiceTrackingCue({ ...tracked, isCameraRunning: false })).toMatchObject({ title: 'Enable Your Camera', direction: null });
    expect(practiceTrackingCue({ ...tracked, hasBody: false })).toMatchObject({ title: 'Body Not Detected', direction: null });
  });

  it('asks for the missing body area before asking the player to calibrate', () => {
    expect(practiceTrackingCue({ ...tracked, kneesVisible: false, isCalibrated: false })).toMatchObject({
      title: 'Show Your Head and Knees', detail: 'Step back until your head and both knees are visible.', direction: null,
    });
    expect(practiceTrackingCue({ ...tracked, isCalibrated: false })).toMatchObject({ title: 'Calibrating', direction: null });
  });

  it('replaces the current movement when tracking drops and restores it after recovery', () => {
    const p = updatePractice(practiceCommand(createPracticeState(), { type: 'start' }), [], still);
    const cue = (tracking: typeof tracked) => practiceTrackingCue(tracking) ?? practiceCue(p, 'CENTER');
    expect(cue(tracked).title).toBe('Move Left');
    expect(cue({ ...tracked, hasBody: false }).title).toBe('Body Not Detected');
    expect(cue({ ...tracked, kneesVisible: false }).title).toBe('Show Your Head and Knees');
    expect(cue(tracked).title).toBe('Move Left');
  });
});

describe('one-action pose guidance', () => {
  it('follows the actual lateral target and explains the direction back to centre', () => {
    let p = practiceCommand(createPracticeState(), { type: 'start' });
    p = updatePractice(p, [], still);
    expect(practiceCue(p, 'CENTER')).toMatchObject({ title: 'Move Left', direction: 'left' });
    p = updatePractice(p, [{ pose: 'lateral', lane: 'LEFT' }], { ...still, lane: 'LEFT' });
    expect(practiceCue(p, 'LEFT')).toMatchObject({ title: 'Return to Centre', detail: 'Move right to the middle.', direction: 'right' });
    p = updatePractice(p, [{ pose: 'lateral', lane: 'CENTER' }], still);
    expect(practiceCue(p, 'CENTER')).toMatchObject({ title: 'Move Right', direction: 'right' });
    p = updatePractice(p, [], still);
    p = updatePractice(p, [{ pose: 'lateral', lane: 'RIGHT' }], { ...still, lane: 'RIGHT' });
    expect(practiceCue(p, 'RIGHT')).toMatchObject({ title: 'Return to Centre', detail: 'Move left to the middle.', direction: 'left' });
  });
  it('asks for centre during setup and names the exact knee after seeding', () => {
    const initial = createPracticeState();
    expect(practiceCue(initial, 'CENTER').title).toBe('Stand in the Centre');
    expect(practiceCue(practiceCommand(initial, { type: 'start' }), 'RIGHT').direction).toBe('left');
    let p = practiceCommand(practiceCommand(initial, { type: 'select', pose: 'knees' }), { type: 'start' });
    expect(practiceCue(p, 'CENTER').title).toBe('Lift Either Knee');
    p = updatePractice(p, [], { ...still, upKnee: 'LEFT' });
    expect(practiceCue(p, 'CENTER').title).toBe('Lift Right Knee');
    p = updatePractice(p, [{ pose: 'knees', knee: 'RIGHT' }], still);
    expect(practiceCue(p, 'CENTER').title).toBe('Lift Left Knee');
  });
  it('distinguishes preparation from the action for hands and claps', () => {
    let p = practiceCommand(practiceCommand(createPracticeState(), { type: 'select', pose: 'hips' }), { type: 'start' });
    expect(practiceCue(p, 'CENTER').title).toBe('Release Your Hands');
    p = updatePractice(p, [], still);
    expect(practiceCue(p, 'CENTER').title).toBe('Hands on Hips');
    p = practiceCommand(practiceCommand(createPracticeState(), { type: 'select', pose: 'clap' }), { type: 'start' });
    expect(practiceCue(p, 'CENTER').title).toBe('Separate Your Hands');
    p = updatePractice(p, [], { ...still, clapArmed: true });
    expect(practiceCue(p, 'CENTER')).toMatchObject({ title: 'Clap Overhead', direction: 'up' });
  });
  it('replaces movement instructions when paused, resting, or finished', () => {
    let p = practiceCommand(createPracticeState(), { type: 'start' });
    p = practiceCommand(p, { type: 'pause' });
    expect(practiceCue(p, 'LEFT')).toMatchObject({ title: 'Session Paused', direction: null });
    expect(practiceCue({ ...p, phase: 'rest', remainingPhaseMs: 11000 }, 'LEFT')).toMatchObject({ title: 'Rest', detail: 'Next round in 11s.', direction: null });
    expect(practiceCue({ ...p, phase: 'complete', remainingPhaseMs: 2000 }, 'LEFT')).toMatchObject({ title: 'Pose Complete', detail: 'Next pose in 2s.' });
    expect(practiceCue(practiceCommand(p, { type: 'finish' }), 'LEFT').title).toBe('Session Complete');
  });
});
