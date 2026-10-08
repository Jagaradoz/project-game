import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { CameraStartResult } from '@/engine/pose/camera';

const mocks = vi.hoisted(() => ({
  startCamera: vi.fn(), stopCamera: vi.fn(), initPose: vi.fn(), closePose: vi.fn(),
  detect: vi.fn(), sample: vi.fn(), disposeExposure: vi.fn(),
}));
vi.mock('@/engine/pose/camera', async () => ({
  ...await vi.importActual<typeof import('@/engine/pose/camera')>('@/engine/pose/camera'),
  startCamera: mocks.startCamera, stopCamera: mocks.stopCamera,
}));
vi.mock('@/engine/pose/pose', () => ({
  initPose: mocks.initPose, closePose: mocks.closePose, detect: mocks.detect, getDelegate: () => null,
}));
vi.mock('@/engine/render/scene', () => ({ createScene: vi.fn() }));
vi.mock('@/engine/pose/exposure', () => ({
  createExposureSampler: () => ({ sample: mocks.sample, dispose: mocks.disposeExposure }),
}));
import { createGameRuntime } from '@/engine/runtime';
import type { GameRuntime } from '@/engine/runtime';

const { startCamera: openCamera } = await vi.importActual<typeof import('@/engine/pose/camera')>('@/engine/pose/camera');

class Video extends EventTarget {
  readyState = 2;
  videoWidth = 640;
  videoHeight = 480;
  currentTime = 1;
  srcObject: MediaStream | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  frames = new Map<number, VideoFrameRequestCallback>();
  nextFrameId = 1;
  requestVideoFrameCallback = vi.fn((callback: VideoFrameRequestCallback) => {
    const id = this.nextFrameId++;
    this.frames.set(id, callback);
    return id;
  });
  cancelVideoFrameCallback = vi.fn((id: number) => { this.frames.delete(id); });

  frame(): void {
    const [id, callback] = this.frames.entries().next().value!;
    this.frames.delete(id);
    callback(0, {} as VideoFrameCallbackMetadata);
  }

  element(): HTMLVideoElement { return this as unknown as HTMLVideoElement; }
}

function camera() {
  const track = { stop: vi.fn(), getSettings: () => ({ frameRate: 30 }), label: 'Test camera' };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { track, result: { stream, width: 640, height: 480, label: track.label, frameRate: 30 } satisfies CameraStartResult };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

const runtimes: GameRuntime[] = [];
function runtime(video = new Video(), mode: 'pose' | 'game' = 'pose') {
  const canvas = { width: 640, height: 480, getContext: () => null } as unknown as HTMLCanvasElement;
  const handle = createGameRuntime({ video: video.element(), overlay: canvas, gameCanvas: canvas, container: {} as HTMLElement }, { mode });
  runtimes.push(handle);
  return handle;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { isSecureContext: true });
  vi.stubGlobal('document', { hidden: false });
  vi.stubGlobal('HTMLMediaElement', { HAVE_METADATA: 1, HAVE_CURRENT_DATA: 2 });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.initPose.mockResolvedValue({ delegate: 'GPU', model: 'lite', connections: [] });
  mocks.detect.mockReturnValue({ landmarks: null, inferenceMs: 1 });
  mocks.sample.mockReturnValue(null);
  mocks.stopCamera.mockImplementation((stream: MediaStream | null) => stream?.getTracks().forEach(track => track.stop()));
  mocks.startCamera.mockImplementation(async (video: HTMLVideoElement) => {
    const acquired = camera();
    video.srcObject = acquired.result.stream;
    return acquired.result;
  });
});

afterEach(() => {
  for (const handle of runtimes.splice(0)) handle.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('camera playback rejection stops and detaches the acquired stream', async () => {
  const video = new Video(), acquired = camera();
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(acquired.result.stream);
  video.play.mockRejectedValue(new Error('Playback blocked'));
  await expect(openCamera(video.element())).rejects.toThrow('Playback blocked');
  expect(acquired.track.stop).toHaveBeenCalledTimes(1);
  expect(video.srcObject).toBeNull();
  expect(video.pause).toHaveBeenCalledOnce();
});

test('metadata failure releases the stream and removes both event listeners', async () => {
  const video = new Video(), acquired = camera();
  video.readyState = 0;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(acquired.result.stream);
  const remove = vi.spyOn(video, 'removeEventListener');
  const pending = openCamera(video.element());
  const rejected = expect(pending).rejects.toThrow('failed to load');
  await vi.waitFor(() => expect(video.srcObject).toBe(acquired.result.stream));
  video.dispatchEvent(new Event('error'));
  await rejected;
  expect(acquired.track.stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
  expect(remove.mock.calls.map(([name]) => name)).toEqual(['loadedmetadata', 'error']);
});

test('permission cancellation rejects promptly and stops a late stream without replacing a newer one', async () => {
  const video = new Video(), acquired = camera(), replacement = camera();
  const permission = deferred<MediaStream>();
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(permission.promise);
  const controller = new AbortController();
  const pending = openCamera(video.element(), undefined, controller.signal);
  const rejected = expect(pending).rejects.toThrow('cancelled');
  controller.abort();
  await rejected;
  video.srcObject = replacement.result.stream;
  permission.resolve(acquired.result.stream);
  await vi.waitFor(() => expect(acquired.track.stop).toHaveBeenCalledOnce());
  expect(video.srcObject).toBe(replacement.result.stream);
  expect(video.play).not.toHaveBeenCalled();
});

test('cancelling metadata wait removes listeners and releases the camera', async () => {
  const video = new Video(), acquired = camera(), controller = new AbortController();
  video.readyState = 0;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(acquired.result.stream);
  const remove = vi.spyOn(video, 'removeEventListener');
  const pending = openCamera(video.element(), undefined, controller.signal);
  const rejected = expect(pending).rejects.toThrow('cancelled');
  await vi.waitFor(() => expect(video.srcObject).toBe(acquired.result.stream));
  controller.abort();
  await rejected;
  expect(acquired.track.stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
  expect(remove.mock.calls.map(([name]) => name)).toEqual(['loadedmetadata', 'error']);
});

test('cancelling pending playback releases the acquired stream', async () => {
  const video = new Video(), acquired = camera(), controller = new AbortController();
  const playback = deferred<void>();
  video.play.mockReturnValue(playback.promise);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(acquired.result.stream);
  const pending = openCamera(video.element(), undefined, controller.signal);
  const rejected = expect(pending).rejects.toThrow('cancelled');
  await vi.waitFor(() => expect(video.play).toHaveBeenCalled());
  controller.abort();
  await rejected;
  expect(acquired.track.stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
  playback.resolve();
});

test('pose initialization failure releases the runtime camera and permits retry', async () => {
  const video = new Video(), acquired = camera();
  mocks.startCamera.mockImplementationOnce(async () => { video.srcObject = acquired.result.stream; return acquired.result; });
  mocks.initPose.mockRejectedValueOnce(new Error('Model unavailable'));
  const handle = runtime(video);
  await handle.startCamera();
  expect(acquired.track.stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
  expect(handle.getSnapshot()).toMatchObject({ isCameraRunning: false, error: 'Model unavailable', cameraLabel: null });
  await handle.startCamera();
  expect(handle.getSnapshot()).toMatchObject({ isCameraRunning: true, error: null });
});

test('stop allows immediate retry and obsolete completion cannot unlock the newer startup', async () => {
  const first = deferred<CameraStartResult>(), second = deferred<CameraStartResult>();
  const oldCamera = camera(), newCamera = camera(), handle = runtime();
  mocks.startCamera.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const oldStart = handle.startCamera();
  const firstSignal = mocks.startCamera.mock.calls[0][2] as AbortSignal;
  handle.stopCamera();
  expect(firstSignal.aborted).toBe(true);
  const newStart = handle.startCamera();
  first.resolve(oldCamera.result);
  await oldStart;
  expect(oldCamera.track.stop).toHaveBeenCalledOnce();
  await handle.startCamera();
  expect(mocks.startCamera).toHaveBeenCalledTimes(2);
  second.resolve(newCamera.result);
  await newStart;
  expect(handle.getSnapshot().isCameraRunning).toBe(true);
});

test('obsolete pose completion cannot close the model belonging to a newer startup', async () => {
  const pose = deferred<{ delegate: 'GPU'; model: string; connections: [] }>(), handle = runtime();
  mocks.initPose.mockReturnValueOnce(pose.promise);
  const oldStart = handle.startCamera();
  await vi.waitFor(() => expect(mocks.initPose).toHaveBeenCalledTimes(1));
  handle.stopCamera();
  await handle.startCamera();
  const closes = mocks.closePose.mock.calls.length;
  pose.resolve({ delegate: 'GPU', model: 'lite', connections: [] });
  await oldStart;
  expect(mocks.closePose).toHaveBeenCalledTimes(closes);
  expect(handle.getSnapshot().isCameraRunning).toBe(true);
});

test('dispose cancels camera startup and prevents a late stream from starting pose', async () => {
  const permission = deferred<CameraStartResult>(), acquired = camera(), handle = runtime();
  mocks.startCamera.mockReturnValueOnce(permission.promise);
  const pending = handle.startCamera();
  const signal = mocks.startCamera.mock.calls[0][2] as AbortSignal;
  handle.dispose();
  expect(signal.aborted).toBe(true);
  permission.resolve(acquired.result);
  await pending;
  expect(acquired.track.stop).toHaveBeenCalledOnce();
  expect(mocks.initPose).not.toHaveBeenCalled();
});

test('inference failure stops the camera and leaves no pose callback running', async () => {
  const video = new Video(), acquired = camera(), handle = runtime(video);
  mocks.startCamera.mockImplementationOnce(async () => { video.srcObject = acquired.result.stream; return acquired.result; });
  await handle.startCamera();
  mocks.detect.mockImplementationOnce(() => { throw new Error('Inference failed'); });
  video.frame();
  expect(acquired.track.stop).toHaveBeenCalledOnce();
  expect(video.srcObject).toBeNull();
  expect(video.frames.size).toBe(0);
  expect(handle.getSnapshot()).toMatchObject({ isCameraRunning: false, error: 'Inference failed' });
  await handle.startCamera();
  expect(handle.getSnapshot().isCameraRunning).toBe(true);
});

test('hidden pose mode skips inference and exposure and resumes on a later decoded frame', async () => {
  const video = new Video(), handle = runtime(video);
  await handle.startCamera();
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  video.frame();
  expect(mocks.detect).not.toHaveBeenCalled();
  expect(mocks.sample).not.toHaveBeenCalled();
  expect(video.frames.size).toBe(1);
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  video.frame();
  expect(mocks.detect).toHaveBeenCalledOnce();
  expect(mocks.sample).toHaveBeenCalledOnce();
});

test('development bypass aborts startup and still allows the keyboard mode', async () => {
  const permission = deferred<CameraStartResult>(), acquired = camera(), handle = runtime(new Video(), 'game');
  mocks.startCamera.mockReturnValueOnce(permission.promise);
  const pending = handle.startCamera();
  handle.skipCamera();
  permission.resolve(acquired.result);
  await pending;
  expect(acquired.track.stop).toHaveBeenCalledOnce();
  expect(handle.getSnapshot()).toMatchObject({ isCameraSkipped: true, isCameraRunning: false, error: null });
  expect(mocks.initPose).not.toHaveBeenCalled();
});
