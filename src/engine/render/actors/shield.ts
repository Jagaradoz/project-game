/**
 * The hands-on-hips shield, in the same neon cartoon style as the orbs and
 * spells:
 *
 *   bubble   an iridescent fresnel shell -- clear in the middle, a white-hot
 *            rim, cyan-to-magenta sheen and energy bands scrolling up it
 *   sparks   glowing dots on three tilted orbits around the character
 *
 * It pops in with an overshoot when raised and shrinks away when dropped. All
 * of it is parented to the player, so it follows lane changes and jumps.
 */

import type * as T from 'three';

import type { ThreeModule } from '@/engine/types';

const RADIUS = 1.6;
const CENTRE_Y = 1.7;
const FADE_PER_SEC = 6;
/** Overall brightness of the bubble at full strength. */
const OPACITY = 0.9;
const COLOR_A = '#00e1ff';
const COLOR_B = '#ff1f9d';
const WHITE_MIX = 0.6;
/** easeOutBack's overshoot: the bubble pops slightly past full size, then settles. */
const POP_OVERSHOOT = 1.9;
const PULSE = 0.03;
const PULSE_RATE = 0.006;

const ORBITS = 3;
const SPARKS_PER_ORBIT = 6;
const SPARK_SIZE = 0.07;
const ORBIT_RADIUS = RADIUS * 1.08;
const ORBIT_SPEED = 0.0025;
const ORBIT_TILT = 0.9;

const VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vHeight;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mvPosition.xyz);
    vHeight = position.y / ${RADIUS.toFixed(2)};
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vHeight;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float fresnel = pow(1.0 - facing, 2.0);
    float rim = pow(1.0 - facing, 6.0);
    float sheen = clamp(vHeight * 0.5 + 0.5 + sin(uTime * 1.5) * 0.2, 0.0, 1.0);
    vec3 tint = mix(uColorA, uColorB, sheen);
    float bands = smoothstep(0.75, 1.0, sin(vHeight * 14.0 - uTime * 5.0) * 0.5 + 0.5);
    vec3 color = tint * (fresnel * 1.4 + bands * 0.35 + 0.06) + vec3(rim * 1.2);
    gl_FragColor = vec4(color * uOpacity, 1.0);
  }
`;

/** Overshoots past 1 and settles back, for the raise. */
function easeOutBack(progress: number): number {
  const shifted = progress - 1;
  return 1 + (POP_OVERSHOOT + 1) * shifted ** 3 + POP_OVERSHOOT * shifted ** 2;
}

export function addShieldBubble(THREE: ThreeModule, parent: T.Object3D) {
  const group = new THREE.Group();
  group.position.y = CENTRE_Y;
  group.visible = false;
  parent.add(group);

  const colorA = new THREE.Color(COLOR_A);
  const colorB = new THREE.Color(COLOR_B);
  const uniforms = {
    uColorA: { value: colorA },
    uColorB: { value: colorB },
    uTime: { value: 0 },
    uOpacity: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 32, 24), material);
  group.add(bubble);

  const additive = (opacity: number) => new THREE.MeshBasicMaterial({
    transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const sparkCount = ORBITS * SPARKS_PER_ORBIT;
  const sparks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(SPARK_SIZE, 1), additive(1), sparkCount);
  sparks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sparkCount * 3), 3);
  const white = new THREE.Color(1, 1, 1);
  const hotA = colorA.clone().lerp(white, WHITE_MIX);
  for (let index = 0; index < sparkCount; index += 1) {
    sparks.setColorAt(index, [hotA, colorA, colorB][index % 3]!);
  }
  sparks.frustumCulled = false;
  group.add(sparks);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const point = new THREE.Vector3();
  const tilt = new THREE.Euler();
  let strength = 0;

  function placeSparks(elapsedMs: number, size: number) {
    for (let orbit = 0; orbit < ORBITS; orbit += 1) {
      tilt.set(ORBIT_TILT * Math.cos(orbit * 2.1), (orbit * Math.PI * 2) / ORBITS, 0);
      for (let step = 0; step < SPARKS_PER_ORBIT; step += 1) {
        const angle = elapsedMs * ORBIT_SPEED * (orbit % 2 ? -1 : 1) + (step / SPARKS_PER_ORBIT) * Math.PI * 2;
        point.set(Math.cos(angle) * ORBIT_RADIUS, 0, Math.sin(angle) * ORBIT_RADIUS).applyEuler(tilt);
        scale.setScalar(size * (1 + 0.4 * Math.sin(elapsedMs * 0.01 + step)));
        matrix.compose(point, quaternion, scale);
        sparks.setMatrixAt(orbit * SPARKS_PER_ORBIT + step, matrix);
      }
    }
    sparks.instanceMatrix.needsUpdate = true;
  }

  function update(isShielding: boolean, elapsedMs: number, dtSec: number) {
    const target = isShielding ? 1 : 0;
    const stepAmount = FADE_PER_SEC * dtSec;
    strength = Math.abs(target - strength) <= stepAmount ? target : strength + Math.sign(target - strength) * stepAmount;
    group.visible = strength > 0;
    if (!group.visible) return;

    // Raising pops past full size; dropping just shrinks away.
    const grown = isShielding ? easeOutBack(strength) : strength;
    const pulse = 1 + Math.sin(elapsedMs * PULSE_RATE) * PULSE;
    bubble.scale.setScalar(Math.max(0.01, grown * pulse));
    uniforms.uTime.value = elapsedMs / 1000;
    uniforms.uOpacity.value = strength * OPACITY;
    material.opacity = strength * OPACITY;

    placeSparks(elapsedMs, strength);
  }

  return { mesh: group, bubble, sparks, update };
}
