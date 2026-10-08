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
  grass: '#4fa83c',
  leafsGreen: '#3fb04a',
  leafsDark: '#1f7d42',
  leafsFall: '#ff8a1f',
  dirt: '#c98a4e',
  dirtDark: '#8a5530',
  stone: '#b8b1a2',
  stoneDark: '#726b60',
  stoneMid: '#958e80',
  stoneWarm: '#c6b498',
  wood: '#d08a45',
  woodBark: '#7d4a28',
  woodBarkDark: '#4f2e1a',
  woodDark: '#17120e',
  woodBirch: '#fff3e2',
  woodInner: '#d3a36b',
  water: '#2fc6e0',
  waterDeep: '#1597b8',
  waterLight: '#7fe6f2',
  corn: '#ffcc33',
  colorRed: '#ff3b4f',
  colorRedDark: '#c0213a',
  colorYellow: '#ffd23a',
  colorPurple: '#b05cff',
  colorWhite: '#fff3e2',
  colorTan: '#ffcf8f',
};

/**
 * Storybook woodland in full colour: a clear blue sky, minty ridges, bright
 * saturated greens and a warm orange trail, so neon orbs and spells sit in a
 * world that is just as cheerful.
 * The horizon band of the sky is deliberately the same colour as the fog so
 * that ground, trees and sky meet without a seam.
 */
/** Material-name -> hex colour. This is what makes the Kenney kit recolourable. */
export type KitPalette = Record<string, string>;

export const GOLDEN_FOREST = {
  id: 'forest',
  name: 'Whispering Pines',

  sky: {
    haze: '#e3f6ff',
    glow: '#fff3b0',
    mid: '#9ddcff',
    zenith: '#3fa9ff',
  },

  light: {
    sun: '#fff2cf',
    sunIntensity: 3.3,
    hemiSky: '#c4e9ff',
    hemiGround: '#4f8f3a',
    hemiIntensity: 1.25,
    rim: '#ffd6f2',
    rimIntensity: 0.65,
    exposure: 1.05,
  },

  // Short on purpose: the forest is dense to the fog line and nothing past it
  // is drawn. The scatter span is sized so props recycle inside full fog.
  fog: {
    color: '#e3f6ff',
    near: 30,
    far: 150,
  },

  ground: {
    trail: '#c98a4e',
    // Damp soil where the dirt meets the grass, not an outline.
    trailEdge: '#7a4524',
    verge: '#62b33c',
    grass: '#4aa63a',
    grassDeep: '#237a36',
    meadow: '#86d651',
    pebble: '#f0e2c2',
  },

  ridge: {
    near: '#55b87a',
    mid: '#8fd3b8',
    far: '#c3ebf0',
  },

  accents: {
    marker: '#fe6601',
    mote: '#ffe36b',
    player: '#fe6601',
    enemy: '#fff3e2',
    enemyTrim: '#17120e',
    bullet: '#fff3e2',
    /**
     * Score orbs pick from these by id, so a burst reads as a handful of gems.
     * Fully saturated neon on purpose: the forest is all soft greens and browns,
     * and a pickup should be the loudest colour on screen.
     */
    orbs: ['#ffe100', '#00e1ff', '#ff1f9d', '#2bff4f', '#9d4dff', '#ff6a00'],
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
