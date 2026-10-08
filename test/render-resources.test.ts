import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { collectResources, disposeSkeletons } from '@/engine/render/resources';

test('a rig shared by multiple meshes releases its bone texture once', () => {
  const root = new THREE.Group(), skeleton = new THREE.Skeleton([new THREE.Bone()]);
  skeleton.computeBoneTexture();
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.SkinnedMesh(); mesh.skeleton = skeleton; root.add(mesh);
  }
  const dispose = vi.spyOn(skeleton, 'dispose');
  disposeSkeletons(root);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(skeleton.boneTexture).toBeNull();
});

test('scene cleanup includes point textures, sprites, and shader textures without duplicates', () => {
  const scene = new THREE.Scene(), texture = new THREE.Texture();
  const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ map: texture }));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  const shader = new THREE.ShaderMaterial({ uniforms: { uMap: { value: texture } } });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), shader);
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ map: texture });
  scene.add(points, sprite, mesh);
  const dispose = vi.spyOn(texture, 'dispose');
  const resources = new Set<{ dispose(): void }>(); collectResources(scene, resources);
  for (const resource of resources) resource.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(resources.has(points.geometry)).toBe(true);
  expect(resources.has(points.material)).toBe(true);
  expect(resources.has(sprite.material)).toBe(true);
  expect(resources.has(mesh.customDepthMaterial)).toBe(true);
});
