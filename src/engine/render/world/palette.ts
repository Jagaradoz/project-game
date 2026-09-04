/**
 * Biome palettes and the Kenney material recolour map.
 *
 * The nature kit ships no textures at all: every model is 5-17 KB of geometry
 * plus a handful of flat materials named for what they represent (`grass`,
 * `leafsDark`, `woodBark`). Colour is therefore a lookup, not an art job -- the
 * same 329 models repaint themselves for a new biome by pointing at a different
 * `kit` map. It also lets us correct the kit's authored colours, which render
 * distinctly teal rather than green.
 */

/** Materials we deliberately leave alone: per-model meaning we cannot infer from a name. */
import type * as THREE_NS from 'three';

import type { ThreeModule } from '@/engine/types';

export const UNMANAGED_MATERIALS = new Set(['_defaultMat']);

const FOREST_KIT = {
  grass: '#5f9a41',
  leafsGreen: '#57a049',
  leafsDark: '#337542',
  leafsFall: '#d98b3a',
  dirt: '#9c7752',
  dirtDark: '#7c5d3f',
  stone: '#9ba4a8',
  stoneDark: '#717c82',
  wood: '#a97a40',
  woodBark: '#7b5533',
  woodBarkDark: '#5f4027',
  woodDark: '#4b3321',
  woodBirch: '#e9e3d3',
  woodInner: '#c9a16b',
  water: '#5fa8c4',
  corn: '#e0c060',
  colorRed: '#cf4239',
  colorRedDark: '#a5302c',
  colorYellow: '#f2c44a',
  colorPurple: '#9b7bd4',
  colorWhite: '#f2efe6',
  colorTan: '#e0c39a',
};

/**
 * Golden-hour woodland: warm low sun, hazy blue distance, saturated canopy.
 * The horizon band of the sky is deliberately the same colour as the fog so
 * that ground, trees and sky meet without a seam.
 */
/** Material-name -> hex colour. This is what makes the Kenney kit recolourable. */
export type KitPalette = Record<string, string>;

export const GOLDEN_FOREST = {
  id: 'forest',
  name: 'Whispering Pines',
  scatterSet: 'forest',

  sky: {
    haze: '#bcd9e0',
    glow: '#ffd9a0',
    mid: '#7fc4e8',
    zenith: '#4f9fd4',
  },

  light: {
    sun: '#fff0c8',
    sunIntensity: 3.1,
    hemiSky: '#cfe8ff',
    hemiGround: '#6b8a4a',
    hemiIntensity: 1.15,
    rim: '#a8d8ff',
    rimIntensity: 0.55,
    exposure: 1.0,
  },

  fog: {
    color: '#bcd9e0',
    near: 90,
    far: 285,
  },

  ground: {
    trail: '#8a6a45',
    trailEdge: '#6f5436',
    verge: '#5c7d3a',
    grass: '#4a7f3e',
    grassDeep: '#31653a',
    meadow: '#54874a',
  },

  ridge: {
    near: '#8fb3ae',
    mid: '#a3c3c8',
    far: '#b6cfd8',
  },

  accents: {
    marker: '#d6c7a4',
    mote: '#ffe9a8',
    player: '#3b6fd4',
    enemy: '#ded6c2',
    enemyTrim: '#b8433a',
    bullet: '#e8dfc8',
  },

  kit: FOREST_KIT,
};

/**
 * Repaints a loaded GLTF scene in place, by material name.
 *
 * Kenney models share material names across the whole kit, so a clone made
 * before this runs would share the recoloured material too -- always recolour
 * the freshly loaded source, then clone.
 */
export function repaintKitModel(
  THREE: ThreeModule,
  root: THREE_NS.Object3D,
  kit: KitPalette,
  { flatShading = true }: { flatShading?: boolean } = {},
): void {
  root.traverse((child) => {
    const mesh = child as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    const tint = (material: THREE_NS.Material) => tintKitMaterial(THREE, material, kit, flatShading);
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(tint)
      : tint(mesh.material);
  });
}

function tintKitMaterial(
  THREE: ThreeModule,
  material: THREE_NS.Material,
  kit: KitPalette,
  flatShading: boolean,
): THREE_NS.Material {
  const replacement = material.clone() as THREE_NS.MeshStandardMaterial;
  const source = material as THREE_NS.MeshStandardMaterial;
  const hex = kit[material.name];

  if (hex && !UNMANAGED_MATERIALS.has(material.name)) {
    replacement.color = new THREE.Color(hex);
  }

  replacement.flatShading = flatShading;
  replacement.roughness = source.roughness ?? 0.9;
  replacement.metalness = 0;
  replacement.needsUpdate = true;
  return replacement;
}

/** The full look of one biome: sky, light, fog, ground and the kit recolour table. */
export type Palette = typeof GOLDEN_FOREST;
