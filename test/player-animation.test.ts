import { test, expect, vi } from 'vitest';
import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '@/engine/config';
import { addPlayer } from '@/engine/render/actors/player';
import { updatePlayerAnimation } from '@/engine/render/sync';

async function fixture() {
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const animations = ['Run', 'Attack', 'Death', 'Idle'].map((name) =>
    new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('.rotation[x]', [0, 1], [0, 0.1])]),
  );
  const loadAsync = vi.fn().mockResolvedValue({ scene: model, animations });
  const config = {
    ...CONFIG.game,
    defaultCharacter: 'mage',
    characters: {
      ...CONFIG.game.characters,
      mage: {
        ...CONFIG.game.characters.mage,
        animations: { run: 'Run', shoot: 'Attack', death: 'Death', idle: 'Idle' },
      },
    },
  } as typeof CONFIG.game;
  const palette = { accents: { player: '#ffffff', bullet: '#ffffff' } } as Parameters<typeof addPlayer>[3];
  const player = await addPlayer(THREE, new THREE.Scene(), config, palette, { loadAsync } as unknown as GLTFLoader);
  const step = (isFiring: boolean, dt = 0.1, isOver = false, justFired = isFiring) =>
    updatePlayerAnimation(player, { isFiring, isOver, justFired }, dt);
  return { player, step, loadAsync };
}

test('runs by default, completes an attack after release, and fades back to run without idle', async () => {
  const { player, step } = await fixture();
  step(false);
  expect(player.currentActionName).toBe('run');
  step(true);
  expect(player.currentActionName).toBe('shoot');
  step(false, 0.2);
  expect(player.currentActionName).toBe('shoot');
  expect(player.currentAction!.time).toBeCloseTo(0.6);
  step(false, 0.3);
  step(false);
  expect(player.currentActionName).toBe('run');
  step(false, 0.2);
  expect(player.actions.run.getEffectiveWeight()).toBeCloseTo(1);
  expect(player.actions.idle.isRunning()).toBe(false);
});

test('each shot interrupts the previous attack while frames between shots do not restart it', async () => {
  const { player, step } = await fixture();
  step(true, 0.1);
  step(true, 0.1, false, false);
  expect(player.currentAction!.time).toBeCloseTo(0.4);
  step(true, 0.05);
  expect(player.currentActionName).toBe('shoot');
  expect(player.currentAction!.time).toBeCloseTo(0.1);
  expect(player.currentAction!.isRunning()).toBe(true);
});

test('death interrupts attack, holds its final pose, and a new run can resume', async () => {
  const { player, step } = await fixture();
  step(true);
  step(true, 1.1, true);
  expect(player.currentActionName).toBe('death');
  expect(player.currentAction!.time).toBe(1);
  step(true, 0.2, true);
  expect(player.currentAction!.time).toBe(1);
  step(false);
  expect(player.currentActionName).toBe('run');
});

test('missing attacks keep run looping and character reload resets completed actions', async () => {
  const { player, step } = await fixture();
  delete player.actions.shoot;
  step(true, 1.2);
  expect(player.currentActionName).toBe('run');
  expect(player.currentAction!.loop).toBe(THREE.LoopRepeat);
  await player.loadCharacter('orb');
  expect(player.mixer).toBeNull();
  expect(player.currentActionName).toBeNull();
  await player.loadCharacter('mage');
  expect(player.currentActionName).toBe('run');
  step(true);
  expect(player.currentActionName).toBe('shoot');
});

test('failed character loads clear the previous mixer and attack state', async () => {
  const { player, step, loadAsync } = await fixture();
  step(true);
  loadAsync.mockRejectedValueOnce(new Error('unavailable'));
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(await player.loadCharacter('druid')).toBe(false);
    expect(player.fallbackVisible).toBe(true);
    expect(player.mixer).toBeNull();
    expect(player.currentActionName).toBeNull();
    expect(player.actions).toEqual({});
  } finally {
    error.mockRestore();
  }
});
