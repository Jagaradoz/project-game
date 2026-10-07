import { expect, test } from 'vitest';
import * as THREE from 'three';
import { CONFIG } from '@/engine/config';
import { addShieldBubble, addSporeCloud } from '@/engine/render/actors/spores';

test('spore cloud shows only while a cloud exists, positioned at its front edge', () => {
  const scene = new THREE.Scene();
  const cloud = addSporeCloud(THREE, scene, CONFIG.game);
  expect(cloud.group.visible).toBe(false);
  cloud.sync([{ id: 1, z: -20, length: 60, status: 'approaching' }], 1000);
  expect(cloud.group.visible).toBe(true);
  expect(cloud.group.position.z).toBe(-20);
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
  expect((shield.mesh.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0.2);
  for (let i = 0; i < 40; i++) shield.update(false, i * 16, 0.016);
  expect(shield.mesh.visible).toBe(false);
});
