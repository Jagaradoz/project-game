import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from '@/engine/config';
import { laneToX } from '@/engine/core/state';
import { addPlayer } from '@/engine/render/actors/player';
import { addSpellPool } from '@/engine/render/actors/spells';
import { addShieldBubble } from '@/engine/render/actors/shield';
import { updatePlayerAnimation } from '@/engine/render/sync';
import { GOLDEN_FOREST } from '@/engine/render/world/palette';
import { collectResources } from '@/engine/render/resources';
import type { GameState, ShadowQuality } from '@/engine/types';

/** A single game character on three static lanes, without loading enemy/world pools. */
export async function createTestScene(canvas: HTMLCanvasElement, isCancelled = () => false) {
  const demoConfig = { ...CONFIG.game, laneWidth: 1.1 };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f6ead6');
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa68158, 2.5));
  const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(3, 7, 5); scene.add(key);
  // The camera sees the character's face and its projectiles coming toward it.
  const camera = new THREE.OrthographicCamera(-1.86, 1.86, 3.3, -3.3, .1, 80);
  camera.position.set(0, 4.5, -10); camera.lookAt(0, 2.7, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 20), new THREE.MeshStandardMaterial({ color: '#dec7a4', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -.02, -3); scene.add(floor);
  for (const x of [-.55, .55]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(.04, .02, 16), new THREE.MeshBasicMaterial({ color: '#a38460' }));
    line.position.set(x, 0, -3); scene.add(line);
  }
  const player = await addPlayer(THREE, scene, demoConfig, GOLDEN_FOREST, new GLTFLoader());
  // Strict Mode can replace the runtime while this model loads. Acquire WebGL
  // only after the cancellation check, so a late disposal cannot lose its context.
  if (isCancelled()) {
    player.dispose();
    const resources = new Set<{ dispose(): void }>(); collectResources(scene, resources);
    for (const resource of resources) resource.dispose();
    throw new Error('Test scene cancelled');
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  player.modelContainer.rotation.y = Math.PI / 12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const shield = addShieldBubble(THREE, player.group);
  const bulletPool = addSpellPool(THREE, scene, demoConfig);
  let disposed = false;
  let quality: ShadowQuality = 'medium';
  function resize() {
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.left = -3.3 * width / height; camera.right = 3.3 * width / height;
    camera.updateProjectionMatrix();
  }
  return {
    player, bulletPool,
    get quality() { return quality; },
    setQuality(value: ShadowQuality) { quality = value; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, value === 'low' ? 1 : 1.5)); resize(); },
    resize,
    render(state: GameState, dtMs: number, hasTracking = true) {
      if (disposed) return;
      const dt = Math.min(dtMs, CONFIG.game.maxFrameMs) / 1000;
      const blend = 1 - Math.exp(-dt * 18);
      // Front view reverses world X; mirror the demo lanes so LEFT stays screen-left.
      player.group.position.x += (laneToX(2 - state.lane, demoConfig) - player.group.position.x) * blend;
      player.group.position.y = hasTracking ? state.jumpHeight : 0;
      if (!hasTracking) {
        player.lastJumpStartedMs = null;
        player.playAnimation('idle', .1, true);
      }
      updatePlayerAnimation(player, hasTracking ? state : { ...state, speed: 0, justFired: false, jumpStartedMs: null }, dt);
      shield.update(state.isShielding, state.elapsedMs, dt);
      bulletPool.sync({ ...state, lane: 2 - state.lane,
        bullets: state.bullets.map(bullet => ({ ...bullet, lane: 2 - bullet.lane })) }, dt, player.characterId);
      renderer.render(scene, camera);
    },
    dispose() {
      if (disposed) return; disposed = true;
      player.dispose(); bulletPool.dispose();
      const resources = new Set<{ dispose(): void }>(); collectResources(scene, resources);
      for (const resource of resources) resource.dispose();
      renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
