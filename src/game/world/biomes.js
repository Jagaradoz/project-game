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

import { GOLDEN_FOREST } from './palette.js?v=1.9.0';

/** Metres travelled in each biome before the next one begins. */
export const BIOME_LENGTH = 700;
/** Metres over which one biome dissolves into the next. */
export const BIOME_BLEND = 160;

const AUTUMN = {
  id: 'autumn',
  name: 'Emberfall',
  scatterSet: 'forest',
  sky: { haze: '#e2d3c0', glow: '#ffca7e', mid: '#8fbcd6', zenith: '#5f93bd' },
  light: {
    sun: '#ffdca8',
    sunIntensity: 3.0,
    hemiSky: '#ffe3c4',
    hemiGround: '#7a5a34',
    hemiIntensity: 1.1,
    rim: '#bcd8f0',
    rimIntensity: 0.5,
    exposure: 1.02,
  },
  fog: { color: '#e2d3c0', near: 85, far: 270 },
  ground: {
    trail: '#8a6540',
    trailEdge: '#6a4c30',
    verge: '#8d7f38',
    grass: '#6d7a33',
    grassDeep: '#55632c',
    meadow: '#7c7c37',
  },
  ridge: { near: '#a8a596', mid: '#bdb7a6', far: '#d0c8b6' },
  accents: {
    marker: '#d8c49c',
    mote: '#ffd694',
    player: '#3b6fd4',
    enemy: '#ded6c2',
    enemyTrim: '#b8433a',
    bullet: '#f0e4c8',
  },
  kit: {
    grass: '#8a8a35',
    leafsGreen: '#d98b2f',
    leafsDark: '#a6532a',
    leafsFall: '#e0a03c',
    dirt: '#8f6a45',
    dirtDark: '#6f5134',
    stone: '#9a9284',
    stoneDark: '#6f695f',
    wood: '#9a6c38',
    woodBark: '#6d4a2c',
    woodBarkDark: '#54381f',
    woodDark: '#432c1b',
    woodBirch: '#e4d9c2',
    woodInner: '#c09256',
    water: '#5f96ac',
    corn: '#d8b451',
    colorRed: '#c4402f',
    colorRedDark: '#992d24',
    colorYellow: '#e8b73f',
    colorPurple: '#8f6fc0',
    colorWhite: '#eee7d8',
    colorTan: '#d8b78c',
  },
};

const HIGHLANDS = {
  id: 'highlands',
  name: 'Grey Crags',
  scatterSet: 'highlands',
  sky: { haze: '#c6d2da', glow: '#e8e0d4', mid: '#89b4d4', zenith: '#4c7fae' },
  light: {
    sun: '#f2f2ea',
    sunIntensity: 2.7,
    hemiSky: '#d8e8f4',
    hemiGround: '#5d6155',
    hemiIntensity: 1.2,
    rim: '#b6d4ec',
    rimIntensity: 0.6,
    exposure: 1.0,
  },
  fog: { color: '#c6d2da', near: 75, far: 250 },
  ground: {
    trail: '#7d7364',
    trailEdge: '#635a4d',
    verge: '#6a7350',
    grass: '#4f6547',
    grassDeep: '#3d5240',
    meadow: '#5b6a4e',
  },
  ridge: { near: '#8c9aa0', mid: '#a4b0b6', far: '#bcc6cc' },
  accents: {
    marker: '#c2c0b4',
    mote: '#e8f0f6',
    player: '#3b6fd4',
    enemy: '#ded6c2',
    enemyTrim: '#b8433a',
    bullet: '#e4ecf2',
  },
  kit: {
    grass: '#546f45',
    leafsGreen: '#3f6d46',
    leafsDark: '#2c5138',
    leafsFall: '#8a6b3a',
    dirt: '#867a68',
    dirtDark: '#665c4e',
    stone: '#a6aaa8',
    stoneDark: '#767b7c',
    wood: '#8a7756',
    woodBark: '#5f5340',
    woodBarkDark: '#463c2e',
    woodDark: '#382f24',
    woodBirch: '#dcdcd2',
    woodInner: '#a8926a',
    water: '#6fa2bc',
    corn: '#c4b070',
    colorRed: '#b8483c',
    colorRedDark: '#8e332b',
    colorYellow: '#d8bc60',
    colorPurple: '#8878b4',
    colorWhite: '#eef0ee',
    colorTan: '#cabfa6',
  },
};

const OASIS = {
  id: 'oasis',
  name: 'Sunwash Dunes',
  scatterSet: 'oasis',
  sky: { haze: '#ffe0b0', glow: '#ffd07a', mid: '#8fc8e4', zenith: '#3f92c8' },
  light: {
    sun: '#fff2d0',
    sunIntensity: 3.4,
    hemiSky: '#ffeccc',
    hemiGround: '#a8834e',
    hemiIntensity: 1.15,
    rim: '#bfe0f4',
    rimIntensity: 0.5,
    exposure: 1.04,
  },
  fog: { color: '#ffe0b0', near: 95, far: 290 },
  ground: {
    trail: '#b89460',
    trailEdge: '#9a7748',
    verge: '#bda86a',
    grass: '#a8945c',
    grassDeep: '#8d7a48',
    meadow: '#c0ab6e',
  },
  ridge: { near: '#d9bd90', mid: '#e6cfa6', far: '#f0dcbc' },
  accents: {
    marker: '#e4d2a4',
    mote: '#fff0c0',
    player: '#3b6fd4',
    enemy: '#ded6c2',
    enemyTrim: '#b8433a',
    bullet: '#fff0cc',
  },
  kit: {
    grass: '#a09150',
    leafsGreen: '#6a9a48',
    leafsDark: '#4d7a3c',
    leafsFall: '#c9a25a',
    dirt: '#c09a64',
    dirtDark: '#9c7a4c',
    stone: '#c4b494',
    stoneDark: '#9a8a6c',
    wood: '#b08a52',
    woodBark: '#8a6a40',
    woodBarkDark: '#6c5030',
    woodDark: '#54402a',
    woodBirch: '#eee0c4',
    woodInner: '#d0ac74',
    water: '#4fb0cc',
    corn: '#e0c674',
    colorRed: '#cc5540',
    colorRedDark: '#a03e30',
    colorYellow: '#f4cc58',
    colorPurple: '#a084c8',
    colorWhite: '#f6f0e0',
    colorTan: '#e4cca0',
  },
};

export const BIOMES = [GOLDEN_FOREST, AUTUMN, HIGHLANDS, OASIS];

/**
 * Which biome a distance falls in, and how far it has dissolved into the next.
 * `t` is 0 for most of a biome and ramps to 1 across the final BIOME_BLEND
 * metres.
 */
export function resolveBiome(distance) {
  const total = Math.max(0, distance);
  const index = Math.floor(total / BIOME_LENGTH) % BIOMES.length;
  const into = total % BIOME_LENGTH;
  const blendStart = BIOME_LENGTH - BIOME_BLEND;
  const t = into <= blendStart ? 0 : (into - blendStart) / BIOME_BLEND;

  return {
    from: BIOMES[index],
    to: BIOMES[(index + 1) % BIOMES.length],
    t,
  };
}

/** The scatter set to show: swapped at the halfway point of the crossfade. */
export function activeScatterSet({ from, to, t }) {
  return (t < 0.5 ? from : to).scatterSet;
}

/**
 * Blends two palettes into `out`, reusing the same object every frame so a
 * per-frame palette update allocates nothing.
 */
export function blendPalettes(from, to, t, out = structuredClone(from)) {
  if (t <= 0) return copyPalette(from, out);
  if (t >= 1) return copyPalette(to, out);

  out.id = t < 0.5 ? from.id : to.id;
  out.name = t < 0.5 ? from.name : to.name;

  for (const group of ['sky', 'ground', 'ridge', 'accents', 'kit']) {
    for (const key of Object.keys(from[group])) {
      out[group][key] = mixHex(from[group][key], to[group][key], t);
    }
  }

  for (const key of Object.keys(from.light)) {
    out.light[key] = typeof from.light[key] === 'number'
      ? from.light[key] + (to.light[key] - from.light[key]) * t
      : mixHex(from.light[key], to.light[key], t);
  }

  out.fog.color = mixHex(from.fog.color, to.fog.color, t);
  out.fog.near = from.fog.near + (to.fog.near - from.fog.near) * t;
  out.fog.far = from.fog.far + (to.fog.far - from.fog.far) * t;

  return out;
}

function copyPalette(source, out) {
  out.id = source.id;
  out.name = source.name;
  for (const group of ['sky', 'ground', 'ridge', 'accents', 'kit', 'light']) {
    Object.assign(out[group], source[group]);
  }
  Object.assign(out.fog, source.fog);
  return out;
}

/** Straight component mix. Good enough at these small hue distances. */
function mixHex(fromHex, toHex, t) {
  const a = parseInt(fromHex.slice(1), 16);
  const b = parseInt(toHex.slice(1), 16);
  const mix = (shift) => {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    return Math.round(from + (to - from) * t);
  };
  return `#${((1 << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).slice(1)}`;
}
