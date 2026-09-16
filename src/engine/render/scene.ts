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
import type { ProjectileSource } from '@/engine/render/actors/player';
import { GOLDEN_FOREST } from '@/engine/render/world/palette';
import { addSky } from '@/engine/render/world/sky';
import { configureRenderer, addLighting, SHADOW_QUALITY } from '@/engine/render/world/lighting';
import { addGround, trailHalfWidth, TRAIL_Y } from '@/engine/render/world/ground';
import { addScatter } from '@/engine/render/world/scatter';
import { createTrailEdge } from '@/engine/render/world/trailEdge';
import { addClouds } from '@/engine/render/world/clouds';
import { BIOMES, resolveBiome, blendPalettes, activeScatterSet } from '@/engine/render/world/biomes';
import { addEnemyPool } from '@/engine/render/actors/enemies';
import { addPlayer } from '@/engine/render/actors/player';
import { createEffects } from '@/engine/render/actors/effects';

const MOTE_COUNT = 26;
const MOTE_SPAN = 180;
const MOTE_START_Z = 20;

/** How often the biome crossfade is recomputed. Colour drifts far too slowly to need every frame. */
const BIOME_UPDATE_MS = 120;
/** How long a hand-picked biome takes to fade in, so the selector never snaps. */
const BIOME_MANUAL_BLEND_MS = 1400;

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
  const motes = addMotes(THREE, scene, palette);
  // `clouds` is not a CONFIG key today; addClouds falls back to its own
  // defaults. Typed as optional so setting it later needs no change here.
  const cloudOptions = (config as GameConfig & { clouds?: CloudOptions }).clouds;
  const clouds = addClouds(THREE, scene, palette, cloudOptions);
  const player = await addPlayer(THREE, scene, config, palette, loader);
  const enemyPool = await addEnemyPool(THREE, scene, config, palette, loader);
  const bulletPool = addBulletPool(THREE, scene, config, palette);
  const effects = createEffects(THREE, scene, palette);

  // Only the ground. The displacement moves where the dirt ENDS, and nothing
  // else needs to follow it: a grass tuft that sometimes sits on the dirt is
  // what an encroached path edge looks like, and moving the props in lockstep
  // with the edge would read as more machined, not less.
  trailEdge.patchObject(ground.valley.mesh);

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
  const autoScratch = structuredClone(palette);
  let overrideFrom = structuredClone(palette);
  let lastBiomeMs = -Infinity;
  let override: Palette | null = null;
  let overrideT = 1;

  /**
   * Pins the world to one biome, or returns to distance-driven cycling when
   * given null. Either way it eases rather than snapping, from wherever the
   * palette happens to be at the moment of the switch.
   */
  function setBiomeOverride(biomeId: string | null) {
    const next = biomeId ? BIOMES.find((biome) => biome.id === biomeId) ?? null : null;
    if ((next?.id ?? null) === (override?.id ?? null)) return;

    overrideFrom = structuredClone(blended);
    override = next;
    overrideT = 0;
    // Restart resets game.elapsedMs to 0; without this, applyBiome thinks the
    // last update is still in the future and never paints the new palette.
    lastBiomeMs = -Infinity;
  }

  /**
   * Drives the biome crossfade, from distance travelled or from the selector.
   * Cheap enough to call every frame; it throttles itself.
   */
  function applyBiome(distance: number, elapsedMs: number) {
    const sinceMs = elapsedMs >= lastBiomeMs ? elapsedMs - lastBiomeMs : BIOME_UPDATE_MS;
    if (sinceMs < BIOME_UPDATE_MS) return;
    lastBiomeMs = elapsedMs;

    const transition = resolveBiome(distance);
    const autoPalette = blendPalettes(transition.from, transition.to, transition.t, autoScratch);
    const autoSet = activeScatterSet(transition);

    let next = autoPalette;
    let set = autoSet;

    if (override || overrideT < 1) {
      overrideT = Math.min(1, overrideT + sinceMs / BIOME_MANUAL_BLEND_MS);
      const target = override ?? autoPalette;
      const eased = overrideT * overrideT * (3 - 2 * overrideT);
      next = blendPalettes(overrideFrom, target, eased, blended);
      set = overrideT < 0.5 ? set : (override?.scatterSet ?? autoSet);
    }

    sky.applyPalette(next);
    lighting.applyPalette(next, renderer);
    ground.applyPalette(next);
    motes.applyPalette(next);
    clouds.applyPalette(next);
    scatter.applyPalette(next);
    effects.applyPalette(next);
    scatter.setActive(set);
  }

  /**
   * Drops the shadow budget when the machine cannot keep up. Pose inference is
   * sharing this device, so the game does not get the whole frame to itself.
   */
  function setQuality(level: ShadowQuality) {
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
    clouds.setVisible(level !== 'low');
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
    motes,
    clouds,
    player,
    enemyPool,
    bulletPool,
    effects,
    trailEdge,
    applyBiome,
    setBiomeOverride,
    setQuality,
    get quality() {
      return quality;
    },
    resize,
    render,
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
    applyPalette(next: Palette) {
      material.color.set(next.accents.mote);
    },
  };
}

/**
 * Projectiles. The default is a glowing bolt; a character that carries a weapon
 * swaps its own blade in via setProjectile, so what the player throws always
 * matches who they are.
 */
function addBulletPool(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
) {
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
    // Widened deliberately: the blade's geometry and material are swapped for
    // the character's own weapon whenever one is available.
    const mesh: THREE_NS.Mesh = new THREE.Mesh(boltGeometry, boltMaterial);
    mesh.castShadow = true;
    pivot.add(mesh);
    pivot.position.y = TRAIL_Y + config.playerRadius;
    pivot.visible = false;
    scene.add(pivot);
    return { mesh: pivot, blade: mesh };
  });

  return {
    items,
    setProjectile(source: ProjectileSource | null | undefined) {
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
