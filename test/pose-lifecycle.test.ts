import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), fileset: vi.fn().mockResolvedValue({}) }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mocks.fileset },
  PoseLandmarker: { createFromOptions: mocks.create, POSE_CONNECTIONS: [] },
}));
import { closePose, getDelegate, initPose } from '@/engine/pose/pose';

afterEach(() => { closePose(); vi.clearAllMocks(); });

test('starting pose again closes the previous model and final teardown closes the replacement', async () => {
  const first = { close: vi.fn() }, second = { close: vi.fn() };
  mocks.create.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  await initPose(); expect(getDelegate()).toBe('GPU');
  await initPose(); expect(first.close).toHaveBeenCalledTimes(1);
  closePose(); closePose();
  expect(second.close).toHaveBeenCalledTimes(1);
  expect(getDelegate()).toBeNull();
});

test('a model which finishes loading after cancellation is closed instead of retained', async () => {
  let resolve!: (value: { close: ReturnType<typeof vi.fn> }) => void;
  mocks.create.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const pending = initPose();
  const rejected = expect(pending).rejects.toThrow('cancelled');
  await vi.waitFor(() => expect(mocks.create).toHaveBeenCalled());
  closePose();
  const model = { close: vi.fn() }; resolve(model); await rejected;
  expect(model.close).toHaveBeenCalledTimes(1);
  expect(getDelegate()).toBeNull();
});

test('CPU fallback also releases its model on stop', async () => {
  const model = { close: vi.fn() };
  mocks.create.mockRejectedValueOnce(new Error('GPU unavailable')).mockResolvedValueOnce(model);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect((await initPose()).delegate).toBe('CPU');
    closePose(); expect(model.close).toHaveBeenCalledTimes(1);
  } finally { warn.mockRestore(); }
});
