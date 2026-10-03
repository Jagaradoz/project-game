/** The biome catalogue, derived from the engine's own biome list. */

import { test } from 'vitest';
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

test('one biome of ten stages', () => {
  assert.equal(STAGES_PER_BIOME, 10);
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

test('stage numbers are 1..10 integers, and nothing else', () => {
  assert.equal(isValidStageNumber(1), true);
  assert.equal(isValidStageNumber(STAGES_PER_BIOME), true);
  assert.equal(isValidStageNumber(0), false);
  assert.equal(isValidStageNumber(STAGES_PER_BIOME + 1), false);
  assert.equal(isValidStageNumber(1.5), false);
  assert.equal(isValidStageNumber(Number.NaN), false);
});
