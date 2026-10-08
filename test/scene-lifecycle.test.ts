import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as THREE from 'three';

const mocks = vi.hoisted(() => ({ clouds: vi.fn(), obstacles: vi.fn(), player: vi.fn(), enemies: vi.fn(), renderer: vi.fn() }));
vi.mock('three', async importOriginal => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: class { constructor() { return mocks.renderer(); } },
}));
vi.mock('@/engine/render/world/sky', () => ({
  addSky: (_three: unknown, scene: THREE.Scene) => {
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    return {};
  },
}));
vi.mock('@/engine/render/world/ground', () => ({ addGround: () => ({ valley: { mesh: new THREE.Mesh() } }), trailHalfWidth: () => 5 }));
vi.mock('@/engine/render/world/trailEdge', () => ({ createTrailEdge: () => ({ patchObject: vi.fn() }) }));
vi.mock('@/engine/render/world/scatter', () => ({ addScatter: async () => ({ setQuality: vi.fn() }) }));
vi.mock('@/engine/render/world/landmarks', () => ({ addLandmarks: async () => ({}) }));
vi.mock('@/engine/render/world/clouds', () => ({ addClouds: mocks.clouds }));
vi.mock('@/engine/render/actors/player', () => ({ addPlayer: mocks.player }));
vi.mock('@/engine/render/actors/enemies', () => ({ addEnemyPool: mocks.enemies }));
vi.mock('@/engine/render/actors/obstacles', () => ({ addObstaclePool: mocks.obstacles }));
vi.mock('@/engine/render/actors/spells', () => ({ addSpellPool: () => ({ dispose: vi.fn() }) }));
import { createScene } from '@/engine/render/scene';

let renderer: { setPixelRatio: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; shadowMap: object };
beforeEach(() => {
  vi.resetAllMocks();
  renderer = { setPixelRatio: vi.fn(), dispose: vi.fn(), shadowMap: {} };
  mocks.renderer.mockReturnValue(renderer);
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  mocks.clouds.mockResolvedValue({});
  mocks.obstacles.mockRejectedValue(new Error('Hazard unavailable'));
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('a startup asset failure releases WebGL and the already assembled scene', async () => {
  const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
  const material = vi.spyOn(THREE.Material.prototype, 'dispose');
  const shadow = vi.spyOn(Object.getPrototypeOf(new THREE.DirectionalLight().shadow), 'dispose');
  mocks.clouds.mockRejectedValueOnce(new Error('Cloud unavailable'));
  await expect(createScene({} as HTMLCanvasElement)).rejects.toThrow('Cloud unavailable');
  expect(renderer.dispose).toHaveBeenCalledOnce();
  expect(geometry).toHaveBeenCalled();
  expect(material).toHaveBeenCalled();
  expect(shadow).toHaveBeenCalledOnce();
});

test('a later asset failure also releases actor-owned caches and rigs', async () => {
  const player = { dispose: vi.fn() }, enemies = { dispose: vi.fn() };
  mocks.player.mockResolvedValue(player);
  mocks.enemies.mockResolvedValue(enemies);
  await expect(createScene({} as HTMLCanvasElement)).rejects.toThrow('Hazard unavailable');
  expect(player.dispose).toHaveBeenCalledOnce();
  expect(enemies.dispose).toHaveBeenCalledOnce();
  expect(renderer.dispose).toHaveBeenCalledOnce();
});
