/**
 * DiceBear Critters placeholders. We store a seed, not an image: the same seed
 * always draws the same creature, and changing it is how a player picks a new
 * one. CC0, so the style is fine to ship in this project.
 *
 * HTTP API, not the npm package -- zero extra weight, and SVG stays sharp at
 * every avatar size. If the public API ever disappears, swap this URL builder.
 */

export const CRITTER_STYLE = 'critters';
export const CRITTER_API = `https://api.dicebear.com/10.x/${CRITTER_STYLE}/svg`;

/** Charcoal fill so a transparent SVG does not vanish on the dark chrome. */
const CRITTER_BACKGROUND = '1a2029';

export const AVATAR_SEED_MIN = 1;
export const AVATAR_SEED_MAX = 64;
export const AVATAR_CANDIDATE_COUNT = 12;

export function critterSrc(seed: string): string {
  const params = new URLSearchParams({
    seed,
    size: '128',
    backgroundColor: CRITTER_BACKGROUND,
  });
  return `${CRITTER_API}?${params.toString()}`;
}

export function randomAvatarSeed(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Current pick first, then fresh random seeds, de-duplicated. */
export function avatarCandidates(selected: string, count = AVATAR_CANDIDATE_COUNT): string[] {
  const seeds = new Set<string>([selected]);
  let guard = 0;
  while (seeds.size < count && guard < count * 8) {
    seeds.add(randomAvatarSeed());
    guard += 1;
  }
  return [...seeds];
}

/** Accounts that predate avatarSeed still get a stable creature from their id. */
export function avatarSeedFor(user: { id: string; avatarSeed?: string }): string {
  return user.avatarSeed && user.avatarSeed.length > 0 ? user.avatarSeed : user.id;
}
