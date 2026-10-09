import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { GameRuntime } from '@/engine/runtime';

const mocks = vi.hoisted(() => ({ createScene: vi.fn(), syncScene: vi.fn() }));
vi.mock('@/engine/render/scene', () => ({ createScene: mocks.createScene }));
vi.mock('@/engine/render/sync', () => ({ syncScene: mocks.syncScene }));
vi.mock('@/engine/pose/pose', () => ({ closePose: vi.fn(), getDelegate: () => null }));
vi.mock('@/engine/pose/exposure', () => ({ createExposureSampler: () => ({ dispose: vi.fn() }) }));
import { createGameRuntime } from '@/engine/runtime';

let handle: GameRuntime;
let resizeCallback: ResizeObserverCallback;
let now: number;
let frameId: number;
const frames = new Map<number, FrameRequestCallback>();

function tick(dt = 16.67) {
  now += dt;
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(now);
}

function sceneFixture() {
  let quality = 'high';
  return {
    player: { loadCharacter: vi.fn().mockResolvedValue(true), playAnimation: vi.fn(), characterId: 'mage' },
    bulletPool: { setCharacter: vi.fn(), reset: vi.fn() },
    enemyPool: { reset: vi.fn() },
    riverMask: { hide: vi.fn() },
    drowningSplash: { update: vi.fn() },
    get quality() { return quality; },
    setQuality: vi.fn((next: string) => { quality = next; }), render: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
  };
}

async function start() {
  const refs = sceneFixture();
  mocks.createScene.mockResolvedValue(refs);
  const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
  const video = { srcObject: null, pause: vi.fn() } as unknown as HTMLVideoElement;
  handle = createGameRuntime({ gameCanvas: canvas, overlay: canvas, video, container: {} as HTMLElement });
  handle.start();
  await vi.waitFor(() => expect(handle.getSnapshot().isSceneReady).toBe(true));
  return refs;
}

beforeEach(() => {
  vi.resetAllMocks();
  frames.clear(); frameId = 0; now = performance.now();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resizeCallback = callback; }
    observe = vi.fn(); disconnect = vi.fn();
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback); return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  handle?.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('a stationary dialog paints once, keeps its HUD snapshot stable, and repaints after resizing', async () => {
  const refs = await start();
  const snapshot = handle.getSnapshot(), changed = vi.fn();
  handle.subscribe(changed);
  for (let i = 0; i < 120; i++) tick();
  expect(refs.render).toHaveBeenCalledTimes(1);
  expect(mocks.syncScene).toHaveBeenCalledTimes(1);
  expect(handle.getSnapshot()).toBe(snapshot);
  expect(changed).not.toHaveBeenCalled();
  resizeCallback([], {} as ResizeObserver);
  tick();
  expect(refs.resize).toHaveBeenCalledOnce();
  expect(refs.render).toHaveBeenCalledTimes(2);
});

test('active play draws continuously, pauses while hidden, and drops the time spent away', async () => {
  const refs = await start();
  handle.skipCamera();
  tick(); tick();
  const calls = refs.render.mock.calls.length;
  const summary = handle.getRunSummary();
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  for (let i = 0; i < 20; i++) tick(500);
  expect(handle.getRunSummary()).toEqual(summary);
  expect(refs.render).toHaveBeenCalledTimes(calls);
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  tick(5000);
  expect(handle.getRunSummary().durationMs).toBe(summary.durationMs);
  tick(100);
  expect(handle.getRunSummary().durationMs).toBeGreaterThan(summary.durationMs);
  expect(refs.render).toHaveBeenCalledTimes(calls + 2);
});

test('a late character request cannot replace the newest projectile style', async () => {
  const refs = await start();
  let resolve!: (loaded: boolean) => void;
  refs.player.loadCharacter.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const earlier = handle.setCharacter('druid');
  await handle.setCharacter('witch');
  resolve(true); await earlier;
  expect(refs.bulletPool.setCharacter).toHaveBeenLastCalledWith('witch');
  await handle.setCharacter('unknown');
  expect(refs.bulletPool.setCharacter).toHaveBeenLastCalledWith('mage');
});

test('Low reduces scene updates and live changes preserve elapsed play and the same scene', async () => {
  const refs = await start();
  handle.setGraphicsQuality('low');
  handle.skipCamera();
  const startMs = handle.getRunSummary().durationMs;
  for (let frame = 0; frame < 60; frame++) tick(1000 / 60);
  expect(refs.render.mock.calls.length).toBeGreaterThanOrEqual(30);
  expect(refs.render.mock.calls.length).toBeLessThanOrEqual(31);
  expect(mocks.syncScene.mock.calls.length).toBe(refs.render.mock.calls.length);
  expect(handle.getRunSummary().durationMs - startMs).toBeGreaterThan(950);
  const duration = handle.getRunSummary().durationMs;
  const renderCount = refs.render.mock.calls.length;
  handle.setGraphicsQuality('high');
  expect(handle.getSnapshot().quality).toBe('high');
  expect(handle.getRunSummary().durationMs).toBe(duration);
  for (let frame = 0; frame < 60; frame++) tick(1000 / 60);
  expect(refs.render.mock.calls.length - renderCount).toBe(60);
  expect(mocks.createScene).toHaveBeenCalledOnce();
  expect(refs.dispose).not.toHaveBeenCalled();
});

test('graphics chosen during scene loading are applied before its first paint', async () => {
  const refs = sceneFixture();
  let resolve!: (value: typeof refs) => void;
  mocks.createScene.mockReturnValue(new Promise(r => { resolve = r; }));
  const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
  handle = createGameRuntime({ gameCanvas: canvas, overlay: canvas, video: {} as HTMLVideoElement, container: {} as HTMLElement }, { graphicsQuality: 'low' });
  handle.start();
  expect(mocks.createScene.mock.calls[0]?.[1].quality).toBe('low');
  handle.setGraphicsQuality('high');
  resolve(refs);
  await vi.waitFor(() => expect(handle.getSnapshot().isSceneReady).toBe(true));
  expect(refs.setQuality).toHaveBeenLastCalledWith('high');
  expect(handle.getSnapshot().quality).toBe('high');
});

test('disposal during character startup prevents resize and debug-hook registration', async () => {
  const refs = sceneFixture();
  let resolve!: (loaded: boolean) => void;
  refs.player.loadCharacter.mockReturnValue(new Promise(r => { resolve = r; }));
  mocks.createScene.mockResolvedValue(refs);
  const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
  handle = createGameRuntime({ gameCanvas: canvas, overlay: canvas, video: {} as HTMLVideoElement, container: {} as HTMLElement });
  handle.start();
  await vi.waitFor(() => expect(refs.player.loadCharacter).toHaveBeenCalledOnce());
  handle.dispose(); resolve(true);
  await Promise.resolve(); await Promise.resolve();
  expect(refs.dispose).toHaveBeenCalledOnce();
  expect((window as unknown as { __lane?: unknown }).__lane).toBeUndefined();
  expect(refs.bulletPool.setCharacter).not.toHaveBeenCalled();
});
