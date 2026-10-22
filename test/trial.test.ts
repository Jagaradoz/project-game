import { describe, expect, it } from 'vitest';
import { createTrialState, startTrial, stopTrial, updateTrial } from '@/engine/core/trial';
import type { PoseEvent, PoseReadout, TrialState } from '@/engine/core/trial';

const config = { attempts: 3, attemptMs: 1000, restMs: 100, maxErrorPercent: 10 };
const still: PoseReadout = { lane: 'CENTER', upKnee: null, isHandsOnHips: false };

/** Steps past the opening rest so the first prompt is open. */
function opened(pose: Parameters<typeof startTrial>[1], readout: PoseReadout = still): TrialState {
  return updateTrial(startTrial(createTrialState(), pose, 0), [], readout, 100, config);
}

describe('guided trial', () => {
  it('waits out the rest before prompting', () => {
    const started = startTrial(createTrialState(), 'clap', 0);
    expect(updateTrial(started, [], still, 50, config)).toBe(started);
    expect(opened('clap').active).toMatchObject({ phase: 'attempt', phaseStartMs: 100 });
  });

  it('scores the prompted pose as correct and another pose as incorrect', () => {
    const correct = updateTrial(opened('clap'), [{ pose: 'clap' }], still, 200, config);
    expect(correct.results.clap).toEqual({ correct: 1, missed: 0, incorrect: 0 });
    expect(correct.active?.phase).toBe('rest');
    const wrong = updateTrial(opened('clap'), [{ pose: 'knees' }], still, 200, config);
    expect(wrong.results.clap).toEqual({ correct: 0, missed: 0, incorrect: 1 });
  });

  it('prefers a match when a wrong pose fires in the same frame', () => {
    const events: PoseEvent[] = [{ pose: 'lateral', lane: 'LEFT' }, { pose: 'clap' }];
    expect(updateTrial(opened('clap'), events, still, 200, config).results.clap?.correct).toBe(1);
  });

  it('counts a silent window as missed', () => {
    const open = opened('hips');
    expect(updateTrial(open, [], still, 1099, config)).toBe(open);
    expect(updateTrial(open, [], still, 1100, config).results.hips).toEqual({ correct: 0, missed: 1, incorrect: 0 });
  });

  it('alternates lateral prompts and requires the prompted lane', () => {
    const open = opened('lateral');
    expect(open.active?.target).toBe('LEFT');
    expect(updateTrial(open, [{ pose: 'lateral', lane: 'RIGHT' }], still, 200, config).results.lateral?.incorrect).toBe(1);
    const left = updateTrial(open, [{ pose: 'lateral', lane: 'LEFT' }], still, 200, config);
    const back = updateTrial(left, [], { ...still, lane: 'LEFT' }, 300, config);
    expect(back.active?.target).toBe('CENTER');
    const centred = updateTrial(back, [{ pose: 'lateral', lane: 'CENTER' }], still, 400, config);
    expect(updateTrial(centred, [], still, 500, config).active?.target).toBe('RIGHT');
  });

  it('holds knee and hip prompts until the body is in a starting position', () => {
    const knees = opened('knees');
    expect(knees.active?.phase).toBe('ready');
    expect(updateTrial(knees, [{ pose: 'knees' }], still, 200, config).results.knees).toEqual({ correct: 0, missed: 0, incorrect: 0 });
    expect(updateTrial(knees, [], { ...still, upKnee: 'LEFT' }, 200, config).active).toMatchObject({ phase: 'attempt', target: 'RIGHT_KNEE' });
    expect(opened('hips', { ...still, isHandsOnHips: true }).active?.phase).toBe('ready');
  });

  it('requires the prompted knee side during timed evaluation', () => {
    const open = opened('knees', { ...still, upKnee: 'LEFT' });
    expect(open.active?.target).toBe('RIGHT_KNEE');
    expect(updateTrial(open, [{ pose: 'knees', knee: 'LEFT' }], still, 200, config).results.knees?.incorrect).toBe(1);
    expect(updateTrial(open, [{ pose: 'knees', knee: 'RIGHT' }], still, 200, config).results.knees?.correct).toBe(1);
  });

  it('finishes after the configured attempts and clears a stopped trial', () => {
    let state = opened('clap');
    for (let i = 0; i < 3; i++) {
      state = updateTrial(state, [{ pose: 'clap' }], still, 200 + i * 300, config);
      state = updateTrial(state, [], still, 300 + i * 300, config);
    }
    expect(state.active).toBeNull();
    expect(state.results.clap).toEqual({ correct: 3, missed: 0, incorrect: 0 });
    expect(updateTrial(state, [{ pose: 'clap' }], still, 5000, config)).toBe(state);
    const stopped = stopTrial(opened('hips'));
    expect(stopped).toEqual(createTrialState());
    expect(stopTrial(stopped)).toBe(stopped);
  });
});
