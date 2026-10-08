/**
 * The shared candy-gloss look of score orbs and spell balls: a procedural
 * matcap (soft diffuse, a coloured rim and a hot specular spot), so a sphere
 * reads as lit without any scene light.
 */

import type * as THREE_NS from 'three';

import type { ThreeModule } from '@/engine/types';

/** Matcap texture edge, in texels. */
const MATCAP_SIZE = 128;
/** Texel values above 1 push the tinted highlight towards white. */
const MATCAP_SPECULAR = 3;
const MATCAP_SHININESS = 40;
const MATCAP_RIM = 0.6;

/**
 * A white-based matcap: instance colour tints it, and the HDR specular spot
 * saturates past the tint so the highlight reads white on every gem colour.
 */
export function createGlossyMatcap(THREE: ThreeModule): THREE_NS.DataTexture {
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
