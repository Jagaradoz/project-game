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
  grass: '#63834a',
  leafsGreen: '#537d3f',
  leafsDark: '#2e5433',
  leafsFall: '#e48b3a',
  dirt: '#a98055',
  dirtDark: '#715338',
  stone: '#b8b1a2',
  stoneDark: '#726b60',
  wood: '#b9864a',
  woodBark: '#765033',
  woodBarkDark: '#493322',
  woodDark: '#17120e',
  woodBirch: '#fff3e2',
  woodInner: '#d3a36b',
  water: '#5e9ea5',
  waterDeep: '#3f7f89',
  waterLight: '#86c3c6',
  corn: '#e8bb63',
  colorRed: '#fe6601',
  colorRedDark: '#a84314',
  colorYellow: '#f5c75b',
  colorPurple: '#9972a5',
  colorWhite: '#fff3e2',
  colorTan: '#e7c395',
};

/**
 * Graphic woodland: cream distance, layered sage ridges, deep green canopy.
 * The horizon band of the sky is deliberately the same colour as the fog so
 * that ground, trees and sky meet without a seam.
 */
/** Material-name -> hex colour. This is what makes the Kenney kit recolourable. */
export type KitPalette = Record<string, string>;

export const GOLDEN_FOREST = {
  id: 'forest',
  name: 'Whispering Pines',

  sky: {
    haze: '#fff3e2',
    glow: '#ffd6a3',
    mid: '#e9ddc9',
    zenith: '#c9d2bc',
  },

  light: {
    sun: '#fff0d7',
    sunIntensity: 3.1,
    hemiSky: '#fff3e2',
    hemiGround: '#5c7144',
    hemiIntensity: 1.15,
    rim: '#ffe0b8',
    rimIntensity: 0.55,
    exposure: 1.0,
  },

  // Short on purpose: the forest is dense to the fog line and nothing past it
  // is drawn. The scatter span is sized so props recycle inside full fog.
  fog: {
    color: '#fff3e2',
    near: 30,
    far: 150,
  },

  ground: {
    trail: '#9e754b',
    // Damp soil where the dirt meets the grass, not an outline.
    trailEdge: '#5e4229',
    verge: '#6c8044',
    grass: '#547345',
    grassDeep: '#314f32',
    meadow: '#75915a',
    pebble: '#cfc2a3',
  },

  ridge: {
    near: '#8da17f',
    mid: '#b5c2a6',
    far: '#dcdac6',
  },

  accents: {
    marker: '#fe6601',
    mote: '#fead61',
    player: '#fe6601',
    enemy: '#fff3e2',
    enemyTrim: '#17120e',
    bullet: '#fff3e2',
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
