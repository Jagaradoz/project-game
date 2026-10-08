/**
 * Score orbs: the view of core/orbs.ts.
 *
 * The reducer owns every orb -- where it lies, and whether it was picked up.
 * This module only dresses them: a pop and a few bounces where the enemy fell,
 * a gentle hover and twinkle while the ground carries them in, and -- once the
 * reducer reports its magnet has taken them, from any lane -- a swell, an
 * arcing flight into the player, and a splash where each one lands (orbSplash.ts)
 * with its "+N" floating up beside the character (scorePopups.ts).
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
import { createGlossyMatcap } from '@/engine/render/actors/matcap';
import { createOrbSplash, type OrbSplashRefs } from '@/engine/render/actors/orbSplash';
import { createScorePopups, type ScorePopupRefs } from '@/engine/render/actors/scorePopups';
import { TRAIL_Y } from '@/engine/render/world/ground';
import type { Palette } from '@/engine/render/world/palette';
import type { GameConfig, ScoreOrb, ThreeModule } from '@/engine/types';

const ORB_RADIUS = 0.24;
const ORB_SEGMENTS = 20;
/** Resting height of an orb's centre above the trail. */
const HOVER_Y = 0.45;
const HOVER_BOB = 0.08;
const HOVER_RATE = 3.2;
/** A slow breathing of each orb's size, out of step with its neighbours. */
const TWINKLE = 0.1;
const TWINKLE_RATE = 5.5;
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

const HALO_SCALE = 1.3;
const HALO_OPACITY = 0.6;

const HOME_START_SPEED = 4;
const HOME_ACCEL = 110;
/** The upward, outward flick an orb gets when the magnet takes it, decaying as it homes in. */
const KICK_UP = 5;
const KICK_SIDE = 2.5;
const KICK_DECAY = 7;
/** Pickup swell: the orb grows this much over the first moments of its flight... */
const SWELL = 0.6;
const SWELL_SEC = 0.12;
/** ...then shrinks towards this size as it reaches the player. */
const ARRIVE_SCALE = 0.45;
const ARRIVE_RANGE = 2.5;
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
  colorIndex: number;
  /** Points this orb carries, for its "+N" label. */
  value: number;
  position: THREE_NS.Vector3;
  kick: THREE_NS.Vector3;
}

export interface OrbTarget {
  x: number;
  y: number;
  z: number;
}

export interface ScoreOrbRefs {
  mesh: THREE_NS.InstancedMesh;
  halo: THREE_NS.InstancedMesh;
  splash: OrbSplashRefs;
  popups: ScorePopupRefs;
  update(orbs: readonly ScoreOrb[], collectedIds: readonly number[], dtSec: number, target: OrbTarget): void;
  hide(): void;
  /** Orbs drawn this frame, on the ground or flying home. */
  readonly activeCount: number;
}

function hashId(id: number): number {
  return Math.imul(id, HASH_MULTIPLIER) >>> 0;
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
    new THREE.MeshMatcapMaterial({ matcap: createGlossyMatcap(THREE), toneMapped: false }),
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
    colorIndex: 0, value: 0, position: new THREE.Vector3(), kick: new THREE.Vector3(),
  }));
  const splash = createOrbSplash(THREE, scene);
  const popups = createScorePopups(THREE, scene);
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
    slot.colorIndex = hash % colors.length;
    slot.value = orb.value;
    mesh.setColorAt(index, colors[slot.colorIndex]!);
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

  /** Size on the ground: a slow, per-orb twinkle. */
  function groundSize(slot: Slot): number {
    return 1 + Math.sin(slot.ageSec * TWINKLE_RATE + slot.bobPhase * 2) * TWINKLE;
  }

  /** Size in flight: a quick swell on pickup, shrinking as it reaches the player. */
  function flightSize(slot: Slot, target: OrbTarget): number {
    const swell = 1 + SWELL * Math.sin(Math.min(1, slot.flightSec / SWELL_SEC) * Math.PI * 0.5);
    toTarget.set(target.x, target.y, target.z).sub(slot.position);
    const near = Math.min(1, toTarget.length() / ARRIVE_RANGE);
    return swell * (ARRIVE_SCALE + (1 - ARRIVE_SCALE) * near);
  }

  /**
   * True once the orb has reached the player. The kick flings it up and out,
   * and the homing pull -- accelerating every frame -- bends that into an arc.
   */
  function flyHome(slot: Slot, dtSec: number, target: OrbTarget): boolean {
    slot.position.addScaledVector(slot.kick, dtSec);
    slot.kick.multiplyScalar(Math.exp(-KICK_DECAY * dtSec));
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
    splash.hide();
    popups.hide();
    mesh.instanceMatrix.needsUpdate = true;
  }

  hideAll();

  return {
    mesh,
    halo,
    splash,
    popups,

    update(orbs, collectedIds, dtSec, target) {
      splash.update(dtSec);
      popups.update(dtSec);
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
        slot.kick.set(Math.sign(slot.position.x - target.x) * KICK_SIDE, KICK_UP, 0);
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
            splash.splash(target, colors[slot.colorIndex]!, slot.id);
            popups.spawn(slot.value, target, colors[slot.colorIndex]!, slot.id);
            retire(index);
            continue;
          }
          write(index, flightSize(slot, target));
          continue;
        }
        write(index, groundSize(slot));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },

    /** Called every frame the actors are hidden, so it is free when nothing is showing. */
    hide() {
      if (activeCount > 0 || splash.liveCount > 0 || popups.liveCount > 0) hideAll();
    },

    get activeCount() {
      return activeCount;
    },
  };
}
