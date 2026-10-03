/**
 * Authored roadside silhouettes that break the endless scatter into memorable
 * beats: a pair of compact kit trees and a trail sign. Never part of gameplay
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
  const materials = createMaterials(THREE, palette);
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
    buildForestLandmark(THREE, root, materials, heightAt, index, availableTrees);
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

type LandmarkMaterials = ReturnType<typeof createMaterials>;

function createMaterials(THREE: ThreeModule, palette: Palette) {
  const material = (color: string) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  });
  return {
    wood: material(palette.kit.woodBark),
    accent: material(palette.accents.marker),
  };
}

function addMesh(
  THREE: ThreeModule,
  root: THREE_NS.Group,
  geometry: THREE_NS.BufferGeometry,
  material: THREE_NS.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

type HeightAt = (x: number) => number;

function buildForestLandmark(
  THREE: ThreeModule,
  root: THREE_NS.Group,
  mat: LandmarkMaterials,
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
  // A small trail marker gives the composition a recognisable focal point.
  const signX = variant % 2 === 0 ? -6.3 : 6.3;
  const signY = heightAt(signX);
  addMesh(THREE, root, new THREE.CylinderGeometry(0.12, 0.16, 2.1, 6), mat.wood, [signX, signY + 1.05, -2]);
  addMesh(THREE, root, new THREE.BoxGeometry(1.5, 0.65, 0.18), mat.accent, [signX, signY + 1.75, -2], [0, variant * 0.28, 0]);
}
