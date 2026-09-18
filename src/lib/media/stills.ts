/**
 * Homepage banner: vector source at `public/media/hero.svg` (vectorized
 * mountain trail sunset banner, sharp at 4K). Biome stills are captured
 * by `tools/shot.mjs` into `public/media/biomes/`. The UI falls back to
 * `/icon.png` until a still exists.
 */

export const STILL_FALLBACK = '/icon.png';

export const HERO_STILL = '/media/hero.svg';

export function biomeStillSrc(biomeId: string): string {
  return `/media/biomes/${biomeId}.png`;
}
