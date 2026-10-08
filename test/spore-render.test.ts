import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '@/engine/config';
import { addShieldBubble } from '@/engine/render/actors/shield';
import { addSporeCloud } from '@/engine/render/actors/spores';

function fileLoader(loaded: string[]) {
  const loader = new GLTFLoader();
  loader.loadAsync = async (url: string) => {
    loaded.push(url);
    const data = await readFile(new URL(`../public${url}`, import.meta.url));
    return loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
  };
  return loader;
}

test('spore cloud shows only while a cloud exists, positioned at its front edge', async () => {
  const scene = new THREE.Scene();
  const loaded: string[] = [];
  const cloud = await addSporeCloud(THREE, scene, CONFIG.game, fileLoader(loaded));
  // Only the mist: three puff shapes, nothing else.
  expect(loaded.map(url => url.split('/').pop())).toEqual(['spore_puff_A.glb', 'spore_puff_B.glb', 'spore_puff_C.glb']);
  expect(cloud.group.visible).toBe(false);
  cloud.sync([{ id: 1, z: -20, length: 60, status: 'approaching' }], 1000);
  expect(cloud.group.visible).toBe(true);
  expect(cloud.group.position.z).toBe(-20);
  expect(cloud.group.children.some(child => (child as THREE.Group).isGroup)).toBe(false);
  // Puffs over the lanes ride high enough to keep the road readable.
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  for (const mesh of cloud.group.children.filter(child => (child as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh[]) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      if (Math.abs(position.x) < 1.5) expect(position.y).toBeGreaterThan(1.5);
    }
  }
  cloud.sync([], 1100);
  expect(cloud.group.visible).toBe(false);
  cloud.sync([{ id: 1, z: -20, length: 60, status: 'approaching' }], 1200);
  cloud.hide();
  expect(cloud.group.visible).toBe(false);
});

test('shield bubble fades in while shielding and out after', () => {
  const parent = new THREE.Group();
  const shield = addShieldBubble(THREE, parent);
  expect(parent.children).toContain(shield.mesh);
  expect(shield.mesh.visible).toBe(false);
  for (let i = 0; i < 20; i++) shield.update(true, i * 16, 0.016);
  expect(shield.mesh.visible).toBe(true);
  expect((shield.bubble.material as THREE.ShaderMaterial).uniforms.uOpacity!.value).toBeGreaterThan(0.2);
  expect(shield.bubble.scale.x).toBeGreaterThan(0.9);
  expect(shield.sparks.visible).toBe(true);
  for (let i = 0; i < 40; i++) shield.update(false, i * 16, 0.016);
  expect(shield.mesh.visible).toBe(false);
});
