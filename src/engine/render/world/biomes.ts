/**
 * Biome progression.
 *
 * A run travels through biomes rather than staying in one wood. Two things
 * change: the palette, which crossfades continuously so there is never a visible
 * step, and the scatter set, which switches at the midpoint of that crossfade --
 * where the two biomes look most alike and a swap is hardest to notice.
 *
 * Autumn deliberately reuses the forest's models. With no textures anywhere in
 * the kit, turning the same wood from summer to autumn is a colour table, and it
 * costs nothing to download.
 */

import type { Palette } from '@/engine/render/world/palette';

import { GOLDEN_FOREST } from '@/engine/render/world/palette';

/** Metres travelled in each biome before the next one begins. */
export const BIOME_LENGTH = 700;
/** Metres over which one biome dissolves into the next. */
export const BIOME_BLEND = 160;

const AUTUMN = {
  id: 'autumn',
  name: 'Emberfall',
  scatterSet: 'forest',
  sky: { haze: '#fff0dc', glow: '#ffb86d', mid: '#ecc6a7', zenith: '#c9a89d' },
  light: {
    sun: '#ffe0ae',
    sunIntensity: 3.0,
    hemiSky: '#fff0dc',
    hemiGround: '#8a5b35',
    hemiIntensity: 1.1,
    rim: '#ffcf9b',
    rimIntensity: 0.5,
    exposure: 1.02,
  },
  fog: { color: '#fff0dc', near: 85, far: 270 },
  ground: {
    trail: '#a9784e',
    trailEdge: '#17120e',
    verge: '#85713e',
    grass: '#737a3e',
    grassDeep: '#4f5730',
    meadow: '#988449',
  },
  ridge: { near: '#b08b6f', mid: '#d0ad8e', far: '#edd6b9' },
  accents: {
    marker: '#fe6601',
    mote: '#ffb870',
    player: '#fe6601',
    enemy: '#fff3e2',
    enemyTrim: '#17120e',
    bullet: '#fff3e2',
  },
  kit: {
    grass: '#8b8849',
    leafsGreen: '#ed9a35',
    leafsDark: '#b75a29',
    leafsFall: '#fe6601',
    dirt: '#a57950',
    dirtDark: '#704c31',
    stone: '#c3ae97',
    stoneDark: '#796b5b',
    wood: '#ae7642',
    woodBark: '#704728',
    woodBarkDark: '#49301e',
    woodDark: '#17120e',
    woodBirch: '#fff0dc',
    woodInner: '#d39e5c',
    water: '#6a999b',
    corn: '#e8bd5e',
    colorRed: '#fe6601',
    colorRedDark: '#a84314',
    colorYellow: '#f6bd4f',
    colorPurple: '#9a7298',
    colorWhite: '#fff3e2',
    colorTan: '#e7bd8c',
  },
};

const HIGHLANDS = {
  id: 'highlands',
  name: 'Grey Crags',
  scatterSet: 'highlands',
  sky: { haze: '#f1eee4', glow: '#ffe0b5', mid: '#d8d4c7', zenith: '#a9b0aa' },
  light: {
    sun: '#fff0d7',
    sunIntensity: 2.7,
    hemiSky: '#f1eee4',
    hemiGround: '#68685a',
    hemiIntensity: 1.2,
    rim: '#f8dec0',
    rimIntensity: 0.6,
    exposure: 1.0,
  },
  fog: { color: '#f1eee4', near: 75, far: 250 },
  ground: {
    trail: '#918473',
    trailEdge: '#17120e',
    verge: '#677057',
    grass: '#526d55',
    grassDeep: '#354e42',
    meadow: '#78836b',
  },
  ridge: { near: '#7c8883', mid: '#aab3aa', far: '#d4d7cb' },
  accents: {
    marker: '#fe6601',
    mote: '#ffb870',
    player: '#fe6601',
    enemy: '#fff3e2',
    enemyTrim: '#17120e',
    bullet: '#fff3e2',
  },
  kit: {
    grass: '#5e7658',
    leafsGreen: '#4c704e',
    leafsDark: '#2d4d39',
    leafsFall: '#a47849',
    dirt: '#918572',
    dirtDark: '#665d4e',
    stone: '#b4b7ae',
    stoneDark: '#68736f',
    wood: '#9b805b',
    woodBark: '#62523f',
    woodBarkDark: '#43392d',
    woodDark: '#17120e',
    woodBirch: '#f1eee4',
    woodInner: '#baa072',
    water: '#6a989b',
    corn: '#d9bb70',
    colorRed: '#fe6601',
    colorRedDark: '#a84314',
    colorYellow: '#efc45c',
    colorPurple: '#89799b',
    colorWhite: '#fff3e2',
    colorTan: '#d4c5a4',
  },
};

const OASIS = {
  id: 'oasis',
  name: 'Sunwash Dunes',
  scatterSet: 'oasis',
  sky: { haze: '#fff3e2', glow: '#ffd07c', mid: '#f8d7ac', zenith: '#d5b894' },
  light: {
    sun: '#fff1cf',
    sunIntensity: 3.4,
    hemiSky: '#fff3e2',
    hemiGround: '#ad824c',
    hemiIntensity: 1.15,
    rim: '#ffcd8c',
    rimIntensity: 0.5,
    exposure: 1.04,
  },
  fog: { color: '#fff3e2', near: 95, far: 290 },
  ground: {
    trail: '#c69b66',
    trailEdge: '#17120e',
    verge: '#b79c60',
    grass: '#b69c62',
    grassDeep: '#897447',
    meadow: '#d1b77a',
  },
  ridge: { near: '#d1a978', mid: '#e8c69b', far: '#f4ddbc' },
  accents: {
    marker: '#fe6601',
    mote: '#fead61',
    player: '#fe6601',
    enemy: '#fff3e2',
    enemyTrim: '#17120e',
    bullet: '#fff3e2',
  },
  kit: {
    grass: '#aa9456',
    leafsGreen: '#648d4d',
    leafsDark: '#416a3e',
    leafsFall: '#dcaa5b',
    dirt: '#c9a16d',
    dirtDark: '#98754b',
    stone: '#dac6a7',
    stoneDark: '#a78e70',
    wood: '#bc9257',
    woodBark: '#8c6740',
    woodBarkDark: '#614629',
    woodDark: '#17120e',
    woodBirch: '#fff3e2',
    woodInner: '#dcaf77',
    water: '#4d9b9e',
    corn: '#edc968',
    colorRed: '#fe6601',
    colorRedDark: '#a84314',
    colorYellow: '#f6c652',
    colorPurple: '#9975a1',
    colorWhite: '#fff3e2',
    colorTan: '#edd2a5',
  },
};

export const BIOMES = [GOLDEN_FOREST, AUTUMN, HIGHLANDS, OASIS];

/** Palette sections that are pure name -> hex maps, so they blend uniformly. */
const HEX_GROUPS = ['sky', 'ground', 'ridge', 'accents', 'kit'] as const;

type HexGroup = Record<string, string>;
type MixedGroup = Record<string, string | number>;

/**
 * Which biome a distance falls in, and how far it has dissolved into the next.
 * `t` is 0 for most of a biome and ramps to 1 across the final BIOME_BLEND
 * metres.
 */
export interface BiomeBlend {
  from: Palette;
  to: Palette;
  t: number;
}

export function resolveBiome(distance: number): BiomeBlend {
  const total = Math.max(0, distance);
  const index = Math.floor(total / BIOME_LENGTH) % BIOMES.length;
  const into = total % BIOME_LENGTH;
  const blendStart = BIOME_LENGTH - BIOME_BLEND;
  const t = into <= blendStart ? 0 : (into - blendStart) / BIOME_BLEND;

  return {
    from: BIOMES[index]!,
    to: BIOMES[(index + 1) % BIOMES.length]!,
    t,
  };
}

/** The scatter set to show: swapped at the halfway point of the crossfade. */
export function activeScatterSet({ from, to, t }: BiomeBlend): string {
  return (t < 0.5 ? from : to).scatterSet;
}

/**
 * Blends two palettes into `out`, reusing the same object every frame so a
 * per-frame palette update allocates nothing.
 */
export function blendPalettes(
  from: Palette,
  to: Palette,
  t: number,
  out: Palette = structuredClone(from),
): Palette {
  if (t <= 0) return copyPalette(from, out);
  if (t >= 1) return copyPalette(to, out);

  out.id = t < 0.5 ? from.id : to.id;
  out.name = t < 0.5 ? from.name : to.name;

  for (const group of HEX_GROUPS) {
    const fromGroup = from[group] as HexGroup;
    const toGroup = to[group] as HexGroup;
    const outGroup = out[group] as HexGroup;
    for (const key of Object.keys(fromGroup)) {
      outGroup[key] = mixHex(fromGroup[key]!, toGroup[key]!, t);
    }
  }

  // `light` mixes colours and scalars in the same object, so it is split out.
  const fromLight = from.light as MixedGroup;
  const toLight = to.light as MixedGroup;
  const outLight = out.light as MixedGroup;
  for (const key of Object.keys(fromLight)) {
    const a = fromLight[key]!;
    const b = toLight[key]!;
    outLight[key] = typeof a === 'number' && typeof b === 'number'
      ? a + (b - a) * t
      : mixHex(a as string, b as string, t);
  }

  out.fog.color = mixHex(from.fog.color, to.fog.color, t);
  out.fog.near = from.fog.near + (to.fog.near - from.fog.near) * t;
  out.fog.far = from.fog.far + (to.fog.far - from.fog.far) * t;

  return out;
}

function copyPalette(source: Palette, out: Palette): Palette {
  out.id = source.id;
  out.name = source.name;
  for (const group of [...HEX_GROUPS, 'light'] as const) {
    Object.assign(out[group], source[group]);
  }
  Object.assign(out.fog, source.fog);
  return out;
}

/** Straight component mix. Good enough at these small hue distances. */
function mixHex(fromHex: string, toHex: string, t: number): string {
  const a = parseInt(fromHex.slice(1), 16);
  const b = parseInt(toHex.slice(1), 16);
  const mix = (shift: number) => {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    return Math.round(from + (to - from) * t);
  };
  return `#${((1 << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).slice(1)}`;
}
