/**
 * Three.js scene assembly for the trail runner.
 *
 * This module only composes: the sky, lighting, ground and scatter each own
 * their own corner of the world (src/game/world/), and everything here is the
 * wiring plus the three pools the reducer drives -- player, enemies, bullets.
 */

import { CONFIG, THREE_MODULE_URL, GLTF_LOADER_URL } from '../config.js?v=1.9.0';
import { GOLDEN_FOREST } from './world/palette.js?v=1.9.0';
import { addSky } from './world/sky.js?v=1.9.0';
import { configureRenderer, addLighting, SHADOW_QUALITY } from './world/lighting.js?v=1.9.0';
import { addGround, TRAIL_Y } from './world/ground.js?v=1.9.0';
import { addScatter } from './world/scatter.js?v=1.9.0';
import { resolveBiome, blendPalettes, activeScatterSet } from './world/biomes.js?v=1.9.0';
import { addEnemyPool } from './actors/enemies.js?v=1.9.0';
import { addPlayer } from './actors/player.js?v=1.9.0';

const MOTE_COUNT = 26;
const MOTE_SPAN = 180;
const MOTE_START_Z = 20;

/** How often the biome crossfade is recomputed. Colour drifts far too slowly to need every frame. */
const BIOME_UPDATE_MS = 120;

export async function createScene(canvas, config = CONFIG.game, palette = GOLDEN_FOREST) {
  const THREE = await import(/* @vite-ignore */ THREE_MODULE_URL);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 900);
  camera.position.set(config.camera.x, config.camera.y, config.camera.z);
  camera.lookAt(0, config.camera.lookAtY, config.camera.lookAtZ);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const shadowMapSize = configureRenderer(THREE, renderer, palette, config.quality);

  const sky = addSky(THREE, scene, palette);
  const lighting = addLighting(THREE, scene, palette, shadowMapSize);
  const ground = addGround(THREE, scene, config, palette);

  const loader = await createLoader();
  const scatter = await addScatter(THREE, scene, config, palette, loader, {
    span: config.scenery.span,
    seed: config.scenery.seed,
  });
  const motes = addMotes(THREE, scene, palette);
  const player = await addPlayer(THREE, scene, config, palette, loader);
  const enemyPool = await addEnemyPool(THREE, scene, config, palette, loader);
  const bulletPool = addBulletPool(THREE, scene, config, palette);

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

  // Reused every update so the crossfade allocates nothing per frame.
  const blended = structuredClone(palette);
  let lastBiomeMs = -Infinity;

  /**
   * Drives the biome crossfade from distance travelled. Cheap enough to call
   * every frame; it throttles itself.
   */
  function applyBiome(distance, elapsedMs) {
    if (elapsedMs - lastBiomeMs < BIOME_UPDATE_MS) return;
    lastBiomeMs = elapsedMs;

    const transition = resolveBiome(distance);
    const next = blendPalettes(transition.from, transition.to, transition.t, blended);

    sky.applyPalette(next);
    lighting.applyPalette(next, renderer);
    ground.applyPalette(next);
    motes.applyPalette(next);
    scatter.applyPalette(next);
    scatter.setActive(activeScatterSet(transition));
  }

  /**
   * Drops the shadow budget when the machine cannot keep up. Pose inference is
   * sharing this device, so the game does not get the whole frame to itself.
   */
  function setQuality(level) {
    const mapSize = SHADOW_QUALITY[level] ?? SHADOW_QUALITY.high;
    const wantsShadows = mapSize > 0;

    renderer.shadowMap.enabled = wantsShadows;
    lighting.sun.castShadow = wantsShadows;

    if (wantsShadows) {
      lighting.sun.shadow.mapSize.set(mapSize, mapSize);
      // The existing render target is the old size; drop it so it is rebuilt.
      lighting.sun.shadow.map?.dispose();
      lighting.sun.shadow.map = null;
    }

    renderer.shadowMap.needsUpdate = true;
    quality = level;
  }

  let quality = config.quality ?? 'high';

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
    motes,
    player,
    enemyPool,
    bulletPool,
    applyBiome,
    setQuality,
    get quality() {
      return quality;
    },
    resize,
    render,
  };
}

/** The addons path is the documented one; the bare specifier is the import-map fallback. */
async function createLoader() {
  try {
    const module = await import(/* @vite-ignore */ GLTF_LOADER_URL);
    return new module.GLTFLoader();
  } catch (error) {
    console.warn('GLTFLoader: CDN import failed, trying the import map', error);
  }

  try {
    const module = await import(/* @vite-ignore */ 'three/addons/loaders/GLTFLoader.js');
    return new module.GLTFLoader();
  } catch (error) {
    console.error('GLTFLoader unavailable; falling back to untextured primitives', error);
    return null;
  }
}

/**
 * Dust motes hanging in the sunbeams. Same recycling contract as every other
 * scrolling layer.
 */
function addMotes(THREE, scene, palette) {
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
    applyPalette(next) {
      material.color.set(next.accents.mote);
    },
  };
}

/**
 * Projectiles. The default is a glowing bolt; a character that carries a weapon
 * swaps its own blade in via setProjectile, so what the player throws always
 * matches who they are.
 */
function addBulletPool(THREE, scene, config, palette) {
  const boltGeometry = new THREE.BoxGeometry(
    config.bulletRadius * 2,
    config.bulletRadius * 2,
    config.bulletRadius * 8,
  );
  const boltMaterial = new THREE.MeshStandardMaterial({
    color: palette.accents.bullet,
    emissive: new THREE.Color(palette.accents.bullet).multiplyScalar(0.4),
    roughness: 0.4,
  });

  const items = Array.from({ length: config.bulletPoolSize }, () => {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(boltGeometry, boltMaterial);
    mesh.castShadow = true;
    pivot.add(mesh);
    pivot.position.y = TRAIL_Y + config.playerRadius;
    pivot.visible = false;
    scene.add(pivot);
    return { mesh: pivot, blade: mesh };
  });

  return {
    items,
    setProjectile(source) {
      for (const entry of items) {
        entry.blade.geometry = source?.geometry ?? boltGeometry;
        entry.blade.material = source?.material ?? boltMaterial;
        // A weapon model points along its own axis and sits at hand height;
        // laid flat and nose-forward it reads as a thrown blade.
        entry.blade.rotation.set(source ? -Math.PI / 2 : 0, 0, 0);
        entry.blade.position.set(0, 0, source ? config.bulletRadius * 2 : 0);
        entry.blade.scale.setScalar(source ? 1.1 : 1);
      }
    },
  };
}
