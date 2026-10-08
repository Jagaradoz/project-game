import { expect, test } from 'vitest';
import * as THREE from 'three';
import { addSpellPool } from '@/engine/render/actors/spells';
import { createGameState } from '@/engine/core/state';
import { CONFIG } from '@/engine/config';

const firing = () => ({ ...createGameState(), bullets: [{ lane: 1, z: -2, previousZ: -2 }], elapsedMs: 100 });

function ballMaterials(pool: ReturnType<typeof addSpellPool>) {
  const [outlineObject, coreObject, glowObject] = pool.items[0]!.mesh.children;
  if (!(outlineObject instanceof THREE.Mesh) || !(coreObject instanceof THREE.Mesh) || !(glowObject instanceof THREE.Sprite)) {
    throw new Error('Spell ball children must be an outline mesh, core mesh and halo sprite');
  }
  const outline = outlineObject;
  const core = coreObject;
  const glow = glowObject;
  return {
    outline: outline.material as THREE.MeshBasicMaterial,
    core: core.material as THREE.MeshMatcapMaterial,
    glow,
    glowMaterial: glow.material as THREE.SpriteMaterial,
  };
}

test('a ball has a glossy core, dark outline and soft additive radial halo', () => {
  const pool = addSpellPool(THREE, new THREE.Scene(), CONFIG.game);
  pool.sync(firing(), 1 / 60, 'mage');
  const { outline, core, glow, glowMaterial } = ballMaterials(pool);

  expect(pool.items[0]!.mesh.visible).toBe(true);
  expect(pool.items[1]!.mesh.visible).toBe(false);
  expect(core.matcap).toBeInstanceOf(THREE.Texture);
  expect(outline.side).toBe(THREE.BackSide);
  expect(outline.color.getHexString()).not.toBe(core.color.getHexString());
  expect(glow).toBeInstanceOf(THREE.Sprite);
  expect(glowMaterial.blending).toBe(THREE.AdditiveBlending);
  expect(glowMaterial.transparent).toBe(true);
  const alpha = (glowMaterial.map!.image as { data: Uint8Array; width: number }).data;
  expect(alpha[(32 * 64 + 32) * 4 + 3]).toBeGreaterThan(alpha[3]!);
  pool.dispose();
});

test('each magician casts in their own colour, and switching re-tints the balls', () => {
  const pool = addSpellPool(THREE, new THREE.Scene(), CONFIG.game);
  pool.sync(firing(), 1 / 60, 'mage');
  const mage = ballMaterials(pool).core.color.getHexString();
  pool.sync({ ...firing(), elapsedMs: 200 }, 1 / 60, 'druid');
  const druid = ballMaterials(pool).core.color.getHexString();

  expect(druid).not.toBe(mage);
  expect(ballMaterials(pool).glowMaterial.color.getHexString()).toBe(druid);
  pool.dispose();
});

test('pooled balls reuse their slots and dispose the shared halo and instanced effects', () => {
  const scene = new THREE.Scene();
  const pool = addSpellPool(THREE, scene, CONFIG.game);
  const texture = ballMaterials(pool).glowMaterial.map!;
  const instanced = scene.children.filter((child) => child instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
  const ballCount = pool.items.length;
  let textureDisposed = false;
  let layersDisposed = 0;
  texture.addEventListener('dispose', () => { textureDisposed = true; });
  instanced.forEach((layer) => layer.addEventListener('dispose', () => { layersDisposed += 1; }));

  pool.sync(firing(), 1 / 60, 'mage');
  const firstMesh = pool.items[0]!.mesh;
  pool.sync({ ...firing(), elapsedMs: 200 }, 1 / 60, 'mage');
  pool.reset();
  pool.dispose();

  expect(pool.items).toHaveLength(ballCount);
  expect(pool.items[0]!.mesh).toBe(firstMesh);
  expect(textureDisposed).toBe(true);
  expect(layersDisposed).toBe(2);
});

test('reset hides every ball', () => {
  const pool = addSpellPool(THREE, new THREE.Scene(), CONFIG.game);
  pool.sync(firing(), 1 / 60, 'witch');
  pool.reset();

  expect(pool.items.every((slot) => !slot.mesh.visible)).toBe(true);
  pool.dispose();
});
