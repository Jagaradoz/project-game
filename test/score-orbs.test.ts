import { expect, test } from 'vitest';
import * as THREE from 'three';

import { CONFIG } from '@/engine/config';
import { createScoreOrbs } from '@/engine/render/actors/scoreOrbs';
import { GOLDEN_FOREST } from '@/engine/render/world/palette';
import type { ScoreOrb } from '@/engine/types';
import { countUpValue } from '@/hooks/useCountUp';

const STEP_SEC = 1 / 60;
const PLAYER = { x: 0, y: 1.6, z: 0 };
const POOL = CONFIG.game.scoreOrbs.maxOrbs;

function orbs() {
  const scene = new THREE.Scene();
  const refs = createScoreOrbs(THREE, scene, GOLDEN_FOREST, CONFIG.game);
  return { scene, refs };
}

const field = (count: number, lane = 1, z = -20): ScoreOrb[] =>
  Array.from({ length: count }, (_, index) => ({ id: index + 1, lane, z: z - index, previousZ: z - index, value: 10 }));

/** Slots are claimed from index 0 upwards. */
function positionAt(mesh: THREE.InstancedMesh, index: number) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return { position, quaternion, scale: scale.x };
}

test('core and halo share one matrix buffer and one colour buffer, with no shadows', () => {
  const { scene, refs } = orbs();

  expect(scene.children).toEqual([refs.mesh, refs.halo, refs.splash.dots, refs.popups.group]);
  expect(refs.halo.instanceMatrix).toBe(refs.mesh.instanceMatrix);
  expect(refs.halo.instanceColor).toBe(refs.mesh.instanceColor);
  expect(refs.halo.castShadow || refs.mesh.castShadow).toBe(false);
  expect((refs.halo.material as THREE.MeshBasicMaterial).blending).toBe(THREE.AdditiveBlending);
  expect(refs.mesh.count).toBeGreaterThan(POOL);
});

test('orbs take colours from the palette, and a burst is not all one colour', () => {
  const { refs } = orbs();
  refs.update(field(12), [], STEP_SEC, PLAYER);

  const allowed = GOLDEN_FOREST.accents.orbs.map((hex) => new THREE.Color(hex).getHexString());
  const seen = new Set<string>();
  const color = new THREE.Color();
  for (let index = 0; index < 12; index += 1) {
    refs.mesh.getColorAt(index, color);
    seen.add(color.getHexString());
  }
  expect([...seen].every((hex) => allowed.includes(hex))).toBe(true);
  expect(seen.size).toBeGreaterThan(1);
});

test('ground orbs sit where the reducer put them and settle onto the trail', () => {
  const { refs } = orbs();
  const lying = field(1, 2, -35);
  for (let frame = 0; frame < 90; frame += 1) refs.update(lying, [], STEP_SEC, PLAYER);

  const { position, scale } = positionAt(refs.mesh, 0);
  expect(position.z).toBe(-35);
  // Scattered freely around the kill point, regardless of lane edges.
  expect(Math.abs(position.x - CONFIG.game.laneWidth)).toBeLessThanOrEqual(3.5);
  expect(position.y).toBeGreaterThan(0);
  expect(position.y).toBeLessThan(1);
  expect(scale).toBeGreaterThan(0.5);
});

test('uncollected orbs never fly to the player on their own', () => {
  const { refs } = orbs();
  const lying = field(3, 0, -10);
  for (let frame = 0; frame < 120; frame += 1) refs.update(lying, [], STEP_SEC, PLAYER);
  expect(positionAt(refs.mesh, 0).position.z).toBe(-10);
  expect(refs.activeCount).toBe(3);
});

test('a collected orb flies into the player and is retired', () => {
  const { refs } = orbs();
  refs.update(field(1, 1, -3), [], STEP_SEC, PLAYER);
  refs.update([], [1], STEP_SEC, PLAYER);
  expect(refs.activeCount).toBe(1);

  for (let frame = 0; frame < 30 && refs.activeCount > 0; frame += 1) refs.update([], [], STEP_SEC, PLAYER);
  expect(refs.activeCount).toBe(0);
});

test('a landed orb splashes, and the splash fades out on its own', () => {
  const { refs } = orbs();
  refs.update(field(1, 1, -3), [], STEP_SEC, PLAYER);
  refs.update([], [1], STEP_SEC, PLAYER);
  for (let frame = 0; frame < 60 && refs.activeCount > 0; frame += 1) refs.update([], [], STEP_SEC, PLAYER);

  expect(refs.splash.liveCount).toBeGreaterThan(0);
  expect(positionAt(refs.splash.dots, 0).scale).toBeGreaterThan(0.5);
  // Bursts from the character's centre, not from wherever the orb was.
  expect(positionAt(refs.splash.dots, 0).position.distanceTo(new THREE.Vector3(PLAYER.x, PLAYER.y, PLAYER.z))).toBeLessThan(0.2);
  for (let frame = 0; frame < 60; frame += 1) refs.update([], [], STEP_SEC, PLAYER);
  expect(refs.splash.liveCount).toBe(0);
  expect(positionAt(refs.splash.dots, 0).scale).toBeLessThan(0.01);
});

test('a landed orb shows its points beside the character, rising and fading away', () => {
  const { refs } = orbs();
  refs.update(field(1, 1, -3), [], STEP_SEC, PLAYER);
  refs.update([], [1], STEP_SEC, PLAYER);
  for (let frame = 0; frame < 60 && refs.activeCount > 0; frame += 1) refs.update([], [], STEP_SEC, PLAYER);

  const label = refs.popups.group.children.find((child) => child.visible) as THREE.Sprite;
  expect(refs.popups.liveCount).toBe(1);
  expect(Math.abs(label.position.x - PLAYER.x)).toBeLessThan(2);
  const startY = label.position.y;

  for (let frame = 0; frame < 20; frame += 1) refs.update([], [], STEP_SEC, PLAYER);
  expect(label.position.y).toBeGreaterThan(startY);
  expect(label.scale.y).toBeGreaterThan(0);

  for (let frame = 0; frame < 60; frame += 1) refs.update([], [], STEP_SEC, PLAYER);
  expect(refs.popups.liveCount).toBe(0);
  expect(label.visible).toBe(false);
});

test('an orb that leaves the field uncollected just disappears', () => {
  const { refs } = orbs();
  refs.update(field(2), [], STEP_SEC, PLAYER);
  refs.update(field(1), [], STEP_SEC, PLAYER);

  expect(refs.activeCount).toBe(1);
});

test('hide retires everything that is showing', () => {
  const { refs } = orbs();
  refs.update(field(6), [], STEP_SEC, PLAYER);
  refs.hide();

  expect(refs.activeCount).toBe(0);
  expect(positionAt(refs.mesh, 0).scale).toBeLessThan(0.01);
});

test('the HUD count-up eases from the old score to the new one', () => {
  expect(countUpValue(100, 400, 0)).toBe(100);
  expect(countUpValue(100, 400, 0.5)).toBeGreaterThan(250);
  expect(countUpValue(100, 400, 1)).toBe(400);
  expect(countUpValue(100, 400, 3)).toBe(400);
});
