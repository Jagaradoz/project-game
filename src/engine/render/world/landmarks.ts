/**
 * Authored roadside silhouettes that break the endless scatter into memorable
 * beats: a pair of compact kit trees. Never part of gameplay
 * collision.
 */

import type * as THREE_NS from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { repaintKitModel } from '@/engine/render/world/palette';

import type { Palette } from '@/engine/render/world/palette';
import type { GameConfig, ThreeModule } from '@/engine/types';
import { createHeightSampler } from '@/engine/render/world/ground';
import { LANDMARK_ZONE_FRACTIONS } from '@/engine/render/world/scatter';

export async function addLandmarks(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
  { span = 320, startZ = 20 }: { span?: number; startZ?: number } = {},
) {
  const farZ = startZ - span;
  const heightAt = createHeightSampler(config);
  const loader = new GLTFLoader();
  const treeModels = await Promise.all(['tree_oak', 'tree_pineRoundD'].map(async (name) => {
    try {
      const gltf = await loader.loadAsync(`/assets/models/nature/${name}.glb`);
      repaintKitModel(THREE, gltf.scene, palette.kit);
      return gltf.scene;
    } catch (error) {
      console.warn(`landmarks: could not load ${name}`, error);
      return null;
    }
  }));
  const availableTrees = treeModels.filter((tree): tree is THREE_NS.Group => tree !== null);

  const group = new THREE.Group();
  group.name = 'landmarks';
  scene.add(group);

  const zones = LANDMARK_ZONE_FRACTIONS.map((fraction, index) => {
    const root = new THREE.Group();
    const baseZ = farZ + fraction * span;
    root.position.z = baseZ;
    root.name = `landmark-${index}`;
    buildForestLandmark(THREE, root, heightAt, index, availableTrees);
    group.add(root);
    return { root, baseZ };
  });

  return {
    group,
    zones,
    span,
    startZ: farZ,
    scroll(distance: number) {
      const offset = distance % span;
      for (const zone of zones) {
        const shifted = zone.baseZ - farZ + offset;
        zone.root.position.z = farZ + (shifted % span);
      }
    },
  };
}

type HeightAt = (x: number) => number;

function buildForestLandmark(
  THREE: ThreeModule,
  root: THREE_NS.Group,
  heightAt: HeightAt,
  variant: number,
  treeModels: THREE_NS.Group[],
) {
  // Compact kit trees frame the path without the dense foliage of the old landmark.
  for (const side of treeModels.length ? [-1, 1] : []) {
    const tree = treeModels[(variant + (side > 0 ? 1 : 0)) % treeModels.length]!.clone(true);
    const bounds = new THREE.Box3().setFromObject(tree);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = (8.5 + variant * 0.35) / size.y;
    const radius = Math.hypot(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)), Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z))) * scale;
    const x = side * Math.max(9.5, 6.2 + radius);
    tree.scale.setScalar(scale);
    tree.position.set(x, heightAt(x) - bounds.min.y * scale, side * 0.8);
    tree.rotation.y = variant * 1.7 + side * 0.6;
    tree.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    root.add(tree);
  }
}
