import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GameRuntime } from '@/engine/runtime';
const mocks = vi.hoisted(() => ({ scene: vi.fn(), camera: vi.fn(), stop: vi.fn(), detect: vi.fn(),
  pose: null as import('@/engine/types').PoseLandmarks | null }));
vi.mock('@/engine/render/scene', () => ({ createScene: mocks.scene }));
vi.mock('@/engine/render/testScene', () => ({ createTestScene: mocks.scene }));
vi.mock('@/engine/render/sync', () => ({ syncScene: vi.fn(), updatePlayerAnimation: vi.fn() }));
vi.mock('@/engine/pose/camera', () => ({ startCamera: mocks.camera, stopCamera: mocks.stop, describeCameraError: (e: Error) => e.message }));
vi.mock('@/engine/pose/pose', () => ({ initPose: vi.fn().mockResolvedValue({ connections: [], delegate: 'CPU', model: 'lite' }),
  detect: mocks.detect, closePose: vi.fn(), getDelegate: () => 'CPU' }));
vi.mock('@/engine/pose/exposure', () => ({ createExposureSampler: () => ({ sample: () => .5, dispose: vi.fn() }) }));
vi.mock('@/engine/pose/draw', () => ({ resizeOverlay: vi.fn(), clearOverlay: vi.fn(), drawSkeleton: vi.fn() }));
import { createGameRuntime } from '@/engine/runtime';
import { makePose } from './helpers';
import { LANDMARK } from '@/engine/config';

let runtime: GameRuntime, time: number, id: number;
const callbacks = new Map<number, () => void>();
const video = { srcObject: null, readyState: 2, currentTime: 0, pause: vi.fn(),
  requestVideoFrameCallback: (fn: () => void) => { callbacks.set(++id, fn); return id; },
  cancelVideoFrameCallback: (key: number) => callbacks.delete(key) };
const stream = { getTracks: () => [{ addEventListener: vi.fn() }] };

function frames(pose: ReturnType<typeof makePose> | null, count = 15) {
  mocks.pose = pose;
  for (let i = 0; i < count; i++) {
    time += 1000 / 30; video.currentTime += 1 / 30;
    const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn());
  }
}
async function calibrate() {
  await runtime.startCamera();
  frames(makePose(), 40);
  frames(makePose({ centerX: .65 }), 20);
  frames(makePose({ centerX: .35 }), 20);
  frames(makePose(), 20);
  for (let i = 0; i < 12; i++) frames(makePose({ leftKneeLift: i % 2 ? 0 : .1, rightKneeLift: i % 2 ? .1 : 0 }), 8);
  frames(makePose({ arms: 'hips' }), 20);
  frames(makePose({ arms: 'up' }), 10);
  const clap = makePose({ arms: 'up' }); clap[LANDMARK.LEFT_WRIST]!.x = .51; clap[LANDMARK.RIGHT_WRIST]!.x = .49;
  frames(clap, 5);
}
beforeEach(async () => {
  vi.clearAllMocks(); callbacks.clear(); time = 100; id = 0; video.currentTime = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('HTMLMediaElement', { HAVE_CURRENT_DATA: 2 });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { callbacks.set(++id, () => fn(time)); return id; });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => callbacks.delete(key));
  mocks.scene.mockResolvedValue({ player: { loadCharacter: vi.fn().mockResolvedValue(true), playAnimation: vi.fn() },
    bulletPool: { setCharacter: vi.fn(), reset: vi.fn() }, enemyPool: { reset: vi.fn() }, riverMask: { hide: vi.fn() },
    drowningSplash: { update: vi.fn() }, setQuality: vi.fn(), quality: 'high', resize: vi.fn(), render: vi.fn(), dispose: vi.fn() });
  mocks.camera.mockImplementation(async () => ({ stream, width: 640, height: 480 }));
  mocks.detect.mockImplementation(() => ({ landmarks: mocks.pose, inferenceMs: 2 }));
  await mount('game');
});
async function mount(mode: 'game' | 'test') {
  const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
  runtime = createGameRuntime({ gameCanvas: canvas, overlay: canvas, video: video as unknown as HTMLVideoElement, container: {} as HTMLElement }, { mode });
  runtime.start(); await vi.waitFor(() => expect(runtime.getSnapshot().isSceneReady).toBe(true));
}
afterEach(() => { runtime.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('camera entry reports failure on rejection and success only after pose startup', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.camera.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
  expect(await runtime.startCamera()).toBe(false);
  expect(runtime.getSnapshot().isCameraRunning).toBe(false);
  expect(runtime.getSnapshot().error).toContain('Permission denied');
  expect(await runtime.startCamera()).toBe(true);
  expect(runtime.getSnapshot().isCameraRunning).toBe(true);
  expect(await runtime.startCamera()).toBe(true);
  expect(mocks.camera).toHaveBeenCalledTimes(2);
  errors.mockRestore();
});

it('requires current calibration and all four controls; setup movements do not enter run totals', async () => {
  expect(runtime.beginRun()).toBe(false);
  await calibrate();
  expect(runtime.getSnapshot().canBegin).toBe(true);
  expect(runtime.beginRun(3)).toBe(true);
  expect(runtime.getRunSummary().stepCount).toBe(0);
  frames(makePose(), 15);
  expect(runtime.getSnapshot().difficulty).toBe(3);
  expect(runtime.getRunSummary().durationMs).toBeCloseTo(500, -1);
  expect(runtime.getRunSummary().movementMs).toBe(0);
  // Latency is timed from a detected movement, so standing still records none.
  expect(runtime.getSnapshot().metrics.latencySamples).toBe(0);
  frames(makePose({ centerX: .35 }), 20);
  expect(runtime.getSnapshot().metrics.latencyByPose.lateral.samples).toBeGreaterThan(0);
  expect(runtime.getSnapshot().metrics.latencyByPose.clap.samples).toBe(0);
  runtime.restart();
  expect(runtime.getSnapshot().hasStarted).toBe(false);
  expect(runtime.beginRun()).toBe(false);
});
it('body loss freezes simulation and time, counts one incident, and never resumes automatically', async () => {
  await calibrate(); runtime.beginRun(); frames(makePose(), 15);
  frames(null, 1);
  expect(runtime.getSnapshot().pauseReason).toBe('body');
  const summary = runtime.getRunSummary();
  frames(null, 40);
  expect(runtime.getRunSummary()).toEqual(summary);
  expect(runtime.getSnapshot().metrics.bodyLossIncidents).toBe(1);
  expect(runtime.resume()).toBe(false);
  frames(makePose(), 40);
  expect(runtime.getSnapshot().pauseReason).toBe('body');
  expect(runtime.resume()).toBe(true);
  frames(makePose(), 15);
  expect(runtime.getRunSummary().durationMs).toBeGreaterThan(summary.durationMs);
  runtime.finish();
  expect(runtime.getSnapshot().isOver).toBe(true);
  expect(runtime.getSnapshot().deathReason).toBeNull();
});
it('camera stop and hidden tabs require valid tracking and explicit resume', async () => {
  await calibrate(); runtime.beginRun(); frames(makePose(), 15);
  Object.assign(document, { hidden: true }); document.dispatchEvent(new Event('visibilitychange'));
  const duration = runtime.getRunSummary().durationMs;
  expect(runtime.resume()).toBe(false); frames(makePose(), 60);
  expect(runtime.getRunSummary().durationMs).toBe(duration);
  Object.assign(document, { hidden: false }); document.dispatchEvent(new Event('visibilitychange'));
  frames(makePose(), 40);
  expect(runtime.getSnapshot().pauseReason).toBe('hidden');
  expect(runtime.resume()).toBe(true);
  runtime.stopCamera();
  expect(runtime.getSnapshot().pauseReason).toBe('camera');
  expect(runtime.resume()).toBe(false);
  expect(mocks.stop).toHaveBeenCalledWith(stream);
});

it('Test Mode scores a guided trial from live detections; Game Mode ignores trials', async () => {
  runtime.startTrial('clap');
  expect(runtime.getSnapshot().trial.active).toBeNull();
  runtime.dispose(); callbacks.clear();
  await mount('test');
  await runtime.startCamera();
  frames(makePose(), 40);
  runtime.startTrial('clap');
  frames(makePose(), 50);
  expect(runtime.getSnapshot().trial.active).toMatchObject({ pose: 'clap', phase: 'attempt' });
  frames(makePose({ arms: 'up' }), 10);
  const clap = makePose({ arms: 'up' }); clap[LANDMARK.LEFT_WRIST]!.x = .51; clap[LANDMARK.RIGHT_WRIST]!.x = .49;
  frames(clap, 5);
  expect(runtime.getSnapshot().trial.results.clap).toEqual({ correct: 1, missed: 0, incorrect: 0 });
  frames(makePose(), 5);
  expect(runtime.getSnapshot().metrics.latencyByPose.clap.samples).toBe(1);
  runtime.stopTrial();
  expect(runtime.getSnapshot().trial.results.clap).toBeNull();
});

async function testMode() {
  runtime.dispose(); callbacks.clear(); await mount('test');
  runtime.practiceCommand({ type: 'start' });
  expect(runtime.getSnapshot().practice.phase).toBe('idle');
  await runtime.startCamera(); frames(makePose(), 40);
  expect(runtime.getSnapshot().canPractice).toBe(true);
}

it('counts real detector events once and resumes practice by itself once tracking holds', async () => {
  await testMode();
  runtime.practiceCommand({ type: 'select', pose: 'hips' });
  runtime.practiceCommand({ type: 'start' }); frames(makePose(), 5);
  frames(makePose({ arms: 'hips' }), 20);
  expect(runtime.getSnapshot().practice.count).toBe(1);
  frames(makePose({ arms: 'hips' }), 30);
  expect(runtime.getSnapshot().practice.count).toBe(1);
  frames(null, 1);
  expect(runtime.getSnapshot().practice).toMatchObject({ phase: 'paused', count: 1 });
  // Under a second of tracking is a flicker, not a return.
  frames(makePose(), 10);
  expect(runtime.getSnapshot().practice.phase).toBe('paused');
  frames(makePose(), 40);
  expect(runtime.getSnapshot().practice).toMatchObject({ phase: 'active', count: 1, pauseReason: null });
  frames(makePose({ arms: 'hips' }), 20);
  expect(runtime.getSnapshot().practice.count).toBe(2);
  expect(runtime.getDiagnosticReport('test').events.filter(e => e.event === 'counted')).toHaveLength(2);
});

it('forwards knee sides and keeps detections driving the character during free practice', async () => {
  await testMode();
  runtime.practiceCommand({ type: 'select', pose: 'knees' });
  runtime.practiceCommand({ type: 'start' });
  frames(makePose({ leftKneeLift: .1 }), 10);
  expect(runtime.getSnapshot().practice.count).toBe(0);
  frames(makePose({ rightKneeLift: .1 }), 10);
  expect(runtime.getSnapshot().practice.count).toBe(1);
  const event = runtime.getDiagnosticReport('test').events.find(e => e.category === 'detection' && e.data.pose === 'knees');
  expect(event?.data.knee).toBe('RIGHT');
  runtime.practiceCommand({ type: 'mode', mode: 'free' });
  frames(makePose({ leftKneeLift: .1 }), 10);
  expect(runtime.getSnapshot().practice).toMatchObject({ mode: 'free', count: 1, phase: 'paused' });
  expect(runtime.getSnapshot().stepCount).toBeGreaterThan(1);
  expect(mocks.camera).toHaveBeenCalledTimes(1);
});

it('isolates timed evaluation and practice, logs outcomes and preserves camera ownership', async () => {
  await testMode();
  runtime.practiceCommand({ type: 'select', pose: 'clap' });
  runtime.practiceCommand({ type: 'start' }); frames(makePose(), 5);
  runtime.startTrial('clap');
  expect(runtime.getSnapshot().practice.phase).toBe('paused');
  frames(makePose(), 50);
  frames(makePose({ arms: 'up' }), 10);
  const clap = makePose({ arms: 'up' }); clap[LANDMARK.LEFT_WRIST]!.x = .51; clap[LANDMARK.RIGHT_WRIST]!.x = .49;
  frames(clap, 5);
  expect(runtime.getSnapshot().practice.count).toBe(0);
  expect(runtime.getSnapshot().trial.results.clap?.correct).toBe(1);
  runtime.practiceCommand({ type: 'resume' });
  expect(runtime.getSnapshot().trial.active).toBeNull();
  frames(makePose({ arms: 'up' }), 10); frames(clap, 5);
  expect(runtime.getSnapshot().practice.count).toBe(1);
  const report = runtime.getDiagnosticReport('test');
  expect(report.events.some(e => e.category === 'trial' && e.data.tally)).toBe(true);
  expect(report.events.some(e => e.event === 'model-ready')).toBe(true);
  expect(mocks.camera).toHaveBeenCalledTimes(1);
});

it('freezes practice for hidden tabs and camera stop, resumes on return, and samples diagnostics at five seconds', async () => {
  await testMode();
  runtime.practiceCommand({ type: 'start' }); frames(makePose(), 3);
  Object.assign(document, { hidden: true }); document.dispatchEvent(new Event('visibilitychange'));
  expect(runtime.getSnapshot().practice.phase).toBe('paused');
  Object.assign(document, { hidden: false }); document.dispatchEvent(new Event('visibilitychange'));
  frames(makePose(), 150);
  expect(runtime.getSnapshot().practice.phase).not.toBe('paused');
  expect(runtime.getDiagnosticReport('test').events.some(e => e.category === 'practice' && e.event === 'resume')).toBe(true);
  runtime.stopCamera();
  expect(runtime.getSnapshot().practice.phase).toBe('paused');
  const samples = runtime.getDiagnosticReport('test').events.filter(e => e.category === 'performance');
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.length).toBeLessThanOrEqual(2);
  runtime.clearDiagnostics();
  expect(runtime.getSnapshot().diagnostics.events).toHaveLength(0);
});

it('keeps a pause the player asked for until they resume', async () => {
  await testMode();
  runtime.practiceCommand({ type: 'start' }); frames(makePose(), 3);
  runtime.practiceCommand({ type: 'pause' });
  frames(makePose(), 90);
  expect(runtime.getSnapshot().practice).toMatchObject({ phase: 'paused', pauseReason: 'Taking a break' });
});

it('requires a fresh knee starting side after Start and Resume', async () => {
  await testMode();
  frames(makePose({ leftKneeLift: .1 }), 10);
  runtime.practiceCommand({ type: 'select', pose: 'knees' });
  runtime.practiceCommand({ type: 'start' });
  frames(makePose({ rightKneeLift: .1 }), 10);
  expect(runtime.getSnapshot().practice).toMatchObject({ count: 0, targetKnee: 'LEFT' });
  frames(makePose({ leftKneeLift: .1 }), 10);
  expect(runtime.getSnapshot().practice.count).toBe(1);
  runtime.practiceCommand({ type: 'pause' });
  runtime.practiceCommand({ type: 'resume' });
  frames(makePose({ rightKneeLift: .1 }), 10);
  expect(runtime.getSnapshot().practice).toMatchObject({ count: 1, targetKnee: 'LEFT' });
});

it('advances completed poses and rests on the runtime clock without logging each frame', async () => {
  await testMode();
  // Each select moves its pose to the front, so this leaves clap closing the round.
  for (const pose of ['clap', 'lateral', 'knees', 'hips'] as const) runtime.practiceCommand({ type: 'select', pose });
  runtime.practiceCommand({ type: 'start' });
  for (let i = 0; i < 3; i++) runtime.practiceCommand({ type: 'skip' });
  const clap = makePose({ arms: 'up' });
  clap[LANDMARK.LEFT_WRIST]!.x = .51; clap[LANDMARK.RIGHT_WRIST]!.x = .49;
  for (let i = 0; i < 5; i++) { frames(makePose({ arms: 'up' }), 10); frames(clap, 5); frames(makePose(), 5); }
  expect(runtime.getSnapshot().practice).toMatchObject({ pose: 'clap', phase: 'complete', count: 5 });
  const before = runtime.getSnapshot().practice.elapsedMs;
  frames(makePose(), 110);
  expect(runtime.getSnapshot().practice).toMatchObject({ phase: 'rest', skips: 3, completedRounds: 0 });
  expect(runtime.getSnapshot().practice.elapsedMs).toBeGreaterThan(before + 3000);
  runtime.practiceCommand({ type: 'pause' });
  const paused = runtime.getSnapshot().practice;
  frames(makePose(), 60);
  expect(runtime.getSnapshot().practice).toBe(paused);
  runtime.practiceCommand({ type: 'resume' });
  expect(runtime.getSnapshot().practice.remainingPhaseMs).toBe(paused.remainingPhaseMs);
  runtime.practiceCommand({ type: 'continue' }); frames(makePose(), 5);
  const nextRound = runtime.getSnapshot().practice;
  expect(nextRound).toMatchObject({ pose: nextRound.order[0], step: 0, round: 2, count: 0 });
  expect(nextRound.pose).not.toBe('clap');
  const log = runtime.getDiagnosticReport('test').events;
  expect(log.some(e => e.event === 'rest-started')).toBe(true);
  expect(log.filter(e => e.category === 'practice').length).toBeLessThan(35);
  expect(mocks.camera).toHaveBeenCalledTimes(1);
});

it('freezes session time across free practice, developer tests and finish', async () => {
  await testMode(); runtime.practiceCommand({ type: 'select', pose: 'lateral' });
  runtime.practiceCommand({ type: 'start' }); frames(makePose(), 10);
  expect(runtime.getSnapshot().practice.elapsedMs).toBeGreaterThan(0);
  runtime.practiceCommand({ type: 'mode', mode: 'free' });
  const checkpoint = runtime.getSnapshot().practice.elapsedMs;
  frames(makePose(), 90);
  expect(runtime.getSnapshot().practice.elapsedMs).toBe(checkpoint);
  runtime.practiceCommand({ type: 'mode', mode: 'guided' });
  frames(makePose(), 10);
  expect(runtime.getSnapshot().practice.phase).not.toBe('paused');
  expect(runtime.getSnapshot().practice.elapsedMs).toBeGreaterThan(checkpoint);
  runtime.startTrial('hips'); const trialTime = runtime.getSnapshot().practice.elapsedMs;
  frames(makePose(), 90);
  expect(runtime.getSnapshot().practice).toMatchObject({ phase: 'paused', elapsedMs: trialTime });
  runtime.stopTrial(); frames(makePose(), 10);
  expect(runtime.getSnapshot().practice.phase).not.toBe('paused');
  runtime.practiceCommand({ type: 'finish' }); const ended = runtime.getSnapshot().practice;
  frames(makePose(), 60);
  expect(runtime.getSnapshot().practice).toBe(ended);
  expect(ended).toMatchObject({ phase: 'summary', unfinishedPose: 'lateral', finishReason: 'manual' });
});
