import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/engine/render/characterPreview', () => ({ createCharacterPreviewScene: mocks.create }));
import { createCharacterPreviewRuntime } from '@/engine/runtime';

const canvas = {} as HTMLCanvasElement;
const slot = { dataset: { characterPreview: 'mage' } } as unknown as HTMLElement;
const container = { querySelectorAll: () => [slot] } as unknown as HTMLElement;
let runtime: ReturnType<typeof createCharacterPreviewRuntime>;
let motion: { matches: boolean };
let frameId: number;
const frames = new Map<number, FrameRequestCallback>();

function tick(time: number) {
  const pending = [...frames.values()];
  frames.clear();
  for (const frame of pending) frame(time);
}

beforeEach(() => {
  vi.resetAllMocks();
  frames.clear();
  frameId = 0;
  motion = { matches: false };
  vi.stubGlobal('window', { matchMedia: () => motion });
  vi.stubGlobal('document', { hidden: false });
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    frames.set(++frameId, frame);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  runtime?.dispose();
  vi.unstubAllGlobals();
});

test('selection loops idle safely, honors reduced motion, and releases the loop and renderer', async () => {
  const preview = { render: vi.fn(), dispose: vi.fn() };
  mocks.create.mockResolvedValue(preview);
  runtime = createCharacterPreviewRuntime(canvas, container, vi.fn());
  await runtime.start();
  await runtime.start();
  expect(mocks.create).toHaveBeenCalledOnce();
  tick(100);
  tick(116);
  expect(preview.render).toHaveBeenLastCalledWith(0.016);
  motion.matches = true;
  tick(132);
  expect(preview.render).toHaveBeenLastCalledWith(0);
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  const renders = preview.render.mock.calls.length;
  tick(1000);
  expect(preview.render).toHaveBeenCalledTimes(renders);
  runtime.dispose();
  runtime.dispose();
  expect(frames.size).toBe(0);
  expect(preview.dispose).toHaveBeenCalledOnce();
});

test('a preview arriving after navigation is disposed without a loop or status update', async () => {
  let resolve!: (preview: { render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }) => void;
  mocks.create.mockReturnValue(new Promise(r => { resolve = r; }));
  const status = vi.fn();
  runtime = createCharacterPreviewRuntime(canvas, container, status);
  const starting = runtime.start();
  await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  runtime.dispose();
  mocks.create.mock.calls[0][2]('mage', 'ready');
  const preview = { render: vi.fn(), dispose: vi.fn() };
  resolve(preview);
  await starting;
  expect(status).not.toHaveBeenCalled();
  expect(preview.dispose).toHaveBeenCalledOnce();
  expect(frames.size).toBe(0);
});

test('WebGL failure leaves the character choices usable with an error status', async () => {
  mocks.create.mockRejectedValue(new Error('WebGL unavailable'));
  const status = vi.fn();
  runtime = createCharacterPreviewRuntime(canvas, container, status);
  await runtime.start();
  expect(status).toHaveBeenCalledWith('mage', 'error');
  expect(frames.size).toBe(0);
});
