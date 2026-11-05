/**
 * Development-only stand-in for the webcam and MediaPipe, driven from the
 * keyboard. It replaces just those two inputs, so the detectors, pausing and the
 * game reducer run for real. It says nothing about real pose accuracy.
 *
 * Keys avoid the dev game controls in core/input.ts.
 */

import { LANDMARK } from '@/engine/config';
import { makePose } from '@/engine/pose/syntheticPose';
import type { PoseInitResult } from '@/engine/pose/pose';
import type { PoseLandmarks } from '@/engine/types';

const LEAN_OFFSET = 0.15;
const KNEE_LIFT = 0.12;
/** Real hands over the hips lower their confidence below the body check's bar. */
const COVERED_HIP_VISIBILITY = 0.4;
const CLAP_RAISE_MS = 350;
const CLAP_TOGETHER_MS = 200;
const CLAP_WRIST_OFFSET = 0.01;
const CADENCE_BY_KEY: Record<string, number> = { 1: 60, 2: 120, 3: 180 };
const STREAM_FPS = 30;
const STREAM_WIDTH = 640;
const STREAM_HEIGHT = 480;
/** Mid grey clears the lighting check, which reads the real video element. */
const STREAM_COLOR = '#6b7280';

const { LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE } = LANDMARK;

export const FAKE_POSE_INIT: PoseInitResult = {
  delegate: null,
  model: 'fake body',
  connections: ([
    [LEFT_SHOULDER, RIGHT_SHOULDER], [LEFT_HIP, RIGHT_HIP],
    [LEFT_SHOULDER, LEFT_HIP], [RIGHT_SHOULDER, RIGHT_HIP],
    [LEFT_HIP, LEFT_KNEE], [RIGHT_HIP, RIGHT_KNEE],
    [LEFT_SHOULDER, LEFT_ELBOW], [LEFT_ELBOW, LEFT_WRIST],
    [RIGHT_SHOULDER, RIGHT_ELBOW], [RIGHT_ELBOW, RIGHT_WRIST],
  ] as const).map(([start, end]) => ({ start, end })),
};

export interface FakeBodyState {
  isInFrame: boolean;
  areKneesVisible: boolean;
  lean: -1 | 0 | 1;
  isJogging: boolean;
  cadenceSpm: number;
  isHandsOnHips: boolean;
  clapStartMs: number | null;
}

export interface FakeBody {
  stream: MediaStream;
  landmarks(nowMs: number): PoseLandmarks | null;
  dispose(): void;
}

export function createFakeBodyState(): FakeBodyState {
  return { isInFrame: true, areKneesVisible: true, lean: 0, isJogging: false, cadenceSpm: 120, isHandsOnHips: false, clapStartMs: null };
}

export function fakeBodyKeyDown(state: FakeBodyState, key: string, nowMs: number): FakeBodyState {
  const cadenceSpm = CADENCE_BY_KEY[key];
  if (cadenceSpm !== undefined) return { ...state, cadenceSpm };
  switch (key.toLowerCase()) {
    case 'b': return { ...state, isInFrame: !state.isInFrame };
    case 'n': return { ...state, areKneesVisible: !state.areKneesVisible };
    case 'q': return { ...state, lean: 1 };
    case 'e': return { ...state, lean: -1 };
    case 'g': return { ...state, isJogging: !state.isJogging };
    case 'h': return { ...state, isHandsOnHips: !state.isHandsOnHips };
    case 'c': return { ...state, clapStartMs: nowMs };
    default: return state;
  }
}

export function fakeBodyKeyUp(state: FakeBodyState, key: string): FakeBodyState {
  return ['q', 'e'].includes(key.toLowerCase()) ? { ...state, lean: 0 } : state;
}

/** Raw camera x grows toward the subject's own left, so `lean: 1` is the LEFT lane. */
export function fakeBodyPose(state: FakeBodyState, nowMs: number): PoseLandmarks | null {
  if (!state.isInFrame) return null;
  const clapMs = state.clapStartMs === null ? Infinity : nowMs - state.clapStartMs;
  const isClapping = clapMs < CLAP_RAISE_MS + CLAP_TOGETHER_MS;
  // A hard swap, not a smooth swing, so a slow machine's sparse frames still see each step.
  const isLeftUp = Math.floor(nowMs * state.cadenceSpm / 60000) % 2 === 0;
  const centerX = 0.5 + state.lean * LEAN_OFFSET;
  const pose = makePose({
    centerX,
    leftKneeLift: state.isJogging && isLeftUp ? KNEE_LIFT : 0,
    rightKneeLift: state.isJogging && !isLeftUp ? KNEE_LIFT : 0,
    arms: isClapping ? 'up' : state.isHandsOnHips ? 'hips' : 'down',
    hipVisibility: state.isHandsOnHips && !isClapping ? COVERED_HIP_VISIBILITY : 1,
  });
  return pose.map((landmark, index) => {
    if (!state.areKneesVisible && (index === LEFT_KNEE || index === RIGHT_KNEE)) return { ...landmark, visibility: 0 };
    if (isClapping && clapMs >= CLAP_RAISE_MS && index === LEFT_WRIST) return { ...landmark, x: centerX + CLAP_WRIST_OFFSET };
    if (isClapping && clapMs >= CLAP_RAISE_MS && index === RIGHT_WRIST) return { ...landmark, x: centerX - CLAP_WRIST_OFFSET };
    return landmark;
  });
}

export function createFakeBody(target: EventTarget = window): FakeBody {
  let state = createFakeBodyState();
  const canvas = document.createElement('canvas');
  canvas.width = STREAM_WIDTH;
  canvas.height = STREAM_HEIGHT;
  const context = canvas.getContext('2d');
  const paint = () => {
    if (!context) return;
    context.fillStyle = STREAM_COLOR;
    context.fillRect(0, 0, STREAM_WIDTH, STREAM_HEIGHT);
  };
  paint();
  const paintTimer = setInterval(paint, 1000 / STREAM_FPS);
  const stream = canvas.captureStream(STREAM_FPS);

  const onKeyDown = (event: Event) => {
    const { key, repeat } = event as KeyboardEvent;
    if (!repeat) state = fakeBodyKeyDown(state, key, performance.now());
  };
  const onKeyUp = (event: Event) => { state = fakeBodyKeyUp(state, (event as KeyboardEvent).key); };
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);

  return {
    stream,
    landmarks: nowMs => fakeBodyPose(state, nowMs),
    dispose() {
      clearInterval(paintTimer);
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
