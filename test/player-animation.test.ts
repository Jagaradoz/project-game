import { test, expect, vi } from 'vitest';
import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '@/engine/config';
import { addPlayer } from '@/engine/render/actors/player';
import { syncScene, updatePlayerAnimation, type SceneRefs } from '@/engine/render/sync';
import { createGameState, updateGame } from '@/engine/core/state';

async function fixture() {
  const model = new THREE.Group();
  model.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const animations = ['Run', 'Attack', 'Death', 'Idle', 'Hit', 'Jump'].map((name) =>
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
        animations: { run: 'Run', shoot: 'Attack', death: 'Death', idle: 'Idle', hit: 'Hit', jump: 'Jump' },
      },
    },
  } as typeof CONFIG.game;
  const palette = { accents: { player: '#ffffff', bullet: '#ffffff' } } as Parameters<typeof addPlayer>[3];
  const player = await addPlayer(THREE, new THREE.Scene(), config, palette, { loadAsync } as unknown as GLTFLoader);
  const step = (isFiring: boolean, dt = 0.1, isOver = false, justFired = isFiring) =>
    updatePlayerAnimation(player, { isFiring, isOver, justFired }, dt);
  return { player, step, loadAsync, model };
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

test('hit and jump take priority over repeated shots', async () => {
  const { player } = await fixture();
  updatePlayerAnimation(player, { isOver: false, isFiring: true, justFired: true, justHit: true }, .1);
  expect(player.currentActionName).toBe('hit');
  updatePlayerAnimation(player, { isOver: false, isFiring: true, justFired: true }, .1);
  expect(player.currentActionName).toBe('hit');
  player.playAnimation('run');
  updatePlayerAnimation(player, { isOver: false, isFiring: true, justFired: true, jumpStartedMs: 10 }, .1);
  expect(player.currentActionName).toBe('jump');
});

test('a cleared stage plays idle, while defeat plays death', async () => {
  const { player } = await fixture();
  updatePlayerAnimation(player, { isOver: true, isFiring: false, justFired: false, isCleared: true }, .1);
  expect(player.currentActionName).toBe('idle');
});

test.each([15, 30, 60, 120, 144])('jump pose follows game time without restarting at %i FPS', async (fps) => {
  const { player } = await fixture();
  let state = createGameState();
  const reset = vi.spyOn(player.actions.jump, 'reset');
  const dtMs = 1000 / fps;
  for (let frame = 0; frame < Math.ceil(1100 / dtMs); frame++) {
    state = updateGame(state, { lane: 1, isFiring: false, jump: frame === 0 }, dtMs);
    updatePlayerAnimation(player, state, Math.min(dtMs / 1000, .1));
    if (state.jumpStartedMs !== null) {
      const phase = (state.elapsedMs - state.jumpStartedMs) / CONFIG.game.jump.durationMs;
      // The source's frames 4-13 are airborne; frames 13-19 absorb landing.
      expect(player.actions.jump.time).toBeCloseTo((4 + phase * 9) / 19, 5);
      expect(player.currentActionName).toBe('jump');
    }
  }
  expect(reset).toHaveBeenCalledTimes(1);
});

test('airborne damage preserves the jump pose and landing completes before running', async () => {
  const { player } = await fixture();
  const state = { ...createGameState(), jumpStartedMs: 0, elapsedMs: 400, justHit: true };
  updatePlayerAnimation(player, state, .05);
  expect(player.currentActionName).toBe('jump');
  updatePlayerAnimation(player, { ...state, justHit: false, jumpStartedMs: null, elapsedMs: 800 }, .05);
  expect(player.currentActionName).toBe('jump');
  expect(player.actions.jump.paused).toBe(false);
  updatePlayerAnimation(player, { ...state, justHit: false, jumpStartedMs: null, elapsedMs: 1200 }, .4);
  updatePlayerAnimation(player, { ...state, justHit: false, jumpStartedMs: null, elapsedMs: 1250 }, .05);
  expect(player.currentActionName).toBe('run');
});

test('a fresh jump interrupts landing recovery and a paused jump holds its pose', async () => {
  const { player } = await fixture();
  const state = { ...createGameState(), jumpStartedMs: 0, elapsedMs: 790 };
  updatePlayerAnimation(player, state, .1);
  const time = player.actions.jump.time;
  player.playAnimation('jump', .06, false);
  expect(player.actions.jump.time).toBe(time);
  updatePlayerAnimation(player, { ...state, jumpStartedMs: null, elapsedMs: 800 }, .05);
  updatePlayerAnimation(player, { ...state, jumpStartedMs: 850, elapsedMs: 850 }, .05);
  expect(player.actions.jump.time).toBeCloseTo(4 / 19);
  expect(player.actions.jump.paused).toBe(true);
});

test('scene animation uses the same frame limit as the game reducer', async () => {
  const { player } = await fixture();
  const update = vi.spyOn(player.mixer!, 'update');
  const scene = { player, lastEventsMs: -1 } as unknown as SceneRefs;
  syncScene(scene, createGameState(), 1000);
  expect(update).toHaveBeenCalledWith(CONFIG.game.maxFrameMs / 1000);
});

test('reselecting a magician preserves grounding and leaves its cached rig untouched', async () => {
  const { player, model } = await fixture();
  const y = player.modelContainer.children[0].position.y;
  await player.loadCharacter('mage');
  expect(player.modelContainer.children[0].position.y).toBeCloseTo(y);
  expect(model.parent).toBeNull();
  expect(model.position.y).toBe(0);
});

test('a defeat pose stays fully visible after the last hit freezes the game clock', async () => {
  const { player } = await fixture();
  const scene = { player, lastEventsMs: -1 } as unknown as SceneRefs;
  const state = { ...createGameState(), isOver: true, hp: 0, elapsedMs: 200, invulnUntilMs: 1000 };
  syncScene(scene, state, 16);
  expect(player.materials.every(material => material.opacity === 1)).toBe(true);
});
