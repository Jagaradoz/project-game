/**
 * Spell balls: the player's shots, their trails, the cast flash and the impact
 * burst.
 *
 * Styled to match the "+N" score labels (scorePopups.ts): a glossy neon core
 * with a white-hot highlight (the shared candy matcap), a thick dark cartoon
 * outline, and a soft glow in the same colour. The trail and the impact spray
 * alternate white-hot and neon, so they glint the way the label gradients do.
 * Each magician casts in their own colour.
 *
 * Trail puffs and impact chips are InstancedMeshes; a ball is a small Group of
 * three meshes that share one geometry and one material per layer.
 */

import type * as T from 'three';

import { laneToX } from '@/engine/core/state';
import { createGlossyMatcap } from '@/engine/render/actors/matcap';
import { TRAIL_Y } from '@/engine/render/world/ground';
import type { GameConfig, GameState, ThreeModule } from '@/engine/types';

/** Neon per magician, from the same family as the orb palette. */
const SPELL_COLORS: Record<string, string> = {
  mage: '#ff6a00',
  druid: '#2bff4f',
  skeletonMage: '#00e1ff',
  witch: '#9d4dff',
  magicalGirl: '#ff1f9d',
};

const BALL_HEIGHT = 1.2;
const BALL_RADIUS = 0.26;
const BALL_SEGMENTS = 20;
/** Outline shell, as a share of the core: drawn back-faces only, so it rims the ball. */
const OUTLINE_SCALE = 1.2;
const OUTLINE_COLOR = '#2a0d3d';
const GLOW_SCALE = 2.3;
const GLOW_OPACITY = 0.45;
const PULSE = 0.1;
const PULSE_RATE = 0.018;

const TRAIL_PER_BALL = 8;
const TRAIL_SIZE = 0.13;
const TRAIL_GAP = 0.3;
const TRAIL_WOBBLE = 0.08;
const TRAIL_RATE = 0.015;
const TRAIL_SCALE = 1.5;

const CHIP_COUNT = 128;
const CHIPS_PER_IMPACT = 14;
const CHIP_LIFE_SEC = 0.45;
const CHIP_SPREAD = 7;
const CHIP_LIFT = 4.5;
const CHIP_GRAVITY = 6;
const CHIP_SCALE = 2;

const FLASH_LIFE_SEC = 0.13;
const FLASH_RADIUS = 0.3;
const FLASH_GROWTH = 5;
/** The muzzle sits just in front of the player. */
const FLASH_Z = -0.85;

/** Every other trail puff and chip is lifted this far towards white. */
const WHITE_MIX = 0.65;

export function addSpellPool(THREE: ThreeModule, scene: T.Scene, config: GameConfig) {
  const owned = new Set<{ dispose(): void }>();
  const own = <R extends { dispose(): void }>(resource: R): R => {
    owned.add(resource);
    return resource;
  };

  const sphere = own(new THREE.SphereGeometry(BALL_RADIUS, BALL_SEGMENTS, BALL_SEGMENTS * 0.75));
  const matcap = own(createGlossyMatcap(THREE));
  const coreMaterial = own(new THREE.MeshMatcapMaterial({ matcap, toneMapped: false }));
  const outlineMaterial = own(new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }));
  const additive = (opacity: number) => own(new THREE.MeshBasicMaterial({
    transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const glowMaterial = additive(GLOW_OPACITY);
  const sparkMaterial = additive(1);

  const puff = own(new THREE.IcosahedronGeometry(TRAIL_SIZE, 1));
  const trails = new THREE.InstancedMesh(puff, sparkMaterial, config.bulletPoolSize * TRAIL_PER_BALL);
  const sparks = new THREE.InstancedMesh(puff, sparkMaterial, CHIP_COUNT);
  for (const layer of [trails, sparks]) {
    layer.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(layer.count * 3), 3);
    layer.frustumCulled = false;
    scene.add(layer);
  }
  const flash = new THREE.Mesh(own(new THREE.SphereGeometry(FLASH_RADIUS, 12, 8)), glowMaterial);
  scene.add(flash);

  const items = Array.from({ length: config.bulletPoolSize }, () => {
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(sphere, coreMaterial);
    const outline = new THREE.Mesh(sphere, outlineMaterial);
    outline.scale.setScalar(OUTLINE_SCALE);
    const glow = new THREE.Mesh(sphere, glowMaterial);
    glow.scale.setScalar(GLOW_SCALE);
    mesh.add(outline, core, glow);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh };
  });

  const chips = Array.from({ length: CHIP_COUNT }, () => ({ life: 0, position: new THREE.Vector3(), velocity: new THREE.Vector3() }));
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const color = new THREE.Color();
  const hot = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
  let character = '';
  let nextChip = 0;
  let flashLife = 0;
  let lastEventMs = -1;

  /** Re-tints every layer, and the alternating white-hot / neon instance colours. */
  function setCharacter(id: string) {
    const next = SPELL_COLORS[id] ? id : config.defaultCharacter;
    if (next === character) return;
    character = next;
    color.set(SPELL_COLORS[character] ?? SPELL_COLORS.mage!);
    hot.copy(color).lerp(white, WHITE_MIX);
    coreMaterial.color.copy(color);
    glowMaterial.color.copy(color);
    sparkMaterial.color.set(white);
    for (const layer of [trails, sparks]) {
      for (let index = 0; index < layer.count; index += 1) layer.setColorAt(index, index % 2 ? color : hot);
      layer.instanceColor!.needsUpdate = true;
    }
  }

  function impact(x: number, y: number, z: number) {
    for (let count = 0; count < CHIPS_PER_IMPACT; count += 1) {
      const chip = chips[nextChip]!;
      nextChip = (nextChip + 1) % CHIP_COUNT;
      chip.life = CHIP_LIFE_SEC;
      chip.position.set(x, y, z);
      chip.velocity.set((Math.random() - 0.5) * CHIP_SPREAD, Math.random() * CHIP_LIFT, (Math.random() - 0.5) * CHIP_SPREAD);
    }
  }

  function hideInstances(mesh: T.InstancedMesh) {
    scale.setScalar(0);
    origin.set(0, 0, 0);
    matrix.compose(origin, quaternion, scale);
    for (let index = 0; index < mesh.count; index += 1) mesh.setMatrixAt(index, matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  function hideAll() {
    items.forEach((slot) => { slot.mesh.visible = false; });
    flash.visible = false;
    hideInstances(trails);
    hideInstances(sparks);
  }

  function sync(state: GameState, dtSec: number, id: string) {
    setCharacter(id);
    if (state.elapsedMs !== lastEventMs) {
      if (state.justFired) flashLife = FLASH_LIFE_SEC;
      for (const mark of state.justImpacts) impact(laneToX(mark.lane, config), TRAIL_Y + BALL_HEIGHT, mark.z);
      lastEventMs = state.elapsedMs;
    }

    flashLife = Math.max(0, flashLife - dtSec);
    flash.visible = flashLife > 0;
    flash.position.set(laneToX(state.lane, config), TRAIL_Y + BALL_HEIGHT + state.jumpHeight, FLASH_Z);
    flash.scale.setScalar(1 + flashLife * FLASH_GROWTH);

    items.forEach((slot, index) => {
      const bullet = state.bullets[index];
      slot.mesh.visible = Boolean(bullet);
      if (bullet) {
        slot.mesh.position.set(laneToX(bullet.lane, config), TRAIL_Y + BALL_HEIGHT, bullet.z);
        slot.mesh.scale.setScalar(1 + Math.sin(state.elapsedMs * PULSE_RATE + index) * PULSE);
      }
      for (let step = 0; step < TRAIL_PER_BALL; step += 1) {
        const phase = state.elapsedMs * TRAIL_RATE + index + step;
        if (bullet) {
          origin.set(
            laneToX(bullet.lane, config) + Math.sin(phase) * TRAIL_WOBBLE,
            TRAIL_Y + BALL_HEIGHT + Math.cos(phase) * TRAIL_WOBBLE,
            bullet.z + BALL_RADIUS * 1.5 + step * TRAIL_GAP,
          );
          scale.setScalar((1 - step / TRAIL_PER_BALL) * TRAIL_SCALE * (1 + Math.sin(phase) * PULSE));
        } else {
          origin.set(0, 0, 0);
          scale.setScalar(0);
        }
        matrix.compose(origin, quaternion, scale);
        trails.setMatrixAt(index * TRAIL_PER_BALL + step, matrix);
      }
    });

    chips.forEach((chip, index) => {
      chip.life = Math.max(0, chip.life - dtSec);
      if (chip.life) {
        chip.position.addScaledVector(chip.velocity, dtSec);
        chip.position.z += state.speed * dtSec;
        chip.velocity.y -= dtSec * CHIP_GRAVITY;
      }
      scale.setScalar(chip.life * CHIP_SCALE);
      matrix.compose(chip.position, quaternion, scale);
      sparks.setMatrixAt(index, matrix);
    });
    trails.instanceMatrix.needsUpdate = true;
    sparks.instanceMatrix.needsUpdate = true;
  }

  setCharacter(config.defaultCharacter);
  hideAll();

  return {
    items,
    sync,
    setCharacter,
    impact,
    hide: hideAll,
    reset() {
      chips.forEach((chip) => { chip.life = 0; });
      flashLife = 0;
      lastEventMs = -1;
      hideAll();
    },
    dispose() {
      owned.forEach((resource) => resource.dispose());
      trails.dispose();
      sparks.dispose();
    },
  };
}
