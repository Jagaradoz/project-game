/** The biome catalogue, derived from the engine's own biome list. */

import { test, describe, expect, it } from 'vitest';
import assert from 'node:assert/strict';

import { BIOMES } from '@/engine/render/world/biomes';
import {
  BIOME_CATALOG,
  FIRST_BIOME_ID,
  STAGES_PER_BIOME,
  biomeIndex,
  biomeName,
  isKnownBiome,
  isValidStageNumber,
} from '@/lib/api/catalog';

test('the catalogue mirrors the engine, in order', () => {
  // Derived, not restated: adding a biome to the renderer must add it here too.
  assert.deepEqual(
    BIOME_CATALOG.map((entry) => entry.biomeId),
    BIOMES.map((biome) => biome.id),
  );
  assert.deepEqual(
    BIOME_CATALOG.map((entry) => entry.name),
    BIOMES.map((biome) => biome.name),
  );
});

test('Training is one biome with a single stage', () => {
  assert.equal(STAGES_PER_BIOME, 1);
  assert.equal(BIOME_CATALOG.length, 1);
});

test('biomeIndex gives the unlock order and -1 for a stranger', () => {
  assert.equal(biomeIndex(FIRST_BIOME_ID), 0);
  assert.equal(biomeIndex('atlantis'), -1);
});

test('biomeName falls back to the id rather than rendering undefined', () => {
  assert.equal(biomeName(FIRST_BIOME_ID), BIOME_CATALOG[0]!.name);
  assert.equal(biomeName('atlantis'), 'atlantis');
});

test('isKnownBiome guards ids that came from storage', () => {
  assert.equal(isKnownBiome(FIRST_BIOME_ID), true);
  assert.equal(isKnownBiome('atlantis'), false);
  assert.equal(isKnownBiome(''), false);
});

test('the only valid stage number is the Training stage', () => {
  assert.equal(isValidStageNumber(1), true);
  assert.equal(isValidStageNumber(STAGES_PER_BIOME), true);
  assert.equal(isValidStageNumber(0), false);
  assert.equal(isValidStageNumber(STAGES_PER_BIOME + 1), false);
  assert.equal(isValidStageNumber(1.5), false);
  assert.equal(isValidStageNumber(Number.NaN), false);
});

import { BROADLEAF_TREES, TOP_MODELS, planPlateauDecorations, readPlateau, wrappedSceneryZ, type SceneryPlacement } from '@/engine/render/world/catalog';
import { createRng } from '@/engine/render/world/rng';

const sources = new Map(TOP_MODELS.map((model) => [model, { radius: model.startsWith('tree_') ? 0.8 : 0.25 }]));
const platform: SceneryPlacement = { model: 'rock_largeA', x: 20, y: 0.5, z: 19.8, rotationY: 1.3, scale: 4 };
const plateau = { plateauY: 0.8, plateauRadius: 0.85 };

describe('authored outcrop tops', () => {
  it('reproduces a seed and mixes trees, stones and grass across the outcrops', () => {
    const a = planPlateauDecorations(createRng(24289), platform, plateau, sources);
    expect(a).toEqual(planPlateauDecorations(createRng(24289), platform, plateau, sources));
    expect(a).not.toEqual(planPlateauDecorations(createRng(24290), platform, plateau, sources));
    const layouts = Array.from({ length: 20 }, (_, seed) => planPlateauDecorations(createRng(seed * 987654), platform, plateau, sources)).flat();
    expect(layouts.some((entry) => BROADLEAF_TREES.includes(entry.model))).toBe(true);
    expect(layouts.some((entry) => entry.model.startsWith('stone_'))).toBe(true);
    expect(layouts.some((entry) => entry.model === 'grass')).toBe(true);
  });

  it('keeps complete footprints on the flat surface, at its exact scaled elevation, without overlap', () => {
    const placements = planPlateauDecorations(createRng(24289), platform, plateau, sources);
    expect(placements.length).toBeGreaterThan(5);
    placements.forEach((entry, index) => {
      const radius = sources.get(entry.model)!.radius * entry.scale;
      expect(Math.hypot(entry.x - platform.x, entry.z - platform.z) + radius).toBeLessThanOrEqual(plateau.plateauRadius * platform.scale);
      expect(entry.y).toBe(platform.y + plateau.plateauY * platform.scale);
      expect(entry.anchorZ).toBe(platform.z);
      for (const other of placements.slice(index + 1)) {
        expect(Math.hypot(entry.x - other.x, entry.z - other.z)).toBeGreaterThanOrEqual(radius + sources.get(other.model)!.radius * other.scale + 0.08 - 1e-10);
      }
    });
  });

  it('rotates decorations with their platform and preserves relative z through the wrap seam', () => {
    const unrotated = { ...platform, rotationY: 0 };
    const a = planPlateauDecorations(createRng(5), unrotated, plateau, sources);
    const b = planPlateauDecorations(createRng(5), platform, plateau, sources);
    expect(b).toHaveLength(a.length);
    b.forEach((entry, index) => {
      const original = a[index]!;
      const localX = original.x - platform.x, localZ = original.z - platform.z;
      expect(entry.x - platform.x).toBeCloseTo(localX * Math.cos(platform.rotationY) + localZ * Math.sin(platform.rotationY));
      expect(entry.z - platform.z).toBeCloseTo(-localX * Math.sin(platform.rotationY) + localZ * Math.cos(platform.rotationY));
      for (const distance of [0, 0.3, 160.3, 320.3]) {
        const parentZ = wrappedSceneryZ(platform.z, distance, -140, 160);
        const childZ = wrappedSceneryZ(entry.anchorZ!, distance, -140, 160) + entry.z - entry.anchorZ!;
        expect(childZ - parentZ).toBeCloseTo(entry.z - platform.z);
      }
    });
  });

  it('skips missing and oversized props and rejects malformed plateau metadata', () => {
    expect(planPlateauDecorations(createRng(5), platform, plateau, new Map())).toEqual([]);
    const oversized = new Map(TOP_MODELS.map((model) => [model, { radius: 100 }]));
    expect(planPlateauDecorations(createRng(5), platform, plateau, oversized)).toEqual([]);
    expect(readPlateau(plateau)).toEqual(plateau);
    for (const data of [{}, { plateauY: 1, plateauRadius: -1 }, { plateauY: NaN, plateauRadius: 1 }, { plateauY: 1, plateauRadius: Infinity }]) {
      expect(readPlateau(data)).toBeUndefined();
    }
  });
});
