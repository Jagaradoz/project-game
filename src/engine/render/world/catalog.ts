import { range, type Rng } from '@/engine/render/world/rng';

export const ENVIRONMENT_MODEL_DIR = '/assets/models/environment';
export const BROADLEAF_TREES = ['tree_oak', 'tree_plateau', 'tree_simple', 'tree_thin'];
export const DISTANT_TREES = ['tree_pineRoundD', 'tree_pineSmallB'];
export const PALM_TREES = ['tree_palmBend', 'tree_palmTall'];
export const OUTCROPS = ['rock_largeA', 'rock_largeB', 'rock_largeC', 'rock_largeD', 'rock_smallA', 'rock_smallG'];
export const SMALL_STONES = ['stone_mediumA', 'stone_mediumPair', 'stone_mediumTrio', 'stone_smallPair', 'stone_smallPile'];
export const BIG_STONES = ['stone_bigA', 'stone_bigB', 'stone_bigC', 'stone_leaning', 'stone_bigDuo', 'stone_bigGroup'];
export const TOP_MODELS = [...BROADLEAF_TREES, ...SMALL_STONES, 'grass', 'plant_flatTall'];

export interface Plateau { plateauY: number; plateauRadius: number }
export interface SceneryPlacement {
  model: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  /** Children wrap at their platform's centre, preserving their local z offset. */
  anchorZ?: number;
}

/** Validated authored metadata; unavailable tops remain undecorated. */
export function readPlateau(data: Record<string, unknown>): Plateau | undefined {
  const { plateauY, plateauRadius } = data;
  if (typeof plateauY !== 'number' || typeof plateauRadius !== 'number' ||
    !Number.isFinite(plateauY) || !Number.isFinite(plateauRadius) ||
    plateauY <= 0 || plateauRadius <= 0) return undefined;
  return { plateauY, plateauRadius };
}

export function wrappedSceneryZ(baseZ: number, distance: number, farZ: number, span: number): number {
  const shifted = (baseZ - farZ + distance % span) % span;
  return farZ + (shifted + span) % span;
}

/** Plan only against an actual placed outcrop, using the exported safe top circle. */
export function planPlateauDecorations(
  rng: Rng,
  platform: SceneryPlacement,
  plateau: Plateau,
  sources: ReadonlyMap<string, { radius: number }>,
): SceneryPlacement[] {
  const result: SceneryPlacement[] = [];
  const occupied: { x: number; z: number; radius: number }[] = [];
  const topRadius = plateau.plateauRadius * platform.scale;
  const categories = [
    { models: BROADLEAF_TREES, count: rng() < 0.8 ? 1 : 0, scale: topRadius < 2.6 ? [0.85, 1.2] : [1.4, 2.0] },
    { models: SMALL_STONES, count: 2 + Math.floor(rng() * 3), scale: [0.9, 1.5] },
    { models: ['grass', 'plant_flatTall'], count: 5 + Math.floor(rng() * 5), scale: [1.1, 1.9] },
  ];
  const cos = Math.cos(platform.rotationY), sin = Math.sin(platform.rotationY);
  for (const category of categories) {
    let count = 0;
    for (let attempt = 0; attempt < category.count * 30 && count < category.count; attempt += 1) {
      const model = category.models[Math.floor(rng() * category.models.length)]!;
      const source = sources.get(model);
      if (!source) continue;
      const scale = range(rng, category.scale[0]!, category.scale[1]!);
      const radius = source.radius * scale;
      const available = topRadius - radius - 0.12;
      if (available <= 0) continue;
      const angle = rng() * Math.PI * 2;
      const distance = Math.sqrt(rng()) * available;
      const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
      if (occupied.some((other) => Math.hypot(x - other.x, z - other.z) < radius + other.radius + 0.08)) continue;
      occupied.push({ x, z, radius });
      result.push({
        model, scale,
        x: platform.x + x * cos + z * sin,
        y: platform.y + plateau.plateauY * platform.scale,
        z: platform.z - x * sin + z * cos,
        rotationY: platform.rotationY + rng() * Math.PI * 2,
        anchorZ: platform.anchorZ ?? platform.z,
      });
      count += 1;
    }
  }
  return result;
}
