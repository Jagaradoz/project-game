import { expect, test } from 'vitest';
import * as THREE from 'three';
import { addSpellPool } from '@/engine/render/actors/spells';
import { createGameState } from '@/engine/core/state';
import { CONFIG } from '@/engine/config';

const firing = () => ({ ...createGameState(), bullets: [{ lane: 1, z: -2, previousZ: -2 }], elapsedMs: 100 });

function ballMaterials(pool: ReturnType<typeof addSpellPool>) {
  const [outline, core, glow] = pool.items[0]!.mesh.children as THREE.Mesh[];
  return {
    outline: outline!.material as THREE.MeshBasicMaterial,
    core: core!.material as THREE.MeshMatcapMaterial,
    glow: glow!.material as THREE.MeshBasicMaterial,
  };
}

test('a ball is a glossy core inside a dark back-face outline and an additive glow', () => {
  const pool = addSpellPool(THREE, new THREE.Scene(), CONFIG.game);
  pool.sync(firing(), 1 / 60, 'mage');
  const { outline, core, glow } = ballMaterials(pool);

  expect(pool.items[0]!.mesh.visible).toBe(true);
  expect(pool.items[1]!.mesh.visible).toBe(false);
  expect(core.matcap).toBeInstanceOf(THREE.Texture);
  expect(outline.side).toBe(THREE.BackSide);
  expect(outline.color.getHexString()).not.toBe(core.color.getHexString());
  expect(glow.blending).toBe(THREE.AdditiveBlending);
  pool.dispose();
});

test('each magician casts in their own colour, and switching re-tints the balls', () => {
  const pool = addSpellPool(THREE, new THREE.Scene(), CONFIG.game);
  pool.sync(firing(), 1 / 60, 'mage');
  const mage = ballMaterials(pool).core.color.getHexString();
  pool.sync({ ...firing(), elapsedMs: 200 }, 1 / 60, 'druid');
  const druid = ballMaterials(pool).core.color.getHexString();

  expect(druid).not.toBe(mage);
  expect(ballMaterials(pool).glow.color.getHexString()).toBe(druid);
  pool.dispose();
});

test('reset hides every ball', () => {
  const pool = addSpellPool(THREE, new THREE.Scene(), CONFIG.game);
  pool.sync(firing(), 1 / 60, 'witch');
  pool.reset();

  expect(pool.items.every((slot) => !slot.mesh.visible)).toBe(true);
  pool.dispose();
});
