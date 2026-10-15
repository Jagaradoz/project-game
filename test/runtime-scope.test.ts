import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GameRuntime } from '@/engine/runtime';
const mocks = vi.hoisted(() => ({ scene: vi.fn(), camera: vi.fn(), stop: vi.fn(), detect: vi.fn(),
  pose: null as import('@/engine/types').PoseLandmarks | null }));
vi.mock('@/engine/render/scene', () => ({ createScene: mocks.scene }));
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
  const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
  runtime = createGameRuntime({ gameCanvas: canvas, overlay: canvas, video: video as unknown as HTMLVideoElement, container: {} as HTMLElement });
  runtime.start(); await vi.waitFor(() => expect(runtime.getSnapshot().isSceneReady).toBe(true));
});
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
  expect(runtime.getSnapshot().metrics.latencySamples).toBeGreaterThan(0);
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
