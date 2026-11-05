import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeBody, createFakeBodyState, fakeBodyKeyDown, fakeBodyKeyUp, fakeBodyPose } from '@/engine/pose/fakeBody';
import type { FakeBodyState } from '@/engine/pose/fakeBody';
import { createClapState, updateClap } from '@/engine/detectors/clap';
import { createHandsOnHipsState, updateHandsOnHips } from '@/engine/detectors/handsOnHips';
import { createJogState, updateJog } from '@/engine/detectors/jog';
import { createLateralState, updateLateral } from '@/engine/detectors/lateral';
import { measureBody } from '@/engine/util/landmarks';

const FRAME_MS = 1000 / 30;

function feed<S>(start: S, reducer: (s: S, pose: ReturnType<typeof fakeBodyPose>, t: number) => S, body: FakeBodyState, fromMs: number, toMs: number): S {
  let state = start;
  for (let t = fromMs; t < toMs; t += FRAME_MS) state = reducer(state, fakeBodyPose(body, t), t);
  return state;
}

describe('fake body pose', () => {
  it('starts as a full body standing still', () => {
    expect(measureBody(fakeBodyPose(createFakeBodyState(), 0))?.kneesVisible).toBe(true);
  });

  it('B toggles the whole body out of frame and back', () => {
    const gone = fakeBodyKeyDown(createFakeBodyState(), 'b', 0);
    expect(fakeBodyPose(gone, 0)).toBeNull();
    expect(fakeBodyPose(fakeBodyKeyDown(gone, 'B', 0), 0)).not.toBeNull();
  });

  it('N hides only the knees', () => {
    const body = measureBody(fakeBodyPose(fakeBodyKeyDown(createFakeBodyState(), 'n', 0), 0));
    expect(body).not.toBeNull();
    expect(body?.kneesVisible).toBe(false);
  });

  it('Q and E hold a lane until the key is released', () => {
    const start = createFakeBodyState();
    const calibrated = feed(createLateralState(), updateLateral, start, 0, 1500);
    const left = fakeBodyKeyDown(start, 'q', 1500);
    const right = fakeBodyKeyDown(start, 'e', 1500);
    expect(feed(calibrated, updateLateral, left, 1500, 2500).label).toBe('LEFT');
    expect(feed(calibrated, updateLateral, right, 1500, 2500).label).toBe('RIGHT');
    expect(fakeBodyKeyUp(left, 'q')).toEqual(start);
  });

  it.each([['1', 60], ['2', 120], ['3', 180]])('G jogs and key %s sets about %i steps per minute', (key, spm) => {
    const body = fakeBodyKeyDown(fakeBodyKeyDown(createFakeBodyState(), key, 0), 'g', 0);
    const jog = feed(createJogState(), updateJog, body, 0, 6000);
    expect(jog.isJogging).toBe(true);
    expect(jog.cadenceSpm).toBeGreaterThan(spm - 15);
    expect(jog.cadenceSpm).toBeLessThan(spm + 15);
  });

  it('H holds hands on hips', () => {
    const body = fakeBodyKeyDown(createFakeBodyState(), 'h', 0);
    expect(feed(createHandsOnHipsState(), updateHandsOnHips, body, 0, 1500).isActive).toBe(true);
  });

  it('C performs one overhead clap', () => {
    const body = fakeBodyKeyDown(createFakeBodyState(), 'c', 500);
    const clap = feed(feed(createClapState(), updateClap, createFakeBodyState(), 0, 500), updateClap, body, 500, 2000);
    expect(clap.clapCount).toBe(1);
  });

  it('ignores unrelated keys', () => {
    const state = createFakeBodyState();
    expect(fakeBodyKeyDown(state, 'x', 0)).toBe(state);
    expect(fakeBodyKeyUp(state, 'x')).toBe(state);
  });
});

describe('fake body camera', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('reacts to keys, and dispose removes listeners and stops the stream', () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => ({ fillRect: vi.fn(), fillStyle: '' }), captureStream: () => ({ getTracks: () => [{ stop }] }) };
    vi.stubGlobal('document', { createElement: () => canvas });
    const target = new EventTarget();
    const press = (key: string) => target.dispatchEvent(Object.assign(new Event('keydown'), { key }));

    const fake = createFakeBody(target);
    expect(fake.landmarks(0)).not.toBeNull();
    press('b');
    expect(fake.landmarks(0)).toBeNull();

    fake.dispose();
    press('b');
    expect(fake.landmarks(0)).toBeNull();
    expect(stop).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
