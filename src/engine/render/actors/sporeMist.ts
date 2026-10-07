/**
 * Shaders that make the spore cloud read as soft mist rather than translucent rocks.
 *
 * The puff shapes are still the Blender-authored meshes; only how they are drawn changes:
 *  - silhouettes fade out (alpha follows how directly a face looks at the camera), so no
 *    puff has a hard polygon edge and overlapping puffs blend into one body
 *  - each puff is lit from above by a baked gradient, darker and cooler underneath
 *  - puffs fade where they meet the ground and right in front of the camera, so nothing
 *    slices the trail or fills the screen with one flat blob
 * All of it is unlit and per-vertex where possible: cheaper than the Lambert it replaces.
 *
 * Spore motes are one Points draw call animated entirely on the GPU.
 */

import type * as T from 'three';
import type { ThreeModule } from '@/engine/types';
import { range, type Rng } from '@/engine/render/world/rng';

export interface MistOptions {
  opacity: number;
  /** Colour multiplier at the bottom and top of each puff. */
  shade: string;
  lift: string;
  /** Extra tint added at grazing angles: light scattering through the thin edge. */
  rimGlow: number;
  /** Puffs fade out closer to the camera than this (world units). */
  nearFade: number;
  groundY: number;
}

const NEAR_FADE_SPAN = 4;
const GROUND_FADE_SPAN = 0.8;

const MIST_VERTEX = /* glsl */ `
attribute float aFade;
varying vec3 vTint;
varying float vFacing;
varying float vLocalY;
varying float vWorldY;
varying float vDepth;
varying float vFade;
#include <fog_pars_vertex>
void main() {
  mat4 instanceModel = modelMatrix * instanceMatrix;
  vec4 world = instanceModel * vec4(position, 1.0);
  vec3 worldNormal = normalize(mat3(instanceModel) * normal);
  vFacing = abs(dot(worldNormal, normalize(cameraPosition - world.xyz)));
  vLocalY = position.y;
  vWorldY = world.y;
#ifdef USE_INSTANCING_COLOR
  vTint = instanceColor;
#else
  vTint = vec3(1.0);
#endif
  vFade = aFade;
  vec4 mvPosition = viewMatrix * world;
  vDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const MIST_FRAGMENT = /* glsl */ `
uniform float uOpacity;
uniform float uRimGlow;
uniform float uNearFade;
uniform float uGroundY;
uniform vec3 uShade;
uniform vec3 uLift;
varying vec3 vTint;
varying float vFacing;
varying float vLocalY;
varying float vWorldY;
varying float vDepth;
varying float vFade;
#include <fog_pars_fragment>
void main() {
  float body = smoothstep(0.05, 0.75, vFacing);
  float alpha = uOpacity * body * vFade;
  alpha *= smoothstep(uGroundY, uGroundY + ${GROUND_FADE_SPAN.toFixed(2)}, vWorldY);
  alpha *= smoothstep(uNearFade, uNearFade + ${NEAR_FADE_SPAN.toFixed(1)}, vDepth);
  float up = clamp(vLocalY * 0.6 + 0.5, 0.0, 1.0);
  vec3 colour = vTint * mix(uShade, uLift, up) + vTint * uRimGlow * (1.0 - vFacing);
  gl_FragColor = vec4(colour, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createMistMaterial(THREE: ThreeModule, options: MistOptions): T.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uOpacity: { value: options.opacity },
      uRimGlow: { value: options.rimGlow },
      uNearFade: { value: options.nearFade },
      uGroundY: { value: options.groundY },
      uShade: { value: new THREE.Color(options.shade) },
      uLift: { value: new THREE.Color(options.lift) },
    }]),
    vertexShader: MIST_VERTEX,
    fragmentShader: MIST_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

/** Per-instance 0..1 fade, written each frame alongside the instance matrices. */
export function addFadeAttribute(THREE: ThreeModule, mesh: T.InstancedMesh): T.InstancedBufferAttribute {
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count).fill(1), 1);
  mesh.geometry.setAttribute('aFade', fade);
  return fade;
}

const GROUND_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uEndFade;
varying vec2 vUv;
varying vec3 vWorld;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
}
void main() {
  float sides = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float ends = smoothstep(0.0, uEndFade, vUv.y) * smoothstep(1.0, 1.0 - uEndFade, vUv.y);
  float mottle = 0.65 + 0.35 * noise(vWorld.xz * 0.35);
  gl_FragColor = vec4(uColor, uOpacity * sides * ends * mottle);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const GROUND_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

/** Tinted, mottled ground under the cloud with soft sides and ends instead of a hard rectangle. */
export function createMistGround(THREE: ThreeModule, width: number, color: string, opacity: number) {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uEndFade: { value: 0.1 },
    }]),
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  return {
    mesh,
    /** Stretch to the cloud; ends fade over `fade` units whatever the length. */
    fit(length: number, fade: number) {
      mesh.scale.y = length;
      mesh.position.z = -length / 2;
      material.uniforms.uEndFade!.value = Math.min(0.5, fade / Math.max(length, 1e-6));
    },
  };
}

export interface MoteOptions {
  count: number;
  color: string;
  size: number;
  halfWidth: number;
  minY: number;
  maxY: number;
}

/** Soft round dot, drawn once into a tiny texture. */
function dotTexture(THREE: ThreeModule): T.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const a = Math.max(0, 1 - d) ** 2;
      data.set([255, 255, 255, Math.round(a * 255)], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Glowing spores drifting up through the cloud. Positions are stored as (x, height offset, t)
 * and animated in the vertex shader, so a frame costs one uniform update.
 */
export function createSporeMotes(THREE: ThreeModule, rng: Rng, options: MoteOptions) {
  const { count, halfWidth, minY, maxY } = options;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions.set([range(rng, -halfWidth, halfWidth), range(rng, 0, maxY - minY), range(rng, 0.04, 0.96)], i * 3);
    phases[i] = rng() * Math.PI * 2;
    speeds[i] = range(rng, 0.25, 0.7);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  const material = new THREE.PointsMaterial({ color: options.color, size: options.size, map: dotTexture(THREE),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const uniforms = { uTime: { value: 0 }, uLength: { value: 1 }, uMinY: { value: minY }, uSpan: { value: maxY - minY } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uLength;
uniform float uMinY;
uniform float uSpan;
attribute float aPhase;
attribute float aSpeed;`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(
  position.x + sin(uTime * 0.8 + aPhase) * 0.35,
  uMinY + mod(position.y + uTime * aSpeed, uSpan),
  -position.z * uLength);`);
  };
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return {
    points,
    update(seconds: number, length: number) {
      uniforms.uTime.value = seconds;
      uniforms.uLength.value = length;
    },
  };
}
