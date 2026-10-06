import { expect, test } from 'vitest';
import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addEnemyPool } from '@/engine/render/actors/enemies';
import { CONFIG } from '@/engine/config';

async function fixture() {
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const animations = ['Run', 'Walk', 'Hit', 'Attack', 'Idle', 'Death'].map(name => new THREE.AnimationClip(name, .5,
    [new THREE.NumberKeyframeTrack('.rotation[x]', [0, .5], [0, .1])]));
  const loader = { loadAsync: async () => ({ scene: model, animations }) } as unknown as GLTFLoader;
  return addEnemyPool(THREE, new THREE.Scene(), CONFIG.game, {} as Parameters<typeof addEnemyPool>[3], loader);
}
test('enemy identities survive array removal and a recycled slot restarts its action', async () => {
  const pool = await fixture();
  const a = { id: 1, kind: 'weak' as const, hp: 1, lane: 0, z: -10, previousZ: -10 };
  const b = { ...a, id: 2, lane: 1 };
  pool.sync([a, b], 100, .1, false);
  const slot = pool.items.find(s => s.id === 2)!;
  pool.sync([b], 200, .1, false);
  expect(pool.items.find(s => s.id === 2)).toBe(slot);
  pool.sync([{ ...a, id: 3 }], 300, .1, false);
  expect(pool.items.find(s => s.id === 3)!.action!.isRunning()).toBe(true);
  pool.dispose();
});
test('reset hides old corpses when a run restarts', async () => {
  const pool = await fixture(); pool.spawnDeath(0, 0, 'tank');
  expect(pool.corpses.some(s => s.group.visible)).toBe(true);
  pool.reset();
  expect(pool.corpses.some(s => s.group.visible)).toBe(false);
  pool.dispose();
});
