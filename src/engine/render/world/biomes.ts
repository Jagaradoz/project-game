/**
 * The biome list.
 *
 * One biome: Whispering Pines. The stage catalogue in src/lib/api/catalog.ts
 * derives from this list, so it is also the unlock order.
 */

import { GOLDEN_FOREST } from '@/engine/render/world/palette';

export const BIOMES = [GOLDEN_FOREST] as const;
