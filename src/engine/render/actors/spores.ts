/**
 * Poison spore clouds and the hands-on-hips shield bubble.
 *
 * The cloud is one InstancedMesh of soft puffs filling every lane for the
 * cloud's length, over a tinted strip of ground -- a single draw call each. The
 * reducer never has more than one cloud alive, so one slot is the whole pool.
 *
 * The bubble is parented to the player group, so it follows the lane lerp and
 * the jump arc for free. It is NOT in `player.materials`, which the grace-window
 * blink overwrites every frame.
 */

import type * as T from 'three';
import type { GameConfig, SporeCloud, ThreeModule } from '@/engine/types';
import { TRAIL_Y } from '@/engine/render/world/ground';
import { createRng, range } from '@/engine/render/world/rng';

const PUFF_COUNT = 160;
const PUFF_COLORS = ['#7fdc4a', '#a46bd8', '#5fb85a', '#c48ae6'];
const PUFF_MIN_Y = 0.4;
const PUFF_MAX_Y = 4.2;
const PUFF_MIN_SIZE = 0.9;
const PUFF_MAX_SIZE = 1.9;
const PUFF_BOB = 0.35;
const PUFF_OPACITY = 0.32;
const GROUND_OPACITY = 0.4;
/** Puffs fade in over this many units at each end, so the cloud has no hard wall. */
const EDGE_FADE = 8;

const SHIELD_COLOR = '#7fe3ff';
const SHIELD_RADIUS = 1.6;
const SHIELD_CENTRE_Y = 1.7;
const SHIELD_OPACITY = 0.28;
const SHIELD_FADE_PER_SEC = 6;

export function addSporeCloud(THREE: ThreeModule, scene: T.Scene, config: GameConfig) {
  const halfWidth = (config.laneCount * config.laneWidth) / 2 + 0.6;
  const rng = createRng(0x5b0e);
  const puffs = Array.from({ length: PUFF_COUNT }, () => ({
    x: range(rng, -halfWidth, halfWidth),
    y: range(rng, PUFF_MIN_Y, PUFF_MAX_Y),
    t: rng(),
    size: range(rng, PUFF_MIN_SIZE, PUFF_MAX_SIZE),
    phase: rng() * Math.PI * 2,
  }));

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const puffMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: PUFF_OPACITY, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), puffMaterial, PUFF_COUNT);
  mesh.frustumCulled = false;
  const color = new THREE.Color();
  puffs.forEach((_, i) => mesh.setColorAt(i, color.set(PUFF_COLORS[i % PUFF_COLORS.length]!)));
  group.add(mesh);

  const groundMaterial = new THREE.MeshBasicMaterial({ color: '#6a3f86', transparent: true,
    opacity: GROUND_OPACITY, depthWrite: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(halfWidth * 2, 1), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = TRAIL_Y + 0.05;
  group.add(ground);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  function sync(clouds: SporeCloud[], elapsedMs: number) {
    const cloud = clouds[0];
    group.visible = Boolean(cloud);
    if (!cloud) return;
    group.position.z = cloud.z;
    ground.scale.y = cloud.length;
    ground.position.z = -cloud.length / 2;
    const seconds = elapsedMs / 1000;
    puffs.forEach((puff, i) => {
      const z = -puff.t * cloud.length;
      const edge = Math.min(1, -z / EDGE_FADE, (cloud.length + z) / EDGE_FADE);
      const breathe = 1 + Math.sin(seconds * 1.3 + puff.phase) * 0.12;
      position.set(puff.x + Math.cos(seconds * 0.7 + puff.phase) * 0.3,
        TRAIL_Y + puff.y + Math.sin(seconds * 1.1 + puff.phase) * PUFF_BOB, z);
      scale.setScalar(puff.size * breathe * Math.max(0.05, edge));
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
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
