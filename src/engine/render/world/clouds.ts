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
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { Palette } from '@/engine/render/world/palette';
import type { ThreeModule } from '@/engine/types';

import { createRng, range } from '@/engine/render/world/rng';
import CLOUD_LAYOUT from '@/engine/render/world/cloud-layout.json';

/**
 * Layout lives in cloud-layout.json so tools/build_clouds_catalog.py can lay the same sky out in
 * Blender. startZ reaches behind the camera, so clouds leave the frame instead of stopping short;
 * near/farParallax are the scroll rate as a fraction of the world's at the lowest and highest altitude.
 */
const {
  asset: CLOUD_ASSET, seed: CLOUD_SEED, count: CLOUD_COUNT, startZ: CLOUD_START_Z, span: CLOUD_SPAN,
  minY: CLOUD_MIN_Y, maxY: CLOUD_MAX_Y, xSpread: CLOUD_X_SPREAD, nearParallax: NEAR_PARALLAX,
  farParallax: FAR_PARALLAX, driftSpeed: DRIFT_SPEED, hazeLift: HAZE_LIFT,
} = CLOUD_LAYOUT.sky;
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

export async function addClouds(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  palette: Palette,
  loader: GLTFLoader,
  options: CloudOptions = {},
): Promise<CloudRefs> {
  const { seed = CLOUD_SEED, count = CLOUD_COUNT } = options;
  const geometry = await loadCloudGeometry(loader);

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
  material.color.set(palette.sky.haze).multiplyScalar(HAZE_LIFT);
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

  let lastDistance: number | null = null;
  let lastElapsedMs: number | null = null;
  return {
    mesh,

    /**
     * Each cloud advances at its own rate, so the layer separates in depth as
     * the run goes on instead of sliding along as one sheet.
     */
    scroll(distance: number, elapsedMs: number) {
      if (!mesh.visible || (distance === lastDistance && elapsedMs === lastElapsedMs)) return;
      lastDistance = distance;
      lastElapsedMs = elapsedMs;
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
 * The cloud shape is authored in Blender (tools/build_clouds_catalog.py): overlapping
 * faceted lumps with the shading baked into vertex colours -- bright warm top, cool
 * underside -- because nothing lights these and a near-white cloud on a pale sky has
 * no silhouette without it.
 */
async function loadCloudGeometry(loader: GLTFLoader): Promise<THREE_NS.BufferGeometry> {
  const gltf = await loader.loadAsync(`/assets/models/environment/${CLOUD_ASSET}.glb`);
  let geometry: THREE_NS.BufferGeometry | undefined;
  gltf.scene.traverse((node) => {
    const mesh = node as THREE_NS.Mesh;
    if (!geometry && mesh.isMesh) geometry = mesh.geometry;
  });
  if (!geometry) throw new Error(`[clouds] ${CLOUD_ASSET}.glb has no mesh`);
  if (!geometry.getAttribute('color')) throw new Error(`[clouds] ${CLOUD_ASSET}.glb has no baked vertex colours`);
  return geometry;
}
