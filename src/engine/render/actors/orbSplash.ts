/**
 * The splash a score orb makes when it lands on the player: a puff of small
 * glowing dots bursting out from the centre of the character in every
 * direction, slowing, drifting down and fading -- in the orb's own colour, with
 * every other dot white-hot so the spray glints.
 *
 * One additive InstancedMesh claimed round-robin, like effects.ts, so a stream
 * of pickups recycles the oldest dots instead of searching for free ones.
 * Additive blending makes black invisible, so a dot fades out simply by
 * darkening its instance colour: no per-instance opacity, no extra materials.
 */

import type * as THREE_NS from 'three';

import type { ThreeModule } from '@/engine/types';

const DOT_COUNT = 480;
const DOTS_PER_SPLASH = 24;
const DOT_SIZE = 0.11;
const DOT_SPEED_MIN = 4;
const DOT_SPEED_MAX = 8;
const DOT_GRAVITY = -6;
const DOT_DRAG = 4;
const DOT_LIFE_SEC = 0.6;
const WHITE_MIX = 0.6;
/** The golden angle spreads each splash's dots evenly over a sphere. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const HIDDEN_SCALE = 0.0001;

interface Dot {
  life: number;
  color: THREE_NS.Color;
  position: THREE_NS.Vector3;
  velocity: THREE_NS.Vector3;
}

export interface OrbSplashRefs {
  dots: THREE_NS.InstancedMesh;
  splash(at: THREE_NS.Vector3 | { x: number; y: number; z: number }, color: THREE_NS.Color, seed: number): void;
  update(dtSec: number): void;
  hide(): void;
  /** Dots still fading out. */
  readonly liveCount: number;
}

export function createOrbSplash(THREE: ThreeModule, scene: THREE_NS.Scene): OrbSplashRefs {
  const dots = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(DOT_SIZE, 1),
    new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    DOT_COUNT,
  );
  dots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DOT_COUNT * 3), 3);
  dots.frustumCulled = false;
  dots.castShadow = false;
  dots.receiveShadow = false;
  scene.add(dots);

  const pieces: Dot[] = Array.from({ length: DOT_COUNT }, () => ({
    life: 0, color: new THREE.Color(), position: new THREE.Vector3(), velocity: new THREE.Vector3(),
  }));
  const white = new THREE.Color(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const upright = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const faded = new THREE.Color();
  let next = 0;
  let liveCount = 0;

  function write(index: number, size: number, brightness: number): void {
    const dot = pieces[index]!;
    scale.setScalar(size);
    matrix.compose(dot.position, upright, scale);
    dots.setMatrixAt(index, matrix);
    dots.setColorAt(index, faded.copy(dot.color).multiplyScalar(brightness));
  }

  function flush(): void {
    dots.instanceMatrix.needsUpdate = true;
    dots.instanceColor!.needsUpdate = true;
  }

  function hideAll(): void {
    pieces.forEach((dot, index) => {
      dot.life = 0;
      write(index, HIDDEN_SCALE, 0);
    });
    liveCount = 0;
    flush();
  }

  hideAll();

  return {
    dots,

    splash(at, color, seed) {
      const turn = (seed % 13) / 13;
      for (let count = 0; count < DOTS_PER_SPLASH; count += 1) {
        const dot = pieces[next]!;
        if (dot.life <= 0) liveCount += 1;
        // Fibonacci sphere: an even spray in every direction, turned per orb.
        const y = 1 - ((count + 0.5) / DOTS_PER_SPLASH) * 2;
        const ring = Math.sqrt(1 - y * y);
        const angle = (count + turn) * GOLDEN_ANGLE;
        const speed = DOT_SPEED_MIN + (DOT_SPEED_MAX - DOT_SPEED_MIN) * (((count * 7 + seed) % 5) / 4);
        dot.life = DOT_LIFE_SEC * (0.75 + 0.25 * ((count * 3 + seed) % 4) / 3);
        dot.position.set(at.x, at.y, at.z);
        dot.velocity.set(Math.cos(angle) * ring * speed, y * speed, Math.sin(angle) * ring * speed);
        dot.color.copy(color);
        if (count % 2 === 0) dot.color.lerp(white, WHITE_MIX);
        write(next, 1, 1);
        next = (next + 1) % DOT_COUNT;
      }
      flush();
    },

    update(dtSec) {
      if (liveCount === 0) return;
      const drag = Math.exp(-DOT_DRAG * dtSec);
      pieces.forEach((dot, index) => {
        if (dot.life <= 0) return;
        dot.life -= dtSec;
        if (dot.life <= 0) {
          liveCount -= 1;
          write(index, HIDDEN_SCALE, 0);
          return;
        }
        dot.velocity.multiplyScalar(drag);
        dot.velocity.y += DOT_GRAVITY * dtSec;
        dot.position.addScaledVector(dot.velocity, dtSec);
        const left = Math.min(1, dot.life / DOT_LIFE_SEC);
        write(index, 0.35 + 0.65 * left, left);
      });
      flush();
    },

    hide() {
      if (liveCount > 0) hideAll();
    },

    get liveCount() {
      return liveCount;
    },
  };
}
