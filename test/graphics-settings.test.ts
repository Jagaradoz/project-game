import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { createJSONStorage } from 'zustand/middleware';

const saved = new Map<string, string>();
const storage = {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => { saved.set(key, value); },
  removeItem: (key: string) => { saved.delete(key); },
};
const key = 'trail_runner_settings_v3';
vi.stubGlobal('window', { localStorage: storage });
const { useSettings } = await import('@/lib/store/settings');
afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  saved.clear();
  useSettings.persist.setOptions({ storage: createJSONStorage(() => storage) });
  useSettings.setState({ graphicsQuality: 'medium', character: 'mage', hideCamera: false });
});

test('graphics persist across hydration with the existing character and camera preferences', async () => {
  useSettings.getState().setGraphicsQuality('low');
  useSettings.getState().setCharacter('witch');
  useSettings.getState().setHideCamera(true);
  const persisted = saved.get(key)!;
  useSettings.setState({ graphicsQuality: 'high', character: 'mage', hideCamera: false });
  saved.set(key, persisted);
  await useSettings.persist.rehydrate();
  expect(useSettings.getState().graphicsQuality).toBe('low');
  expect(useSettings.getState().character).toBe('witch');
  expect(useSettings.getState().hideCamera).toBe(true);
});

test.each([undefined, 'ultra', null, 0])('old or invalid graphics preferences fall back to Medium (%s)', async graphicsQuality => {
  saved.set(key, JSON.stringify({ state: { graphicsQuality, character: 'druid', hideCamera: true }, version: 0 }));
  await useSettings.persist.rehydrate();
  expect(useSettings.getState().graphicsQuality).toBe('medium');
  expect(useSettings.getState().character).toBe('druid');
  expect(useSettings.getState().hideCamera).toBe(true);
});
