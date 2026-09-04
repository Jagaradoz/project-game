/**
 * Drifting low-poly clouds.
 *
 * The whole layer is one InstancedMesh, so the cost is a single draw call and a
 * few hundred triangles no matter how many clouds are up there -- cheap enough
 * that it survives the low quality tier being about shadows, not this.
 *
 * Deliberately not bent by the trail curve: clouds read as being at infinity,
 * and swinging them sideways with the path looks wrong.
 */

import { createRng, range } from './rng.js?v=1.10.0';

const CLOUD_COUNT = 16;
const CLOUD_SPAN = 500;
/** Always well ahead of the camera: a cloud overhead is enormous and reads as a rock. */
const CLOUD_START_Z = -120;
const CLOUD_MIN_Y = 62;
const CLOUD_MAX_Y = 132;
const CLOUD_X_SPREAD = 240;
const DRIFT_SPEED = 0.55;
const Z_TRANSLATION_OFFSET = 14;

export function addClouds(THREE, scene, palette, options = {}) {
  const { seed = 0xc10d, count = CLOUD_COUNT } = options;
  const geometry = buildCloudGeometry(THREE);
  // Unlit, like the horizon ridges. Directional lighting on a faceted blob makes
  // it read as a boulder; the shape is carried by baked vertex shading instead.
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: false,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  scene.add(mesh);

  const rng = createRng(seed);
  const farZ = CLOUD_START_Z - CLOUD_SPAN;
  const baseZ = new Float32Array(count);
  const drift = new Float32Array(count);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);

  for (let index = 0; index < count; index += 1) {
    const size = range(rng, 13, 30);
    position.set(range(rng, -CLOUD_X_SPREAD, CLOUD_X_SPREAD), range(rng, CLOUD_MIN_Y, CLOUD_MAX_Y), farZ + rng() * CLOUD_SPAN);
    quaternion.setFromAxisAngle(axis, rng() * Math.PI * 2);
    scale.set(size, size * range(rng, 0.35, 0.6), size * range(rng, 0.7, 1.1));
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);

    baseZ[index] = position.z;
    drift[index] = range(rng, 0.6, 1.5);
  }
  mesh.instanceMatrix.needsUpdate = true;

  return {
    mesh,

    /**
     * Clouds barely parallax -- they are meant to be far away -- and drift on
     * their own so the sky is never completely still.
     */
    scroll(distance, elapsedMs) {
      const scrolled = distance * 0.05 + (elapsedMs / 1000) * DRIFT_SPEED;
      const array = mesh.instanceMatrix.array;

      for (let index = 0; index < count; index += 1) {
        const shifted = baseZ[index] - farZ + scrolled * drift[index];
        array[index * 16 + Z_TRANSLATION_OFFSET] = farZ + (shifted % CLOUD_SPAN);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },

    setVisible(visible) {
      mesh.visible = visible;
    },

    applyPalette(next) {
      // Tinted towards the sky's own haze so clouds belong to the sky they sit in.
      material.color.set(next.sky.glow).lerp(new THREE.Color('#ffffff'), 0.72);
    },
  };
}

/**
 * A few overlapping lumps merged into one geometry. Done by hand rather than
 * pulling in BufferGeometryUtils for a single call.
 */
function buildCloudGeometry(THREE) {
  const blobs = [
    { x: 0, y: 0, z: 0, r: 1 },
    { x: 0.85, y: -0.15, z: 0.1, r: 0.68 },
    { x: -0.8, y: -0.2, z: -0.05, r: 0.6 },
    { x: 0.15, y: 0.35, z: -0.2, r: 0.55 },
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

/** Bright on top, faintly cool underneath. Enough form without a light touching it. */
function bakeCloudShading(positions) {
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
    const shade = 0.78 + 0.22 * t;
    colors[index] = shade;
    colors[index + 1] = shade;
    colors[index + 2] = shade * 0.99 + 0.01;
  }

  return colors;
}
