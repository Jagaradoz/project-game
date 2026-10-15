import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ renderer: vi.fn(), player: vi.fn() }));
vi.mock('three', async importOriginal => ({ ...await importOriginal<typeof import('three')>(), WebGLRenderer: mocks.renderer }));
vi.mock('@/engine/render/actors/player', () => ({ addPlayer: mocks.player }));
import { createTestScene } from '@/engine/render/testScene';
import * as THREE from 'three';
import { createGameState } from '@/engine/core/state';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('a cancelled character load never acquires or destroys the replacement canvas context', async () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  mocks.renderer.mockImplementation(class { setPixelRatio = vi.fn(); } as unknown as () => unknown);
  let resolve!: (value: { dispose: ReturnType<typeof vi.fn> }) => void;
  mocks.player.mockReturnValue(new Promise(r => { resolve = r; }));
  const dispose = vi.fn();
  const pending = createTestScene({} as HTMLCanvasElement, () => true);
  void pending.catch(() => {});
  expect(mocks.renderer).not.toHaveBeenCalled();
  const rejected = expect(pending).rejects.toThrow('cancelled');
  resolve({ dispose });
  await rejected;
  expect(mocks.renderer).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});

it('missing tracking interrupts a stale action with a moving idle clip and grounded character', async () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  const renderer = { setPixelRatio: vi.fn(), render: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn() };
  mocks.renderer.mockImplementation(function () { return renderer; });
  const player = { group: new THREE.Group(), modelContainer: new THREE.Group(), dispose: vi.fn(),
    playAnimation: vi.fn(), mixer: { update: vi.fn() }, lastJumpStartedMs: 100,
    currentActionName: 'shoot', currentAction: null, characterId: 'mage' };
  mocks.player.mockResolvedValue(player);
  const scene = await createTestScene({} as HTMLCanvasElement);
  scene.render({ ...createGameState(), justFired: true, jumpStartedMs: 100, jumpHeight: 2 }, 16, false);
  expect(player.playAnimation).toHaveBeenCalledWith('idle', .1, true);
  expect(player.playAnimation).not.toHaveBeenCalledWith('shoot', expect.anything(), expect.anything(), expect.anything());
  expect(player.mixer.update).toHaveBeenCalledWith(.016);
  expect(player.group.position.y).toBe(0);
  expect(player.lastJumpStartedMs).toBeNull();
  scene.dispose();
});
