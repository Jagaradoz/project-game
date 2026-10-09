import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '@/engine/config';
import { createRng } from '@/engine/render/world/rng';
import { addScatter, hasSceneryClearance, planPlacements } from '@/engine/render/world/scatter';
import { trailHalfWidth } from '@/engine/render/world/ground';
import type { Palette } from '@/engine/render/world/palette';

describe('scenery lane clearance and instancing', () => {
  it('reduces nearby trees and grass, removes distant filler, and restores the same placements', async () => {
    const loader = { loadAsync: async () => {
      const root = new THREE.Group();
      root.add(new THREE.Mesh(new THREE.BoxGeometry(.3, .3, .3), new THREE.MeshStandardMaterial()));
      return { scene: root };
    } } as unknown as GLTFLoader;
    const result = await addScatter(THREE, new THREE.Scene(), CONFIG.game, {} as Palette, loader, {
      span: 160, seed: 18,
      layers: {
        trees: { count: 20, band: [12, 35], scale: [1, 1], castShadow: true, models: ['tree_pineSmallB'] },
        grass: { count: 40, band: [10, 35], scale: [1, 1], castShadow: false, models: ['grass'] },
        distantGrass: { count: 40, band: [40, 70], scale: [1, 1], castShadow: false, detail: true, models: ['grass'] },
      },
    });
    const near = result.meshes.filter(entry => !entry.detail);
    result.setQuality('high'); result.scroll(80);
    const fullMatrices = near.map(entry => Array.from(entry.mesh.instanceMatrix.array));
    result.setQuality('medium'); result.scroll(80);
    const mediumCounts = near.map(entry => entry.mesh.count);
    result.setQuality('low'); result.scroll(80);
    near.forEach((entry, index) => {
      expect(entry.mesh.count).toBeGreaterThan(0);
      expect(entry.mesh.count).toBeLessThan(mediumCounts[index]!);
      expect(mediumCounts[index]).toBeLessThan(entry.fullCount);
    });
    const detail = result.meshes.find(entry => entry.detail)!;
    expect(detail.mesh.count).toBe(0);
    expect(detail.mesh.visible).toBe(false);
    const version = detail.mesh.instanceMatrix.version;
    result.scroll(90);
    expect(detail.mesh.instanceMatrix.version).toBe(version);
    result.setQuality('high'); result.scroll(80);
    near.forEach((entry, index) => {
      expect(entry.mesh.count).toBe(entry.fullCount);
      expect(Array.from(entry.mesh.instanceMatrix.array)).toEqual(fullMatrices[index]);
    });
    expect(detail.mesh.visible).toBe(true);
    expect(detail.mesh.count).toBe(detail.fullCount);
  });
  it('keeps dirt shoulder footprints outside every physical lane with varied lane dimensions', () => {
    for (const [laneCount, laneWidth] of [[3, 2.4], [5, 3.2]]) {
      const config = { ...CONFIG.game, laneCount: laneCount!, laneWidth: laneWidth! };
      const sources = new Map([['stone_smallPair', { radius: 0.15 }], ['grass', { radius: 0.4 }]]);
      const placements = planPlacements(createRng(24289), {
        count: 50, band: [0, 0], scale: [0.45, 0.8], castShadow: false,
        shoulder: true, models: [...sources.keys()],
      }, 160, -140, () => 0, sources, [], config);
      expect(placements.length).toBeGreaterThan(15);
      for (const entry of placements) {
        const radius = sources.get(entry.model)!.radius * entry.scale;
        expect(Math.abs(entry.x) - radius).toBeGreaterThanOrEqual(config.laneCount * config.laneWidth / 2 + 0.3);
        expect(Math.abs(entry.x) + radius).toBeLessThanOrEqual(trailHalfWidth(config) - 0.4);
      }
    }
  });

  it('respects neighbour footprints at the scroll seam', () => {
    expect(hasSceneryClearance({ x: 10, z: 19.9, radius: 1 }, [{ x: 10, z: -139.9, radius: 1 }], 160)).toBe(false);
    expect(hasSceneryClearance({ x: 15, z: 19.9, radius: 1 }, [{ x: 10, z: -139.9, radius: 1 }], 160)).toBe(true);
  });

  it('uploads stationary scenery only once and refreshes newly visible detail at the current distance', async () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(.3, .3, .3), new THREE.MeshStandardMaterial()));
    const loader = { loadAsync: async () => ({ scene: root }) } as unknown as GLTFLoader;
    const result = await addScatter(THREE, new THREE.Scene(), CONFIG.game, {} as Palette, loader, {
      span: 160, seed: 12,
      layers: { grass: { count: 20, band: [10, 35], scale: [1, 1], castShadow: false, detail: true, models: ['grass'] } },
    });
    const entry = result.meshes[0]!;
    result.setQuality('low');
    result.scroll(80);
    const version = entry.mesh.instanceMatrix.version;
    result.scroll(80);
    expect(entry.mesh.instanceMatrix.version).toBe(version);
    result.setQuality('high');
    result.scroll(80);
    expect(entry.mesh.instanceMatrix.version).toBeGreaterThan(version);
    expect(entry.mesh.count).toBe(entry.fullCount);
    for (let i = 0; i < entry.fullCount; i++) {
      expect(entry.mesh.instanceMatrix.array[i * 16 + 14]).toBeCloseTo(-140 + ((entry.baseZ[i]! + 140 + 80) % 160) + entry.zOffset[i]!, 4);
    }
  });

  it('batches ground and platform grass, preserves materials and keeps tops attached after scrolling', async () => {
    const material = new THREE.MeshStandardMaterial({ color: 0xabc123 });
    const loader = { loadAsync: async (path: string) => {
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3).translate(0, 0.15, 0), material);
      if (path.includes('rock_largeA')) mesh.userData = { plateauY: 0.8, plateauRadius: 0.85 };
      root.add(mesh);
      return { scene: root };
    } } as unknown as GLTFLoader;
    const result = await addScatter(THREE, new THREE.Scene(), CONFIG.game, {} as Palette, loader, {
      span: 160, seed: 123,
      layers: {
        grass: { count: 10, band: [10, 35], scale: [1, 1.5], castShadow: false, models: ['grass'] },
        outcrops: { count: 3, band: [20, 40], scale: [4, 4], castShadow: true, models: ['rock_largeA'] },
      },
    });
    expect(result.meshes.filter((entry) => entry.mesh.name === 'scatter:grass')).toHaveLength(1);
    expect(result.meshes.every((entry) => entry.mesh.material === material)).toBe(true);
    expect(material.color.getHex()).toBe(0xabc123);
    const platforms = result.meshes.find((entry) => entry.mesh.name === 'scatter:rock_largeA')!;
    const grass = result.meshes.find((entry) => entry.mesh.name === 'scatter:grass')!;
    const attached = Array.from(grass.baseZ).map((anchor, index) => ({ anchor, index }))
      .filter(({ anchor }) => Array.from(platforms.baseZ).includes(anchor));
    expect(attached.length).toBeGreaterThan(0);
    for (const distance of [0, 160, 320.7, 80]) {
      result.scroll(distance);
      for (const { anchor, index } of attached) {
        const parentIndex = Array.from(platforms.baseZ).indexOf(anchor);
        const parentZ = platforms.mesh.instanceMatrix.array[parentIndex * 16 + 14]!;
        const childZ = grass.mesh.instanceMatrix.array[index * 16 + 14]!;
        expect(childZ - parentZ).toBeCloseTo(grass.zOffset[index]!, 4);
      }
    }
  });
});
