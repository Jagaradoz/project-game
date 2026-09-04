/**
 * Seeded randomness for world building.
 *
 * Deliberately separate from the LCG inside the reducer: that one is part of the
 * game's determinism contract (spawn sequences must be reproducible in tests),
 * and scenery layout must never be able to perturb it. Same idea, different
 * stream.
 */

const MULTIPLIER = 1664525;
const INCREMENT = 1013904223;
const MODULUS = 2 ** 32;

/** @returns {() => number} a generator of floats in [0, 1). */
export function createRng(seed = 1) {
  let state = seed >>> 0;
  return function next() {
    state = (state * MULTIPLIER + INCREMENT) >>> 0;
    return state / MODULUS;
  };
}

/** Float in [min, max). */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}
