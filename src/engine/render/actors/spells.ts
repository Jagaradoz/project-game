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
 * Tapered comet ribbons, drifting embers and impact rings are instanced;
 * pooled balls share a sphere, matcap and radial sprite texture.
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
const GLOW_SCALE = 2.8;
const GLOW_OPACITY = 0.78;
const PULSE = 0.1;
const PULSE_RATE = 0.018;

const TRAIL_PER_BALL = 16;
const TRAIL_SIZE = 0.1;
const TRAIL_LENGTH = 6.8;
const TRAIL_WIDTH = 0.82;
const TRAIL_WOBBLE = 0.2;
const TRAIL_RATE = 0.0025;

const RING_COUNT = 12;
const RING_LIFE_SEC = 0.32;

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
const HALO_SIZE = 64;

/** A soft ribbon faces the camera along its length, even on the outer lanes. */
function createTrailMaterial(THREE: ThreeModule) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vTint;
      void main() {
        vUv = uv;
        vTint = instanceColor;
        vec4 head = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 tail = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 1.0, 1.0);
        vec2 axis = tail.xy - head.xy;
        vec2 side = length(axis) > 0.0001 ? normalize(vec2(-axis.y, axis.x)) : vec2(1.0, 0.0);
        float width = length(instanceMatrix[0].xyz);
        float taper = pow(1.0 - uv.y, 0.72);
        float curl = sin(uv.y * 10.0 - uTime * 9.0 + instanceMatrix[3].z)
          * sin(uv.y * 3.14159) * width * 0.12;
        vec4 viewPosition = mix(head, tail, uv.y);
        viewPosition.xy += side * (position.x * width * taper + curl);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vTint;
      void main() {
        float edge = abs(vUv.x * 2.0 - 1.0);
        float soft = exp(-edge * edge * 4.5) * (1.0 - smoothstep(0.65, 1.0, edge));
        float fade = pow(1.0 - vUv.y, 1.15);
        float filament = pow(max(0.0, 1.0 - edge), 7.0);
        float flow = 0.68 + 0.08 * sin(vUv.y * 28.0 - uTime * 18.0);
        gl_FragColor = vec4(mix(vTint, vec3(1.0), filament * 0.65), soft * fade * flow);
        #include <colorspace_fragment>
      }
    `,
  });
}

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
  const haloData = new Uint8Array(HALO_SIZE * HALO_SIZE * 4);
  for (let y = 0; y < HALO_SIZE; y += 1) {
    for (let x = 0; x < HALO_SIZE; x += 1) {
      const radius = Math.hypot((x + 0.5 - HALO_SIZE / 2) / (HALO_SIZE / 2), (y + 0.5 - HALO_SIZE / 2) / (HALO_SIZE / 2));
      const alpha = Math.pow(Math.max(0, 1 - radius), 2.4) * Math.min(1, Math.max(0, (1 - radius) * 5));
      const offset = (y * HALO_SIZE + x) * 4;
      haloData[offset] = 255;
      haloData[offset + 1] = 255;
      haloData[offset + 2] = 255;
      haloData[offset + 3] = Math.round(alpha * 255);
    }
  }
  const haloTexture = own(new THREE.DataTexture(haloData, HALO_SIZE, HALO_SIZE, THREE.RGBAFormat));
  haloTexture.magFilter = THREE.LinearFilter;
  haloTexture.minFilter = THREE.LinearFilter;
  haloTexture.needsUpdate = true;
  const additive = (opacity: number) => own(new THREE.MeshBasicMaterial({
    transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const glowMaterial = own(new THREE.SpriteMaterial({
    map: haloTexture, color: 0xffffff, transparent: true, opacity: GLOW_OPACITY,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  const sparkMaterial = additive(1);

  const puff = own(new THREE.IcosahedronGeometry(TRAIL_SIZE, 1));
  const ribbonMaterial = own(createTrailMaterial(THREE));
  const ribbons = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1, 1, 24)), ribbonMaterial, config.bulletPoolSize);
  const trails = new THREE.InstancedMesh(puff, sparkMaterial, config.bulletPoolSize * TRAIL_PER_BALL);
  const sparks = new THREE.InstancedMesh(puff, sparkMaterial, CHIP_COUNT);
  const rings = new THREE.InstancedMesh(own(new THREE.RingGeometry(0.86, 1, 40)), additive(0.65), RING_COUNT);
  rings.material.side = THREE.DoubleSide;
  ribbons.name = 'spell-comet-trails';
  trails.name = 'spell-embers';
  sparks.name = 'spell-impact-sparks';
  rings.name = 'spell-impact-rings';
  const layers = [ribbons, trails, sparks, rings];
  for (const layer of layers) {
    layer.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(layer.count * 3), 3);
    layer.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    layer.instanceColor.setUsage(THREE.DynamicDrawUsage);
    layer.frustumCulled = false;
    scene.add(layer);
  }
  const flash = new THREE.Sprite(glowMaterial);
  flash.scale.setScalar(FLASH_RADIUS * 2);
  scene.add(flash);

  const items = Array.from({ length: config.bulletPoolSize }, () => {
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(sphere, coreMaterial);
    const outline = new THREE.Mesh(sphere, outlineMaterial);
    outline.scale.setScalar(OUTLINE_SCALE);
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.setScalar(BALL_RADIUS * 2 * GLOW_SCALE);
    mesh.add(outline, core, glow);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh };
  });

  const chips = Array.from({ length: CHIP_COUNT }, () => ({ life: 0, position: new THREE.Vector3(), velocity: new THREE.Vector3() }));
  const ripples = Array.from({ length: RING_COUNT }, () => ({ life: 0, position: new THREE.Vector3() }));
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const ringQuaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(
    new THREE.Vector3(config.camera.x, config.camera.y, config.camera.z),
    new THREE.Vector3(0, config.camera.lookAtY, config.camera.lookAtZ),
    new THREE.Vector3(0, 1, 0),
  ));
  const scale = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 1);
  const color = new THREE.Color();
  const hot = new THREE.Color();
  const white = new THREE.Color(1, 1, 1);
  const instanceTint = new THREE.Color();
  let character = '';
  let nextChip = 0;
  let nextRing = 0;
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
    for (const layer of layers) {
      for (let index = 0; index < layer.count; index += 1) layer.setColorAt(index, index % 2 ? color : hot);
      layer.instanceColor!.needsUpdate = true;
    }
  }

  function impact(x: number, y: number, z: number) {
    const ripple = ripples[nextRing]!;
    nextRing = (nextRing + 1) % RING_COUNT;
    ripple.life = RING_LIFE_SEC;
    ripple.position.set(x, y, z);
    for (let count = 0; count < CHIPS_PER_IMPACT; count += 1) {
      const chip = chips[nextChip]!;
      nextChip = (nextChip + 1) % CHIP_COUNT;
      chip.life = CHIP_LIFE_SEC;
      chip.position.set(x, y, z);
      const angle = (count / CHIPS_PER_IMPACT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = CHIP_SPREAD * (0.35 + Math.random() * 0.65);
      chip.velocity.set(Math.cos(angle) * speed, 1.2 + Math.random() * CHIP_LIFT, Math.sin(angle) * speed);
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
    layers.forEach(hideInstances);
  }

  function sync(state: GameState, dtSec: number, id: string) {
    setCharacter(id);
    ribbonMaterial.uniforms.uTime!.value = state.elapsedMs / 1000;
    if (state.elapsedMs !== lastEventMs) {
      if (state.justFired) flashLife = FLASH_LIFE_SEC;
      for (const mark of state.justImpacts) impact(laneToX(mark.lane, config), TRAIL_Y + BALL_HEIGHT, mark.z);
      lastEventMs = state.elapsedMs;
    }

    flashLife = Math.max(0, flashLife - dtSec);
    flash.visible = flashLife > 0;
    flash.position.set(laneToX(state.lane, config), TRAIL_Y + BALL_HEIGHT + state.jumpHeight, FLASH_Z);
    flash.scale.setScalar(FLASH_RADIUS * 2 * (1 + flashLife * FLASH_GROWTH));

    items.forEach((slot, index) => {
      const bullet = state.bullets[index];
      // Grow only through space the shot has travelled, never behind the player.
      const length = bullet ? Math.min(TRAIL_LENGTH, Math.max(0, config.playerZ - config.playerRadius - bullet.z)) : 0;
      slot.mesh.visible = Boolean(bullet);
      if (bullet) {
        slot.mesh.position.set(laneToX(bullet.lane, config), TRAIL_Y + BALL_HEIGHT, bullet.z);
        slot.mesh.scale.setScalar(1 + Math.sin(state.elapsedMs * PULSE_RATE + index) * PULSE);
      }
      origin.set(bullet ? laneToX(bullet.lane, config) : 0, TRAIL_Y + BALL_HEIGHT, bullet?.z ?? 0);
      scale.set(length > 0 ? TRAIL_WIDTH : 0, 1, length);
      matrix.compose(origin, quaternion, scale);
      ribbons.setMatrixAt(index, matrix);
      ribbons.setColorAt(index, color);
      for (let step = 0; step < TRAIL_PER_BALL; step += 1) {
        const phase = state.elapsedMs * TRAIL_RATE + index + step;
        if (bullet && length > 0) {
          const progress = (step + 0.5) / TRAIL_PER_BALL;
          const fade = 1 - progress;
          const drift = TRAIL_WOBBLE * (0.3 + progress);
          origin.set(
            laneToX(bullet.lane, config) + Math.sin(phase * 2.1) * drift,
            TRAIL_Y + BALL_HEIGHT + Math.cos(phase * 1.7) * drift,
            bullet.z + progress * length,
          );
          const size = fade * (0.45 + Math.sin(phase * 3.7) * 0.18);
          scale.set(size, size, size * (2.5 + fade));
          const trailColor = step % 2 ? color : hot;
          trails.setColorAt(index * TRAIL_PER_BALL + step, instanceTint.copy(trailColor).multiplyScalar(fade * 1.1));
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
      const lifeRatio = chip.life / CHIP_LIFE_SEC;
      const size = chip.life ? lifeRatio * CHIP_SCALE : 0;
      scale.set(size, size, size * 2.8);
      if (chip.life) quaternion.setFromUnitVectors(forward, origin.copy(chip.velocity).normalize());
      matrix.compose(chip.position, quaternion, scale);
      sparks.setMatrixAt(index, matrix);
      sparks.setColorAt(index, instanceTint.copy(index % 2 ? color : hot).multiplyScalar(0.35 + lifeRatio * 0.9));
    });
    quaternion.identity();
    ripples.forEach((ripple, index) => {
      ripple.life = Math.max(0, ripple.life - dtSec);
      ripple.position.z += state.speed * dtSec;
      const fade = ripple.life / RING_LIFE_SEC;
      scale.setScalar(ripple.life ? 0.25 + (1 - fade) * 1.65 : 0);
      matrix.compose(ripple.position, ringQuaternion, scale);
      rings.setMatrixAt(index, matrix);
      rings.setColorAt(index, instanceTint.copy(hot).multiplyScalar(fade * fade));
    });
    for (const layer of layers) {
      layer.instanceMatrix.needsUpdate = true;
      layer.instanceColor!.needsUpdate = true;
    }
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
      ripples.forEach((ripple) => { ripple.life = 0; });
      flashLife = 0;
      lastEventMs = -1;
      hideAll();
    },
    dispose() {
      owned.forEach((resource) => resource.dispose());
      layers.forEach((layer) => layer.dispose());
    },
  };
}
