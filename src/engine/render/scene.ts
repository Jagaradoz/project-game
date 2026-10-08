/**
 * Three.js scene assembly for the trail runner.
 *
 * This module only composes: the sky, lighting, ground and scatter each own
 * their own corner of the world (src/engine/render/world/), and everything here is the
 * wiring plus the three pools the reducer drives -- player, enemies, bullets.
 */

import * as THREE from 'three';
import type * as THREE_NS from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { CONFIG } from '@/engine/config';
import type { GameConfig, ShadowQuality, ThreeModule } from '@/engine/types';
import type { CloudOptions } from '@/engine/render/world/clouds';
import type { Palette } from '@/engine/render/world/palette';
import { GOLDEN_FOREST } from '@/engine/render/world/palette';
import { addSky } from '@/engine/render/world/sky';
import { configureRenderer, addLighting, SHADOW_QUALITY, QUALITY_PIXEL_RATIO } from '@/engine/render/world/lighting';
import { collectResources } from '@/engine/render/resources';
import { addGround, trailHalfWidth } from '@/engine/render/world/ground';
import { addScatter } from '@/engine/render/world/scatter';
import { addLandmarks } from '@/engine/render/world/landmarks';
import { createTrailEdge } from '@/engine/render/world/trailEdge';
import { addClouds } from '@/engine/render/world/clouds';
import { addEnemyPool } from '@/engine/render/actors/enemies';
import { addSpellPool } from '@/engine/render/actors/spells';
import { addObstaclePool } from '@/engine/render/actors/obstacles';
import { createDrowningSplash } from '@/engine/render/actors/rivers';
import { createRiverMask } from '@/engine/render/world/riverMask';
import { addPlayer } from '@/engine/render/actors/player';
import { createEffects } from '@/engine/render/actors/effects';
import { createScoreOrbs } from '@/engine/render/actors/scoreOrbs';
import { addShieldBubble } from '@/engine/render/actors/shield';
import { addSporeCloud } from '@/engine/render/actors/spores';

const MOTE_COUNT = 26;
const MOTE_SPAN = 180;
const MOTE_START_Z = 20;

export async function createScene(
  canvas: HTMLCanvasElement,
  config: GameConfig = CONFIG.game,
  palette: Palette = GOLDEN_FOREST,
) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 900);
  camera.position.set(config.camera.x, config.camera.y, config.camera.z);
  camera.lookAt(0, config.camera.lookAtY, config.camera.lookAtZ);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const shadowMapSize = configureRenderer(THREE, renderer, palette, config.quality);

  const sky = addSky(THREE, scene, palette);
  const lighting = addLighting(THREE, scene, palette, shadowMapSize);
  const trailEdge = createTrailEdge(THREE, {
    ...config.trailEdge,
    halfWidth: trailHalfWidth(config),
  });
  const ground = addGround(THREE, scene, config, palette);

  const loader = new GLTFLoader();
  const scatter = await addScatter(THREE, scene, config, palette, loader, {
    span: config.scenery.span,
    seed: config.scenery.seed,
  });
  scatter.setQuality(config.quality ?? 'high');
  const landmarks = await addLandmarks(THREE, scene, config, palette, {
    span: config.scenery.span,
  });
  const motes = addMotes(THREE, scene, palette);
  // `clouds` is not a CONFIG key today; addClouds falls back to its own
  // defaults. Typed as optional so setting it later needs no change here.
  const cloudOptions = (config as GameConfig & { clouds?: CloudOptions }).clouds;
  const clouds = await addClouds(THREE, scene, palette, loader, cloudOptions);
  const player = await addPlayer(THREE, scene, config, palette, loader);
  const enemyPool = await addEnemyPool(THREE, scene, config, palette, loader);
  const bulletPool = addSpellPool(THREE, scene, config);
  const obstaclePool = await addObstaclePool(THREE, scene, config, loader, palette);
  const drowningSplash = createDrowningSplash(THREE, scene, palette);
  const effects = createEffects(THREE, scene, palette);
  const scoreOrbs = createScoreOrbs(THREE, scene, palette, config);
  const sporeCloud = await addSporeCloud(THREE, scene, config, loader);
  const shield = addShieldBubble(THREE, player.group);

  // Short, damped camera impulses give hits and kills physical weight while
  // leaving the authored runner framing untouched between events.
  const cameraFeedback = createCameraFeedback(camera, config);

  // Only the ground. The displacement moves where the dirt ENDS, and nothing
  // else needs to follow it: a grass tuft that sometimes sits on the dirt is
  // what an encroached path edge looks like, and moving the props in lockstep
  // with the edge would read as more machined, not less.
  trailEdge.patchObject(ground.valley.mesh);
  const riverMask = createRiverMask(THREE, ground.valley.mesh, config);

  function resize() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function render() {
    renderer.render(scene, camera);
  }

  /**
   * Drops the shadow budget when the machine cannot keep up. Pose inference is
   * sharing this device, so the game does not get the whole frame to itself.
   */
  function setQuality(level: ShadowQuality) {
    if (level === quality) return;
    const mapSize = SHADOW_QUALITY[level] ?? SHADOW_QUALITY.high;
    const wantsShadows = mapSize > 0;

    renderer.shadowMap.enabled = wantsShadows;
    lighting.sun.castShadow = wantsShadows;
    lighting.sun.shadow.map?.dispose();
    lighting.sun.shadow.map = null;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY_PIXEL_RATIO[level]));

    if (wantsShadows) {
      lighting.sun.shadow.mapSize.set(mapSize, mapSize);
    }

    renderer.shadowMap.needsUpdate = true;
    clouds.setVisible(level !== 'low');
    scatter.setQuality(level);
    quality = level;
  }

  let quality: ShadowQuality = config.quality ?? 'high';

  resize();

  return {
    THREE,
    scene,
    camera,
    renderer,
    palette,
    sky,
    lighting,
    ground,
    markers: ground.markers,
    scatter,
    landmarks,
    motes,
    clouds,
    player,
    enemyPool,
    bulletPool,
    obstaclePool,
    riverMask,
    drowningSplash,
    effects,
    scoreOrbs,
    sporeCloud,
    shield,
    cameraFeedback,
    lastEventsMs: -1,
    trailEdge,
    setQuality,
    get quality() {
      return quality;
    },
    resize,
    render,
    dispose() {
      cameraFeedback.dispose();
      lighting.sun.shadow.dispose();
      enemyPool.dispose();
      bulletPool.dispose();
      scoreOrbs.popups.dispose();
      const resources = new Set<{ dispose(): void }>();
      collectResources(scene, resources);
      player.dispose();
      for (const resource of resources) resource.dispose();
      renderer.dispose();
    },
  };
}

function createCameraFeedback(
  camera: THREE_NS.PerspectiveCamera,
  config: GameConfig,
) {
  const basePosition = new THREE.Vector3(config.camera.x, config.camera.y, config.camera.z);
  const baseQuaternion = camera.quaternion.clone();
  let trauma = 0;
  let phase = 0;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduceMotion = motionQuery.matches;
  const onMotionPreference = (event: MediaQueryListEvent) => {
    reduceMotion = event.matches;
    if (reduceMotion) trauma = 0;
  };
  motionQuery.addEventListener('change', onMotionPreference);

  return {
    hit() {
      if (reduceMotion) return;
      trauma = Math.max(trauma, 1);
    },
    kill(count = 1) {
      if (reduceMotion) return;
      trauma = Math.min(0.55, trauma + 0.16 * count);
    },
    update(dtSec: number) {
      phase += dtSec * 48;
      trauma = Math.max(0, trauma - dtSec * 3.8);
      const strength = trauma * trauma;
      camera.position.copy(basePosition);
      camera.quaternion.copy(baseQuaternion);
      if (strength <= 0) return;
      camera.position.x += Math.sin(phase * 1.7) * 0.16 * strength;
      camera.position.y += Math.cos(phase * 2.3) * 0.1 * strength;
      camera.rotation.z += Math.sin(phase) * 0.012 * strength;
    },
    dispose() {
      motionQuery.removeEventListener('change', onMotionPreference);

    },
  };
}

/**
 * Dust motes hanging in the sunbeams. Same recycling contract as every other
 * scrolling layer.
 */
function addMotes(THREE: ThreeModule, scene: THREE_NS.Scene, palette: Palette) {
  const geometry = new THREE.OctahedronGeometry(0.07, 0);
  const material = new THREE.MeshBasicMaterial({ color: palette.accents.mote, fog: true });
  const startZ = MOTE_START_Z - MOTE_SPAN;
  const items = [];

  for (let index = 0; index < MOTE_COUNT; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const mesh = new THREE.Mesh(geometry, material);
    const initialX = side * (1.5 + ((index * 13) % 7) * 0.8);
    const initialY = 1.4 + ((index * 7) % 5) * 0.7;
    const baseZ = startZ + index * (MOTE_SPAN / MOTE_COUNT);

    mesh.position.set(initialX, initialY, baseZ);
    scene.add(mesh);
    items.push({ mesh, baseZ, initialX, initialY, phase: index * 0.7 });
  }

  return {
    items,
    span: MOTE_SPAN,
    startZ,
  };
}
