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

import { SKELETON_UTILS_URL } from '../../config.js?v=1.9.0';
import { TRAIL_Y } from '../world/ground.js?v=1.9.0';

export async function addEnemyPool(THREE, scene, config, palette, loader) {
  const rigged = await buildRiggedPool(THREE, scene, config, loader);
  return rigged ?? buildFallbackPool(THREE, scene, config, palette);
}

async function buildRiggedPool(THREE, scene, config, loader) {
  const definition = config.enemy;
  if (!loader || !definition?.path) return null;

  let cloneSkeleton = null;
  try {
    const module = await import(/* @vite-ignore */ SKELETON_UTILS_URL);
    cloneSkeleton = module.clone;
  } catch (error) {
    console.warn('SkeletonUtils unavailable; enemies fall back to primitives', error);
    return null;
  }

  let gltf = null;
  try {
    gltf = await loader.loadAsync(definition.path);
  } catch (error) {
    console.warn(`Could not load enemy model ${definition.path}`, error);
    return null;
  }

  const clipFor = buildClipLookup(gltf.animations, definition.animations);
  const items = Array.from({ length: config.enemyPoolSize }, () =>
    buildEnemy(THREE, scene, gltf, definition, clipFor, cloneSkeleton),
  );

  return {
    items,
    isRigged: true,
    animatedCount: definition.animatedCount ?? 8,
    animateBeyondZ: definition.animateBeyondZ ?? -70,
    applyPalette() {
      // Enemy colouring comes from the model's own atlas; biome palettes leave it alone.
    },
  };
}

function buildEnemy(THREE, scene, gltf, definition, clipFor, cloneSkeleton) {
  const group = new THREE.Group();
  const model = cloneSkeleton(gltf.scene);

  model.traverse((child) => {
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

  return { group, mixer, action };
}

function buildClipLookup(clips, mapping = {}) {
  const byLowerName = new Map(clips.map((clip) => [clip.name.toLowerCase(), clip]));
  const lookup = {};

  for (const [logicalName, clipName] of Object.entries(mapping)) {
    const clip = clips.find((entry) => entry.name === clipName) || byLowerName.get(clipName.toLowerCase());
    if (clip) lookup[logicalName] = clip;
  }

  return lookup;
}

/** Faceted stand-in for when the rigged model is unavailable. */
function buildFallbackPool(THREE, scene, config, palette) {
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

    group.position.y = TRAIL_Y;
    group.visible = false;
    scene.add(group);
    return { group, mixer: null, action: null, spin: core };
  });

  return {
    items,
    isRigged: false,
    animatedCount: 0,
    animateBeyondZ: 0,
    applyPalette(next) {
      coreMat.color.set(next.accents.enemy);
      ringMat.color.set(next.accents.enemyTrim);
      ringMat.emissive.set(next.accents.enemyTrim).multiplyScalar(0.25);
    },
  };
}
