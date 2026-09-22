/**
 * Rigged skeleton enemies.
 *
 * A crowd of skinned meshes is only affordable if most of them are not actually
 * being skinned: every pool slot gets its own mixer, but only the handful
 * nearest the player are stepped each frame. The rest hold whatever pose they
 * were last left in, which is indistinguishable at distance and through fog.
 *
 * Falls back to the previous faceted shape if the model or SkeletonUtils cannot
 * be loaded, so the game is always playable.
 */

import type * as THREE_NS from 'three';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { Palette } from '@/engine/render/world/palette';
import type { GameConfig, ThreeModule } from '@/engine/types';

/** One pooled enemy slot. Corpses are the same shape plus decay bookkeeping. */
export interface EnemySlot {
  group: THREE_NS.Group;
  mixer: THREE_NS.AnimationMixer | null;
  action: THREE_NS.AnimationAction | null;
  /** Ground-level threat marker. It keeps pale enemies readable against fog and dirt. */
  aura?: THREE_NS.Mesh;
  spin?: THREE_NS.Object3D;
  elapsed?: number;
  sink?: number;
}

type ClipLookup = Record<string, THREE_NS.AnimationClip>;

/** The enemy definition on CONFIG.game.enemy. */
interface EnemyDef {
  path: string | null;
  scale?: number;
  rotationY?: number;
  animations?: Record<string, string>;
  corpseCount?: number;
  animatedCount?: number;
  animateBeyondZ?: number;
}

export interface EnemyPool {
  items: EnemySlot[];
  corpses: EnemySlot[];
  isRigged: boolean;
  animatedCount: number;
  animateBeyondZ: number;
  spawnDeath(x?: number, z?: number): EnemySlot | void;
  updateCorpses(dtSec?: number, worldSpeed?: number): void;
  applyPalette(next: Palette): void;
}

type CloneSkeleton = (source: THREE_NS.Object3D) => THREE_NS.Object3D;

import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { TRAIL_Y } from '@/engine/render/world/ground';

/** Seconds a body lies where it fell before it starts sinking away. */
const CORPSE_HOLD_SEC = 2.2;
const CORPSE_SINK_SEC = 1.1;
const CORPSE_SINK_DEPTH = 2.2;
const CORPSE_DESPAWN_Z = 26;

function buildThreatAura(
  THREE: ThreeModule,
  color: string,
  radius: number,
  shared?: { geometry: THREE_NS.RingGeometry; material: THREE_NS.MeshBasicMaterial },
): THREE_NS.Mesh {
  const geometry = shared?.geometry ?? new THREE.RingGeometry(radius * 0.72, radius, 24);
  const material = shared?.material ?? new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide,
    });
  const aura = new THREE.Mesh(geometry, material);
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.035;
  aura.renderOrder = 2;
  return aura;
}

export async function addEnemyPool(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
  loader: GLTFLoader | null,
): Promise<EnemyPool> {
  const rigged = await buildRiggedPool(THREE, scene, config, palette, loader);
  return rigged ?? buildFallbackPool(THREE, scene, config, palette);
}

async function buildRiggedPool(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
  loader: GLTFLoader | null,
): Promise<EnemyPool | null> {
  const definition = config.enemy as unknown as EnemyDef;
  if (!loader || !definition?.path) return null;

  let gltf: GLTF | null = null;
  try {
    gltf = await loader.loadAsync(definition.path);
  } catch (error) {
    console.warn(`Could not load enemy model ${definition.path}`, error);
    return null;
  }

  const loaded: GLTF = gltf;
  const clipFor = buildClipLookup(loaded.animations, definition.animations);
  const auraTemplate = createAuraTemplate(THREE, palette.accents.enemyTrim, config.enemyRadius * 1.65);
  const items = Array.from({ length: config.enemyPoolSize }, () =>
    buildEnemy(THREE, scene, loaded, definition, clipFor, cloneSkeleton, palette, config.enemyRadius, auraTemplate),
  );

  // A separate, small pool. Reusing a live slot would not work: slots are keyed
  // to the reducer's enemy array, which reshuffles the moment one dies.
  const corpses = Array.from({ length: definition.corpseCount ?? 5 }, () =>
    buildCorpse(THREE, scene, loaded, definition, clipFor, cloneSkeleton, palette, config.enemyRadius, auraTemplate),
  );
  let nextCorpse = 0;

  return {
    items,
    corpses,
    isRigged: true,
    animatedCount: definition.animatedCount ?? 8,
    animateBeyondZ: definition.animateBeyondZ ?? -70,

    /** Stages a death animation where an enemy was killed. */
    spawnDeath(x = 0, z = 0) {
      const corpse = corpses[nextCorpse]!;
      nextCorpse = (nextCorpse + 1) % corpses.length;

      corpse.group.position.set(x, TRAIL_Y, z);
      corpse.group.visible = true;
      corpse.elapsed = 0;
      corpse.sink = 0;

      if (corpse.action) {
        corpse.action.reset();
        corpse.action.setLoop(THREE.LoopOnce, 1);
        corpse.action.clampWhenFinished = true;
        corpse.action.play();
      }
      return corpse;
    },

    /**
     * Corpses scroll with the world, hold their final pose, then sink into the
     * trail. Sinking rather than fading keeps them opaque: a transparent skinned
     * mesh would need its own material clone and would sort badly against the
     * scenery behind it.
     */
    updateCorpses(dtSec = 0, worldSpeed = 0) {
      for (const corpse of corpses) {
        if (!corpse.group.visible) continue;

        corpse.elapsed = (corpse.elapsed ?? 0) + dtSec;
        corpse.group.position.z += worldSpeed * dtSec;
        corpse.mixer?.update(dtSec);

        if (corpse.elapsed > CORPSE_HOLD_SEC) {
          corpse.sink = (corpse.sink ?? 0) + dtSec / CORPSE_SINK_SEC;
          corpse.group.position.y = TRAIL_Y - corpse.sink * CORPSE_SINK_DEPTH;
        }

        if ((corpse.sink ?? 0) >= 1 || corpse.group.position.z > CORPSE_DESPAWN_Z) {
          corpse.group.visible = false;
        }
      }
    },

    applyPalette(next: Palette) {
      for (const slot of [...items, ...corpses]) {
        const material = slot.aura?.material as THREE_NS.MeshBasicMaterial | undefined;
        material?.color.set(next.accents.enemyTrim);
      }
    },
  };
}

function buildCorpse(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  gltf: GLTF,
  definition: EnemyDef,
  clipFor: ClipLookup,
  cloneSkeleton: CloneSkeleton,
  palette: Palette,
  radius: number,
  auraTemplate: { geometry: THREE_NS.RingGeometry; material: THREE_NS.MeshBasicMaterial },
): EnemySlot {
  const corpse = buildEnemy(THREE, scene, gltf, definition, clipFor, cloneSkeleton, palette, radius, auraTemplate);
  const deathClip = clipFor.death ?? clipFor.run;

  corpse.action?.stop();
  corpse.action = deathClip && corpse.mixer ? corpse.mixer.clipAction(deathClip) : null;
  corpse.elapsed = 0;
  corpse.sink = 0;
  return corpse;
}

function buildEnemy(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  gltf: GLTF,
  definition: EnemyDef,
  clipFor: ClipLookup,
  cloneSkeleton: CloneSkeleton,
  palette: Palette,
  radius: number,
  auraTemplate: { geometry: THREE_NS.RingGeometry; material: THREE_NS.MeshBasicMaterial },
): EnemySlot {
  const group = new THREE.Group();
  const model = cloneSkeleton(gltf.scene);

  model.traverse((node) => {
    const child = node as THREE_NS.Mesh & { isSkinnedMesh?: boolean };
    if (!child.isMesh && !child.isSkinnedMesh) return;
    child.castShadow = true;
    child.receiveShadow = false;
    // Skinned bounds are computed from the bind pose, which sits below the
    // animated silhouette; culling per mesh would pop limbs in and out.
    child.frustumCulled = false;
  });

  const scale = definition.scale ?? 1;
  model.scale.setScalar(scale);
  const box = new THREE.Box3().setFromObject(model);
  model.position.y = -box.min.y;
  model.rotation.y = definition.rotationY ?? 0;
  group.add(model);

  const aura = buildThreatAura(THREE, palette.accents.enemyTrim, radius * 1.65, auraTemplate);
  group.add(aura);

  const mixer = new THREE.AnimationMixer(model);
  const runClip = clipFor.run ?? clipFor.walk;
  const action = runClip ? mixer.clipAction(runClip) : null;
  if (action) {
    action.setLoop(THREE.LoopRepeat, Infinity);
    // Desynchronised so a row of skeletons does not march in lockstep.
    action.time = Math.random() * (runClip.duration || 1);
    action.play();
  }

  group.position.y = TRAIL_Y;
  group.visible = false;
  scene.add(group);

  return { group, mixer, action, aura };
}

function buildClipLookup(
  clips: THREE_NS.AnimationClip[],
  mapping: Record<string, string> = {},
): ClipLookup {
  const byLowerName = new Map(clips.map((clip) => [clip.name.toLowerCase(), clip]));
  const lookup: ClipLookup = {};

  for (const [logicalName, clipName] of Object.entries(mapping)) {
    const clip = clips.find((entry) => entry.name === clipName) || byLowerName.get(clipName.toLowerCase());
    if (clip) lookup[logicalName] = clip;
  }

  return lookup;
}

/** Faceted stand-in for when the rigged model is unavailable. */
function buildFallbackPool(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
): EnemyPool {
  const auraTemplate = createAuraTemplate(THREE, palette.accents.enemyTrim, config.enemyRadius * 1.65);
  const coreGeo = new THREE.OctahedronGeometry(config.enemyRadius * 0.85, 0);
  const coreMat = new THREE.MeshStandardMaterial({
    color: palette.accents.enemy,
    roughness: 0.45,
    metalness: 0.1,
    flatShading: true,
  });

  const ringGeo = new THREE.TorusGeometry(config.enemyRadius * 1.1, 0.05, 5, 8);
  const ringMat = new THREE.MeshStandardMaterial({
    color: palette.accents.enemyTrim,
    roughness: 0.5,
    emissive: new THREE.Color(palette.accents.enemyTrim).multiplyScalar(0.25),
  });

  const items = Array.from({ length: config.enemyPoolSize }, () => {
    const group = new THREE.Group();
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.castShadow = true;
    core.position.y = config.enemyRadius;
    group.add(core);

    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 3;
    ring.position.y = config.enemyRadius;
    group.add(ring);

    const aura = buildThreatAura(THREE, palette.accents.enemyTrim, config.enemyRadius * 1.65, auraTemplate);
    group.add(aura);

    group.position.y = TRAIL_Y;
    group.visible = false;
    scene.add(group);
    return { group, mixer: null, action: null, spin: core, aura };
  });

  return {
    items,
    corpses: [] as EnemySlot[],
    isRigged: false,
    animatedCount: 0,
    animateBeyondZ: 0,
    spawnDeath() {},
    updateCorpses() {},
    applyPalette(next: Palette) {
      coreMat.color.set(next.accents.enemy);
      ringMat.color.set(next.accents.enemyTrim);
      ringMat.emissive.set(next.accents.enemyTrim).multiplyScalar(0.25);
      for (const slot of items) {
        const material = slot.aura?.material as THREE_NS.MeshBasicMaterial | undefined;
        material?.color.set(next.accents.enemyTrim);
      }
    },
  };
}

function createAuraTemplate(THREE: ThreeModule, color: string, radius: number) {
  const sample = buildThreatAura(THREE, color, radius);
  return {
    geometry: sample.geometry as THREE_NS.RingGeometry,
    material: sample.material as THREE_NS.MeshBasicMaterial,
  };
}
