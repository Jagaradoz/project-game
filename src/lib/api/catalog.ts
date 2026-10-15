/**
 * The biome and stage catalogue.
 *
 * Derived from the engine's BIOMES rather than restated, so adding a biome to
 * the renderer also makes its name available in results -- there is no second
 * list to remember. Importing it here is safe: biomes.ts and palette.ts import
 * `three` only as a type, so nothing pulls WebGL into a page or a test.
 *
 * Game Mode uses one forest biome with a single endless stage.
 */

import { BIOMES } from '@/engine/render/world/biomes';

export const STAGES_PER_BIOME = 1;

export interface BiomeCatalogEntry {
  biomeId: string;
  name: string;
}

export const BIOME_CATALOG: readonly BiomeCatalogEntry[] = BIOMES.map((biome) => ({
  biomeId: biome.id,
  name: biome.name,
}));

/** Position in the catalogue, or -1 for an unknown id. */
export function biomeIndex(biomeId: string): number {
  return BIOME_CATALOG.findIndex((entry) => entry.biomeId === biomeId);
}

export function biomeName(biomeId: string): string {
  return BIOME_CATALOG.find((entry) => entry.biomeId === biomeId)?.name ?? biomeId;
}

export function isKnownBiome(biomeId: string): boolean {
  return biomeIndex(biomeId) !== -1;
}

export function isValidStageNumber(stageNumber: number): boolean {
  return Number.isInteger(stageNumber) && stageNumber >= 1 && stageNumber <= STAGES_PER_BIOME;
}

export const FIRST_BIOME_ID = BIOME_CATALOG[0]?.biomeId ?? 'forest';
