/**
 * Score orbs: the view of core/orbs.ts.
 *
 * The reducer owns every orb -- where it lies, and whether it was picked up.
 * This module only dresses them: a pop and a few bounces where the enemy fell,
 * a gentle hover while the ground carries them in, and a quick flight into the
 * player once the reducer reports its magnet has taken them, from any lane.
 *
 * Each orb is a glossy, candy-like core inside a larger, faint additive halo of
 * the same colour. The core's shading comes from a procedural matcap (soft
 * diffuse, a coloured rim and a hot specular spot), so it reads as lit without
 * any scene light. Both are InstancedMeshes that SHARE one matrix buffer and one
 * colour buffer: two draw calls and one upload for the whole field, and no
 * lights -- a PointLight per orb would cost every lit material a shader variant.
 */

import type * as THREE_NS from 'three';

import { laneToX } from '@/engine/core/state';
import { TRAIL_Y } from '@/engine/render/world/ground';
import type { Palette } from '@/engine/render/world/palette';
import type { GameConfig, ScoreOrb, ThreeModule } from '@/engine/types';

const ORB_RADIUS = 0.17;
const ORB_SEGMENTS = 20;
/** Resting height of an orb's centre above the trail. */
const HOVER_Y = 0.45;
const HOVER_BOB = 0.08;
const HOVER_RATE = 3.2;
/** Death height the pop starts from, above the resting height. */
const POP_HEIGHT = 1.3;
const BOUNCE_RATE = 9;
const BOUNCE_DAMPING = 3.2;
/**
 * Full width of the sideways scatter around the kill point. Wider than the
 * road on purpose: the magnet takes orbs from anywhere, so lanes don't matter.
 */
const SPREAD_X = 7;
const SPREAD_SEC = 0.35;

const HALO_SCALE = 2.4;
const HALO_OPACITY = 0.35;

/** Matcap texture edge, in texels. */
const MATCAP_SIZE = 128;
/** Texel values above 1 push the tinted highlight towards white. */
const MATCAP_SPECULAR = 3;
const MATCAP_SHININESS = 40;
const MATCAP_RIM = 0.6;

const HOME_START_SPEED = 6;
const HOME_ACCEL = 90;
const COLLECT_DISTANCE = 0.4;
/** A collected orb that somehow never arrives is retired after this long. */
const MAX_FLIGHT_SEC = 1;
/** Slots beyond the field cap, for orbs still flying home after collection. */
const FLIGHT_SLOTS = 48;
const HIDDEN_SCALE = 0.0001;
/** Knuth's multiplicative hash: stable per-orb colour and offset from its id. */
const HASH_MULTIPLIER = 2654435761;

type SlotPhase = 'idle' | 'ground' | 'home';

interface Slot {
  phase: SlotPhase;
  id: number;
  ageSec: number;
  flightSec: number;
  speed: number;
  offsetX: number;
  bobPhase: number;
  seenFrame: number;
  position: THREE_NS.Vector3;
}

export interface OrbTarget {
  x: number;
  y: number;
  z: number;
}

export interface ScoreOrbRefs {
  mesh: THREE_NS.InstancedMesh;
  halo: THREE_NS.InstancedMesh;
  update(orbs: readonly ScoreOrb[], collectedIds: readonly number[], dtSec: number, target: OrbTarget): void;
  hide(): void;
  /** Orbs drawn this frame, on the ground or flying home. */
  readonly activeCount: number;
}

function hashId(id: number): number {
  return Math.imul(id, HASH_MULTIPLIER) >>> 0;
}

/**
 * A white-based matcap: instance colour tints it, and the HDR specular spot
 * saturates past the tint so the highlight reads white on every gem colour.
 */
function createMatcap(THREE: ThreeModule): THREE_NS.DataTexture {
  const data = new Uint16Array(MATCAP_SIZE * MATCAP_SIZE * 4);
  const light = new THREE.Vector3(-0.45, 0.6, 0.66).normalize();
  const normal = new THREE.Vector3();
  const half = new THREE.Vector3();
  const view = new THREE.Vector3(0, 0, 1);
  half.copy(light).add(view).normalize();

  for (let row = 0; row < MATCAP_SIZE; row += 1) {
    for (let column = 0; column < MATCAP_SIZE; column += 1) {
      const nx = ((column + 0.5) / MATCAP_SIZE) * 2 - 1;
      const ny = ((row + 0.5) / MATCAP_SIZE) * 2 - 1;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      normal.set(nx, ny, nz);
      const diffuse = 0.45 + 0.55 * Math.max(0, normal.dot(light));
      const rim = Math.pow(1 - nz, 3) * MATCAP_RIM;
      const specular = Math.pow(Math.max(0, normal.dot(half)), MATCAP_SHININESS) * MATCAP_SPECULAR;
      const value = THREE.DataUtils.toHalfFloat(diffuse + rim + specular);
      const offset = (row * MATCAP_SIZE + column) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }

  const texture = new THREE.DataTexture(data, MATCAP_SIZE, MATCAP_SIZE, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createScoreOrbs(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  palette: Palette,
  config: GameConfig,
): ScoreOrbRefs {
  const poolSize = config.scoreOrbs.maxOrbs + FLIGHT_SLOTS;
  const colors = palette.accents.orbs.map((hex) => new THREE.Color(hex));

  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(ORB_RADIUS, ORB_SEGMENTS, ORB_SEGMENTS * 0.75),
    new THREE.MeshMatcapMaterial({ matcap: createMatcap(THREE), toneMapped: false }),
    poolSize,
  );
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(poolSize * 3), 3);
  const halo = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(ORB_RADIUS * HALO_SCALE, 1),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: HALO_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    poolSize,
  );
  for (const layer of [mesh, halo]) {
    layer.instanceMatrix = mesh.instanceMatrix;
    layer.instanceColor = mesh.instanceColor;
    layer.frustumCulled = false;
    layer.castShadow = false;
    layer.receiveShadow = false;
    scene.add(layer);
  }

  const slots: Slot[] = Array.from({ length: poolSize }, () => ({
    phase: 'idle', id: -1, ageSec: 0, flightSec: 0, speed: 0, offsetX: 0, bobPhase: 0, seenFrame: -1,
    position: new THREE.Vector3(),
  }));
  const free = slots.map((_, index) => poolSize - 1 - index);
  const slotById = new Map<number, number>();
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const upright = new THREE.Quaternion();
  const toTarget = new THREE.Vector3();
  const restY = TRAIL_Y + HOVER_Y;
  let frame = 0;
  let activeCount = 0;

  function write(index: number, size: number): void {
    scale.setScalar(size);
    matrix.compose(slots[index]!.position, upright, scale);
    mesh.setMatrixAt(index, matrix);
  }

  function retire(index: number): void {
    const slot = slots[index]!;
    if (slot.phase === 'ground') slotById.delete(slot.id);
    slot.phase = 'idle';
    free.push(index);
    activeCount -= 1;
    write(index, HIDDEN_SCALE);
  }

  function claim(orb: ScoreOrb): number | undefined {
    const index = free.pop();
    if (index === undefined) return undefined;
    const slot = slots[index]!;
    const hash = hashId(orb.id);
    slot.phase = 'ground';
    slot.id = orb.id;
    slot.ageSec = 0;
    slot.offsetX = (((hash >>> 8) % 1000) / 1000 - 0.5) * SPREAD_X;
    slot.bobPhase = ((hash >>> 4) % 628) / 100;
    mesh.setColorAt(index, colors[hash % colors.length]!);
    mesh.instanceColor!.needsUpdate = true;
    slotById.set(orb.id, index);
    activeCount += 1;
    return index;
  }

  /** Pop from the body, a few shrinking bounces, then a slow hover. */
  function placeOnGround(slot: Slot, orb: ScoreOrb): void {
    const age = slot.ageSec;
    const bounce = Math.abs(Math.cos(age * BOUNCE_RATE)) * Math.exp(-age * BOUNCE_DAMPING) * POP_HEIGHT;
    const settle = 1 - Math.exp(-age * BOUNCE_DAMPING);
    const spread = Math.min(1, age / SPREAD_SEC);
    slot.position.set(
      laneToX(orb.lane, config) + slot.offsetX * spread,
      restY + bounce + Math.sin(age * HOVER_RATE + slot.bobPhase) * HOVER_BOB * settle,
      orb.z,
    );
  }

  /** True once the orb has reached the player. */
  function flyHome(slot: Slot, dtSec: number, target: OrbTarget): boolean {
    toTarget.set(target.x, target.y, target.z).sub(slot.position);
    const distance = toTarget.length();
    if (distance <= COLLECT_DISTANCE) return true;
    slot.speed += HOME_ACCEL * dtSec;
    slot.position.addScaledVector(toTarget, Math.min(slot.speed * dtSec, distance) / distance);
    return false;
  }

  function hideAll(): void {
    for (let index = 0; index < poolSize; index += 1) {
      if (slots[index]!.phase !== 'idle') retire(index);
      else write(index, HIDDEN_SCALE);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  hideAll();

  return {
    mesh,
    halo,

    update(orbs, collectedIds, dtSec, target) {
      if (activeCount === 0 && orbs.length === 0) return;
      frame += 1;

      for (const id of collectedIds) {
        const index = slotById.get(id);
        if (index === undefined) continue;
        const slot = slots[index]!;
        slotById.delete(id);
        slot.phase = 'home';
        slot.flightSec = 0;
        slot.speed = HOME_START_SPEED;
      }

      for (const orb of orbs) {
        const index = slotById.get(orb.id) ?? claim(orb);
        if (index === undefined) continue;
        const slot = slots[index]!;
        slot.ageSec += dtSec;
        slot.seenFrame = frame;
        placeOnGround(slot, orb);
      }

      for (let index = 0; index < poolSize; index += 1) {
        const slot = slots[index]!;
        if (slot.phase === 'idle') continue;
        // Gone from the reducer without being collected: rolled past, or the run restarted.
        if (slot.phase === 'ground' && slot.seenFrame !== frame) {
          retire(index);
          continue;
        }
        if (slot.phase === 'home') {
          slot.ageSec += dtSec;
          slot.flightSec += dtSec;
          if (flyHome(slot, dtSec, target) || slot.flightSec >= MAX_FLIGHT_SEC) {
            retire(index);
            continue;
          }
        }
        write(index, 1);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },

    /** Called every frame the actors are hidden, so it is free when nothing is showing. */
    hide() {
      if (activeCount > 0) hideAll();
    },

    get activeCount() {
      return activeCount;
    },
  };
}
