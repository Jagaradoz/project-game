/**
 * Poison spore clouds and the hands-on-hips shield bubble.
 *
 * The cloud is built from Blender-authored assets (tools/spore_assets.py, exported by
 * tools/export_trail_obstacles.py): three cumulus puff shapes, each one InstancedMesh
 * tinted per instance and drawn as soft mist (sporeMist.ts), over a mottled tint on the
 * ground, with glowing spores drifting up through it. The reducer never has more than
 * one cloud alive, so one slot is the whole pool.
 *
 * Puffs crowd the trail edges and ride high over the lanes, so the player can still
 * read the road (and whatever is on it) through the cloud.
 *
 * The bubble is parented to the player group, so it follows the lane lerp and
 * the jump arc for free. It is NOT in `player.materials`, which the grace-window
 * blink overwrites every frame.
 */

import type * as T from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GameConfig, SporeCloud, ThreeModule } from '@/engine/types';
import { trailHalfWidth, TRAIL_Y } from '@/engine/render/world/ground';
import { createRng, range } from '@/engine/render/world/rng';
import CLOUD_LAYOUT from '@/engine/render/world/cloud-layout.json';
import { addFadeAttribute, createMistGround, createMistMaterial, createSporeMotes } from '@/engine/render/actors/sporeMist';

/**
 * The layout lives in cloud-layout.json so tools/build_clouds_catalog.py can rebuild the exact same
 * cloud in Blender. Notes on the values:
 *  - puffColors are violet with one muted sage: saturated green puffs over the brown trail read as
 *    olive grey, and the bright lime belongs to the spore motes instead.
 *  - over the lanes (|x| < laneClearX) puffs stay at least laneClearY up, so the road stays readable.
 *  - edgeFade: puffs fade in over this many units at each end, so the cloud has no hard wall; they
 *    also shrink to puffEdgeMinScale there, never to specks.
 *  - mist*: how sporeMist.ts shades the puffs (see there).
 */
const {
  seed: SEED, puffAssets: PUFF_ASSETS, puffsPerShape: PUFFS_PER_SHAPE,
  puffColors: PUFF_COLORS, puffMinY: PUFF_MIN_Y, puffMaxY: PUFF_MAX_Y, laneClearX: LANE_CLEAR_X,
  laneClearY: LANE_CLEAR_Y, puffMinSize: PUFF_MIN_SIZE, puffMaxSize: PUFF_MAX_SIZE, puffBob: PUFF_BOB,
  puffSpin: PUFF_SPIN, puffOpacity: PUFF_OPACITY, puffEdgeMinScale: PUFF_EDGE_MIN_SCALE,
  mistShade: MIST_SHADE, mistLift: MIST_LIFT, mistRimGlow: MIST_RIM_GLOW, mistNearFade: MIST_NEAR_FADE,
  moteCount: MOTE_COUNT, moteColor: MOTE_COLOR, moteSize: MOTE_SIZE,
  groundColor: GROUND_COLOR, groundOpacity: GROUND_OPACITY, edgeFade: EDGE_FADE,
} = CLOUD_LAYOUT.spore;

const SHIELD_COLOR = '#7fe3ff';
const SHIELD_RADIUS = 1.6;
const SHIELD_CENTRE_Y = 1.7;
const SHIELD_OPACITY = 0.28;
const SHIELD_FADE_PER_SEC = 6;

/** First mesh in a loaded asset; the spore assets are each a single mesh. */
function firstMesh(root: T.Object3D): T.Mesh {
  let found: T.Mesh | undefined;
  root.traverse(node => { if (!found && (node as T.Mesh).isMesh) found = node as T.Mesh; });
  if (!found) throw new Error('[spores] asset has no mesh');
  return found;
}

export async function addSporeCloud(THREE: ThreeModule, scene: T.Scene, config: GameConfig, loader: GLTFLoader) {
  const load = (name: string) => loader.loadAsync(`/assets/models/environment/${name}.glb`).then(gltf => gltf.scene);
  const puffSources = await Promise.all(PUFF_ASSETS.map(load));

  const halfWidth = trailHalfWidth(config);
  const rng = createRng(SEED);
  const puffs = Array.from({ length: PUFFS_PER_SHAPE * PUFF_ASSETS.length }, () => {
    const x = range(rng, -halfWidth, halfWidth);
    const low = Math.abs(x) < LANE_CLEAR_X ? LANE_CLEAR_Y : PUFF_MIN_Y;
    return { x, y: range(rng, low, PUFF_MAX_Y), t: rng(), size: range(rng, PUFF_MIN_SIZE, PUFF_MAX_SIZE),
      yaw: rng() * Math.PI * 2, phase: rng() * Math.PI * 2 };
  });

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const mistMaterial = createMistMaterial(THREE, { opacity: PUFF_OPACITY, shade: MIST_SHADE, lift: MIST_LIFT,
    rimGlow: MIST_RIM_GLOW, nearFade: MIST_NEAR_FADE, groundY: TRAIL_Y });
  const color = new THREE.Color();
  const meshes = puffSources.map(source => {
    const mesh = new THREE.InstancedMesh(firstMesh(source).geometry.clone(), mistMaterial, PUFFS_PER_SHAPE);
    mesh.frustumCulled = false;
    for (let i = 0; i < PUFFS_PER_SHAPE; i++) mesh.setColorAt(i, color.set(PUFF_COLORS[(i * 7) % PUFF_COLORS.length]!));
    group.add(mesh);
    return { mesh, fade: addFadeAttribute(THREE, mesh) };
  });

  const ground = createMistGround(THREE, halfWidth * 2, GROUND_COLOR, GROUND_OPACITY);
  ground.mesh.position.y = TRAIL_Y + 0.05;
  group.add(ground.mesh);

  const motes = createSporeMotes(THREE, rng, { count: MOTE_COUNT, color: MOTE_COLOR, size: MOTE_SIZE,
    halfWidth, minY: TRAIL_Y + PUFF_MIN_Y, maxY: TRAIL_Y + PUFF_MAX_Y });
  group.add(motes.points);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  function sync(clouds: SporeCloud[], elapsedMs: number) {
    const cloud = clouds[0];
    group.visible = Boolean(cloud);
    if (!cloud) return;
    group.position.z = cloud.z;
    ground.fit(cloud.length, EDGE_FADE);
    const seconds = elapsedMs / 1000;
    motes.update(seconds, cloud.length);
    puffs.forEach((puff, i) => {
      const z = -puff.t * cloud.length;
      const edge = Math.max(0, Math.min(1, -z / EDGE_FADE, (cloud.length + z) / EDGE_FADE));
      const breathe = 1 + Math.sin(seconds * 1.3 + puff.phase) * 0.12;
      position.set(puff.x + Math.cos(seconds * 0.7 + puff.phase) * 0.3,
        TRAIL_Y + puff.y + Math.sin(seconds * 1.1 + puff.phase) * PUFF_BOB, z);
      quaternion.setFromAxisAngle(up, puff.yaw + seconds * PUFF_SPIN);
      scale.setScalar(puff.size * breathe * (PUFF_EDGE_MIN_SCALE + (1 - PUFF_EDGE_MIN_SCALE) * edge));
      matrix.compose(position, quaternion, scale);
      const { mesh, fade } = meshes[i % meshes.length]!;
      const slot = Math.floor(i / meshes.length);
      mesh.setMatrixAt(slot, matrix);
      fade.setX(slot, edge);
    });
    meshes.forEach(({ mesh, fade }) => { mesh.instanceMatrix.needsUpdate = true; fade.needsUpdate = true; });
  }

  return { group, sync, hide: () => { group.visible = false; } };
}

export function addShieldBubble(THREE: ThreeModule, parent: T.Object3D) {
  const material = new THREE.MeshBasicMaterial({ color: SHIELD_COLOR, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(SHIELD_RADIUS, 20, 14), material);
  bubble.position.y = SHIELD_CENTRE_Y;
  bubble.visible = false;
  parent.add(bubble);
  let strength = 0;

  function update(isShielding: boolean, elapsedMs: number, dtSec: number) {
    const target = isShielding ? 1 : 0;
    const stepAmount = SHIELD_FADE_PER_SEC * dtSec;
    strength = Math.abs(target - strength) <= stepAmount ? target : strength + Math.sign(target - strength) * stepAmount;
    bubble.visible = strength > 0;
    const pulse = 1 + Math.sin(elapsedMs * 0.006) * 0.04;
    bubble.scale.setScalar((0.7 + strength * 0.3) * pulse);
    material.opacity = strength * SHIELD_OPACITY;
  }

  return { mesh: bubble, update };
}
