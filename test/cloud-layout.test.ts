import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '@/engine/config';
import { addClouds } from '@/engine/render/world/clouds';
import { trailHalfWidth } from '@/engine/render/world/ground';
import { GOLDEN_FOREST } from '@/engine/render/world/palette';
import CLOUD_LAYOUT from '@/engine/render/world/cloud-layout.json';

test('the Blender catalog copies of game config still match the game', () => {
  expect(CLOUD_LAYOUT.spore.catalog.trailHalfWidth).toBeCloseTo(trailHalfWidth(CONFIG.game), 6);
  expect(CLOUD_LAYOUT.spore.catalog.length).toBe(CONFIG.game.spore.length);
});

test('sky clouds use the Blender-authored cloud with baked shading', async () => {
  const loader = new GLTFLoader();
  const loaded: string[] = [];
  loader.loadAsync = async (url: string) => {
    loaded.push(url);
    const data = await readFile(new URL(`../public${url}`, import.meta.url));
    return loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  };
  const clouds = await addClouds(THREE, new THREE.Scene(), GOLDEN_FOREST, loader);
  expect(loaded).toEqual([`/assets/models/environment/${CLOUD_LAYOUT.sky.asset}.glb`]);
  expect(clouds.mesh.count).toBe(CLOUD_LAYOUT.sky.count);
  const colors = clouds.mesh.geometry.getAttribute('color');
  const positions = clouds.mesh.geometry.getAttribute('position');
  // Baked shading: the top of the cloud is brighter than its underside.
  let top = 0;
  let bottom = 0;
  for (let i = 0; i < positions.count; i++) {
    if (positions.getY(i) > positions.getY(top)) top = i;
    if (positions.getY(i) < positions.getY(bottom)) bottom = i;
  }
  expect(colors.getY(top)).toBeGreaterThan(colors.getY(bottom) + 0.2);
});
