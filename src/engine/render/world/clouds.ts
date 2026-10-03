/**
 * Drifting low-poly clouds.
 *
 * The whole layer is one InstancedMesh, so the cost is a single draw call and a
 * couple of thousand triangles no matter how many clouds are up there.
 *
 * They occupy a real volume rather than sitting in a band at the horizon: near
 * ones are low, small and scroll at nearly half the world's speed, distant ones
 * are high, large and barely move. That difference in rate is what makes them
 * read as objects you are travelling under rather than as painted backdrop.
 *
 * Worth knowing: the camera aims about 7 degrees down, so the top of the frame
 * only reaches ~24 degrees above horizontal. A cloud stays in shot only while it
 * is further ahead than about 2.25x its height above the camera -- they sweep up
 * out of the picture rather than passing directly overhead.
 */

import type * as THREE_NS from 'three';

import type { Palette } from '@/engine/render/world/palette';
import type { ThreeModule } from '@/engine/types';

import { createRng, range } from '@/engine/render/world/rng';

const CLOUD_COUNT = 10;
/** Reaches behind the camera, so clouds leave the frame instead of stopping short. */
const CLOUD_START_Z = 140;
const CLOUD_SPAN = 840;
const CLOUD_MIN_Y = 34;
const CLOUD_MAX_Y = 120;
const CLOUD_X_SPREAD = 260;

/** Scroll rate as a fraction of the world's, at the lowest and highest altitude. */
const NEAR_PARALLAX = 0.5;
const FAR_PARALLAX = 0.11;
const DRIFT_SPEED = 0.6;
const Z_TRANSLATION_OFFSET = 14;

export interface CloudOptions {
  seed?: number;
  count?: number;
}

export interface CloudRefs {
  mesh: THREE_NS.InstancedMesh;
  scroll(distance: number, elapsedMs: number): void;
  setVisible(visible: boolean): void;
}

export function addClouds(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  palette: Palette,
  options: CloudOptions = {},
): CloudRefs {
  const { seed = 0xc10d, count = CLOUD_COUNT } = options;
  const geometry = buildCloudGeometry(THREE);

  // Unlit, like the horizon ridges: directional lighting on a faceted blob makes
  // it read as a boulder, so the shape is carried by baked vertex shading.
  // Unfogged: they are sky, and the short ground fog would erase all of them.
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: false,
  });
  // The sky's haze, lifted past 1 and kept out of tone mapping, so the baked
  // shading's undersides stay soft cream instead of grey. Fog used to do this
  // wash before the fog was shortened; the tops simply clip to the haze.
  material.color.set(palette.sky.haze).multiplyScalar(1.35);
  material.toneMapped = false;

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  scene.add(mesh);

  const rng = createRng(seed);
  const farZ = CLOUD_START_Z - CLOUD_SPAN;
  const baseZ = new Float32Array(count);
  const parallax = new Float32Array(count);
  const drift = new Float32Array(count);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);

  for (let index = 0; index < count; index += 1) {
    const y = range(rng, CLOUD_MIN_Y, CLOUD_MAX_Y);
    const altitude = (y - CLOUD_MIN_Y) / (CLOUD_MAX_Y - CLOUD_MIN_Y);
    // High clouds are bigger, which is what keeps them readable once they are
    // far enough away to be worth drawing at all.
    const size = range(rng, 9, 15) + altitude * 16;

    position.set(range(rng, -CLOUD_X_SPREAD, CLOUD_X_SPREAD), y, farZ + rng() * CLOUD_SPAN);
    quaternion.setFromAxisAngle(axis, rng() * Math.PI * 2);
    scale.set(size, size * range(rng, 0.44, 0.7), size * range(rng, 0.7, 1.15));
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);

    baseZ[index] = position.z;
    parallax[index] = NEAR_PARALLAX + (FAR_PARALLAX - NEAR_PARALLAX) * altitude;
    drift[index] = range(rng, 0.5, 1.4);
  }
  mesh.instanceMatrix.needsUpdate = true;

  return {
    mesh,

    /**
     * Each cloud advances at its own rate, so the layer separates in depth as
     * the run goes on instead of sliding along as one sheet.
     */
    scroll(distance: number, elapsedMs: number) {
      const seconds = elapsedMs / 1000;
      const array = mesh.instanceMatrix.array;

      for (let index = 0; index < count; index += 1) {
        const travelled = distance * parallax[index] + seconds * DRIFT_SPEED * drift[index];
        const shifted = baseZ[index] - farZ + travelled;
        array[index * 16 + Z_TRANSLATION_OFFSET] = farZ + (shifted % CLOUD_SPAN);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },

    setVisible(visible: boolean) {
      mesh.visible = visible;
    },

  };
}

/**
 * Overlapping lumps merged into one geometry. Done by hand rather than pulling
 * in BufferGeometryUtils for a single call. Enough of them to have a silhouette
 * that survives being seen from below and close up.
 */
function buildCloudGeometry(THREE: ThreeModule): THREE_NS.BufferGeometry {
  const blobs = [
    { x: 0, y: 0, z: 0, r: 1 },
    { x: 0.95, y: -0.18, z: 0.12, r: 0.7 },
    { x: -0.9, y: -0.22, z: -0.08, r: 0.64 },
    { x: 0.2, y: 0.38, z: -0.22, r: 0.58 },
    { x: -0.35, y: 0.3, z: 0.3, r: 0.5 },
    { x: 1.55, y: -0.35, z: -0.15, r: 0.42 },
    { x: -1.5, y: -0.34, z: 0.18, r: 0.38 },
  ];

  const chunks = blobs.map(({ x, y, z, r }) => {
    const blob = new THREE.IcosahedronGeometry(r, 0).toNonIndexed();
    blob.translate(x, y, z);
    return blob.attributes.position.array;
  });

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const positions = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    positions.set(chunk, offset);
    offset += chunk.length;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.BufferAttribute(bakeCloudShading(positions), 3));
  return geometry;
}

/**
 * Bright warm top, cool shaded underside. The range has to be wide: a nearly
 * white cloud against a pale sky has no silhouette at all, and there is no light
 * touching these to give them one.
 */
function bakeCloudShading(positions: ArrayLike<number>): Float32Array {
  const colors = new Float32Array(positions.length);
  let minY = Infinity;
  let maxY = -Infinity;

  for (let index = 1; index < positions.length; index += 3) {
    minY = Math.min(minY, positions[index]);
    maxY = Math.max(maxY, positions[index]);
  }

  const spread = Math.max(1e-6, maxY - minY);
  for (let index = 0; index < positions.length; index += 3) {
    const t = (positions[index + 1] - minY) / spread;
    const shade = 0.58 + 0.42 * t;
    // Undersides pick up a little sky, tops stay neutral.
    const cool = (1 - t) * 0.06;
    colors[index] = shade - cool * 0.5;
    colors[index + 1] = shade - cool * 0.2;
    colors[index + 2] = shade + cool;
  }

  return colors;
}
