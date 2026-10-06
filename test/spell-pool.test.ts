import { expect, test } from 'vitest';
import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addSpellPool } from '@/engine/render/actors/spells';
import { createGameState } from '@/engine/core/state';
import { CONFIG } from '@/engine/config';

test('spell components play their authored loop and switching magician releases the old mixer', async () => {
  const model = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  ring.name = 'Ring'; model.add(ring);
  const clip = new THREE.AnimationClip('Loop', 1, [new THREE.NumberKeyframeTrack('Ring.rotation[x]', [0, 1], [0, 1])]);
  const loader = { loadAsync: async () => ({ scene: model.clone(true), animations: [clip] }) } as unknown as GLTFLoader;
  const pool = await addSpellPool(THREE, new THREE.Scene(), CONFIG.game, loader);
  const state = { ...createGameState(), bullets: [{ lane: 1, z: -2, previousZ: -2 }], elapsedMs: 100 };
  pool.sync(state, .25, 'mage');
  expect(pool.items[0].model!.getObjectByName('Ring')!.rotation.x).toBeCloseTo(.25);
  pool.sync({ ...state, elapsedMs: 200 }, .25, 'druid');
  expect(pool.items[0].model!.getObjectByName('Ring')!.rotation.x).toBeCloseTo(.25);
  pool.dispose();
});
