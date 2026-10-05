import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '@/engine/config';
import { createRng } from '@/engine/render/world/rng';
import { addScatter, hasSceneryClearance, planPlacements } from '@/engine/render/world/scatter';
import { trailHalfWidth } from '@/engine/render/world/ground';
import type { Palette } from '@/engine/render/world/palette';

describe('scenery lane clearance and instancing', () => {
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
