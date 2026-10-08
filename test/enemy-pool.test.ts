import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addEnemyPool } from '@/engine/render/actors/enemies';
import { CONFIG } from '@/engine/config';

async function fixture(skinned = false) {
  const model = new THREE.Group();
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  if (skinned) {
    const count = geometry.attributes.position.count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const bone = new THREE.Bone(), mesh = new THREE.SkinnedMesh(geometry, material);
    model.add(bone, mesh); mesh.bind(new THREE.Skeleton([bone]));
  } else model.add(new THREE.Mesh(geometry, material));
  const animations = ['Run', 'Walk', 'Hit', 'Attack', 'Idle', 'Death'].map(name => new THREE.AnimationClip(name, .5,
    [new THREE.NumberKeyframeTrack('.rotation[x]', [0, .5], [0, .1])]));
  const loader = { loadAsync: async () => ({ scene: model, animations }) } as unknown as GLTFLoader;
  return addEnemyPool(THREE, new THREE.Scene(), CONFIG.game, {} as Parameters<typeof addEnemyPool>[3], loader);
}
test('enemy identities survive array removal and a recycled slot restarts its action', async () => {
  const pool = await fixture();
  const a = { id: 1, kind: 'weak' as const, hp: 1, lane: 0, z: -10, previousZ: -10 };
  const b = { ...a, id: 2, lane: 1 };
  pool.sync([a, b], 100, .1);
  const slot = pool.items.find(s => s.id === 2)!;
  pool.sync([b], 200, .1);
  expect(pool.items.find(s => s.id === 2)).toBe(slot);
  pool.sync([{ ...a, id: 3 }], 300, .1);
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
test('a hit flinches on top of the locomotion loop instead of replacing it', async () => {
  const pool = await fixture();
  const brute = { id: 1, kind: 'tank' as const, hp: 4, lane: 1, z: -10, previousZ: -10 };
  pool.sync([brute], 100, .1);
  const slot = pool.items.find(s => s.id === 1)!;
  expect(slot.current).toBe('Walk');
  pool.sync([{ ...brute, lastHitMs: 150 }], 150, .05);
  expect(slot.overlays.Hit!.isRunning()).toBe(true);
  expect(slot.overlays.Hit!.blendMode).toBe(THREE.AdditiveAnimationBlendMode);
  expect(slot.current).toBe('Walk');
  expect(slot.action!.isRunning()).toBe(true);
  pool.dispose();
});
test('every approaching kind plays its authored Walk loop', async () => {
  const pool = await fixture();
  const kinds = ['weak', 'normal', 'tank', 'boss'] as const;
  pool.sync(kinds.map((kind, i) => ({ id: i + 1, kind, hp: 1, lane: i % 3, z: -60, previousZ: -60 })), 100, .1);
  for (const slot of pool.items.filter(s => s.id !== undefined)) expect(slot.current).toBe('Walk');
  pool.dispose();
});
test('enemies are animated from the moment they spawn, not frozen until they are close', async () => {
  const pool = await fixture();
  const z = CONFIG.game.spawnZ;
  const goblin = { id: 1, kind: 'weak' as const, hp: 1, lane: 1, z, previousZ: z };
  pool.sync([goblin], 100, .1);
  const slot = pool.items.find(s => s.id === 1)!, before = slot.action!.time;
  pool.sync([goblin], 200, .1);
  expect(slot.action!.time).not.toBe(before);
  pool.dispose();
});
test('a crowd of the same kind does not march in lockstep', async () => {
  const pool = await fixture();
  pool.sync([1, 2].map(id => ({ id, kind: 'normal' as const, hp: 2, lane: id, z: -30, previousZ: -30 })), 100, 0);
  const [a, b] = [1, 2].map(id => pool.items.find(s => s.id === id)!.action!.time);
  expect(a).not.toBeCloseTo(b!, 3);
  pool.dispose();
});
test('a killed enemy plays Death once and holds the final pose', async () => {
  const pool = await fixture(); pool.spawnDeath(0, -20, 'normal');
  const corpse = pool.corpses.find(s => s.group.visible)!;
  expect(corpse.current).toBe('Death');
  pool.updateCorpses(1, 0);
  expect(corpse.action!.time).toBeCloseTo(.5);
  expect(corpse.group.visible).toBe(true);
  pool.dispose();
});
test('every enemy walks or runs forward relative to the ground it stands on', () => {
  for (const def of Object.values(CONFIG.game.enemyTypes)) expect(def.approachSpeed).toBeGreaterThanOrEqual(0);
});
test('enemies are sized to stand next to the player instead of dwarfed by them', () => {
  const { weak, normal, tank, boss } = CONFIG.game.enemyTypes;
  expect(weak.height).toBeGreaterThanOrEqual(3);
  expect(normal.height).toBeGreaterThanOrEqual(weak.height);
  expect(tank.height).toBeGreaterThanOrEqual(normal.height);
  expect(boss.height).toBeGreaterThan(tank.height * 1.8);
});

test('recycling enemy kinds releases every old bone texture while preserving shared assets', async () => {
  const pool = await fixture(true);
  const disposed: ReturnType<typeof vi.fn>[] = [];
  let geometryDispose: ReturnType<typeof vi.spyOn> | undefined;
  for (let i = 0; i < 120; i++) {
    pool.sync([{ id: i, kind: i % 2 ? 'weak' : 'normal', hp: 1, lane: 1, z: -10, previousZ: -10 }], i * 100, .1);
    const slot = pool.items.find(s => s.id === i)!;
    const mesh = slot.model!.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    if (!geometryDispose) geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    mesh.skeleton.computeBoneTexture();
    const listener = vi.fn();
    mesh.skeleton.boneTexture!.addEventListener('dispose', listener);
    disposed.push(listener);
    if (i) expect(disposed[i - 1]).toHaveBeenCalledTimes(1);
  }
  expect(geometryDispose).not.toHaveBeenCalled();
  pool.dispose();
  expect(disposed.every(listener => listener.mock.calls.length === 1)).toBe(true);
  expect(geometryDispose).toHaveBeenCalled();
});

test('recycled corpse rigs release their bone textures too', async () => {
  const pool = await fixture(true);
  const disposed: ReturnType<typeof vi.fn>[] = [];
  for (let i = 0; i < CONFIG.game.enemy.corpseCount * 4; i++) {
    // Each complete pool rotation switches the kind held by the same corpse slot.
    pool.spawnDeath(0, -10, Math.floor(i / CONFIG.game.enemy.corpseCount) % 2 ? 'weak' : 'normal');
    const slot = pool.corpses[i % pool.corpses.length];
    const mesh = slot.model!.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    mesh.skeleton.computeBoneTexture();
    const listener = vi.fn(); mesh.skeleton.boneTexture!.addEventListener('dispose', listener); disposed.push(listener);
  }
  pool.dispose();
  expect(disposed.every(listener => listener.mock.calls.length === 1)).toBe(true);
});
