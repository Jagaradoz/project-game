import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '@/engine/config';
import { GOLDEN_FOREST } from '@/engine/render/world/palette';
import { addObstaclePool, HAZARD_VARIANTS, hazardAssetName, hazardVariant } from '@/engine/render/actors/obstacles';
import { createRiverMask } from '@/engine/render/world/riverMask';
import { createTrailEdge } from '@/engine/render/world/trailEdge';
import type { TrailHazard } from '@/engine/types';

function hazard(kind: TrailHazard['kind'], startLane: 0 | 1 = 0, laneCount: 2 | 3 = 3): TrailHazard {
  return { id: 70, kind, startLane, laneCount, z: -12, previousZ: -12, status: 'approaching' } as TrailHazard;
}

test('real exported assets cover their lanes, keep an open lane, and reuse four slots', async () => {
  const loaded: string[] = [];
  const loader = new GLTFLoader();
  loader.loadAsync = async (url: string) => {
    loaded.push(url);
    const data = await readFile(new URL(`../public${url}`, import.meta.url));
    const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return loader.parseAsync(bytes, '');
  };
  const scene = new THREE.Scene();
  const pool = await addObstaclePool(THREE, scene, CONFIG.game, loader, GOLDEN_FOREST);
  expect(pool.items).toHaveLength(4);
  expect(loaded).toHaveLength(13);
  expect(loaded).toContain('/assets/models/environment/river_crossing.glb');
  expect(loaded.some(path => path.includes('rock_'))).toBe(false);
  const groups = pool.items.map(s => s.group);
  for (const kind of ['log', 'stones'] as const) {
    for (const [start, count] of [[0, 2], [1, 2], [0, 3]] as const) {
      for (const id of [0, 1, 2]) {
        pool.sync([{ ...hazard(kind, start, count), id }], 0);
        const slot = pool.items[0];
        scene.updateMatrixWorld(true);
        const shown = [...slot.solids.values()].filter(object => object.visible);
        expect(shown.map(object => object.name)).toEqual([hazardAssetName(kind, count, HAZARD_VARIANTS[hazardVariant(id)])]);
        const bounds = new THREE.Box3().setFromObject(shown[0]!);
        const left = (start - 1.5) * 2.4;
        const right = (start + count - 1.5) * 2.4;
        // Authored variants turn a little, so allow a small overhang past the occupied lanes.
        expect(bounds.min.x).toBeGreaterThanOrEqual(left - .3);
        expect(bounds.max.x).toBeLessThanOrEqual(right + .3);
        expect(bounds.min.x).toBeLessThan(left + .3);
        expect(bounds.max.x).toBeGreaterThan(right - .3);
        expect(bounds.max.y).toBeLessThan(CONFIG.game.jump.clearance * 1.1);
        expect(bounds.max.y).toBeGreaterThan(kind === 'log' ? 1 : .7);
      }
    }
  }
  pool.sync([hazard('river')], 1000);
  const river = pool.items[0].river;
  expect(river.group.visible).toBe(true);
  expect(river.group.rotation.y).toBe(0);
  const size = new THREE.Box3().setFromObject(river.group).getSize(new THREE.Vector3());
  // Authored channel: fills the masked hole exactly, with scenery just outside it.
  expect(size.z).toBeGreaterThanOrEqual(CONFIG.game.obstacle.riverRadius * 2);
  expect(size.z).toBeLessThan(6);
  expect(size.x).toBeGreaterThan(1000);
  pool.hide();
  expect(groups.every(group => !group.visible)).toBe(true);
  expect(pool.items.map(s => s.group)).toEqual(groups);
});

test('river masking composes with terrain deformation and clears on restart', () => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
  createTrailEdge(THREE, { halfWidth: 5 }).patchObject(mesh);
  const mask = createRiverMask(THREE, mesh, CONFIG.game);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  mesh.material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  expect(shader.vertexShader).toContain('uEdgeScroll');
  expect(shader.vertexShader).toContain('vRiverPosition = lrWorld.xyz');
  expect(shader.fragmentShader).toContain('discard');
  expect(shader.fragmentShader).not.toContain('uRiverHalfWidth');
  expect(mask.uniforms.uRiverHalfDepth.value).toBe(CONFIG.game.obstacle.riverRadius);
  mask.sync([hazard('river'), hazard('log')]);
  expect([...mask.uniforms.uRiverCentres.value]).toEqual([-12, 10000, 10000, 10000]);
  mask.sync([]);
  expect([...mask.uniforms.uRiverCentres.value]).toEqual([10000, 10000, 10000, 10000]);
});
