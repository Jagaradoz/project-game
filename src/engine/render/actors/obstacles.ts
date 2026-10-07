import type * as T from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GameConfig, TrailHazard, ThreeModule } from '@/engine/types';
import type { Palette } from '@/engine/render/world/palette';
import { repaintKitModel } from '@/engine/render/world/palette';
import { TRAIL_Y } from '@/engine/render/world/ground';
import { laneToX } from '@/engine/core/state';
import { buildRiver } from '@/engine/render/actors/rivers';

/**
 * Logs and rockfalls are authored whole in Blender (tools/build_trail_obstacles_catalog.py, exported by
 * tools/export_trail_obstacles.py): three variants per kind and lane count, each also shown mirrored, so
 * six looks before one repeats. A hazard keeps its look for its whole life because the pick comes from its id.
 */
export const HAZARD_VARIANTS = ['A', 'B', 'C'] as const;
const LANE_NAMES = ['two', 'three'] as const;
const SOLID_KINDS = { log: 'log', stones: 'stone_hazard' } as const;
type SolidKind = keyof typeof SOLID_KINDS;

export function hazardAssetName(kind: SolidKind, laneCount: 2 | 3, variant: string): string {
  return `${SOLID_KINDS[kind]}_${LANE_NAMES[laneCount - 2]}_lane_${variant}`;
}

export function hazardVariant(id: number): number {
  return Math.abs(id) % HAZARD_VARIANTS.length;
}

/** Every other pass through the variants is mirrored across the trail. */
export function hazardMirrored(id: number): boolean {
  return Math.floor(Math.abs(id) / HAZARD_VARIANTS.length) % 2 === 1;
}

const SOLID_ASSETS = (Object.keys(SOLID_KINDS) as SolidKind[]).flatMap(kind =>
  ([2, 3] as const).flatMap(lanes => HAZARD_VARIANTS.map(variant => hazardAssetName(kind, lanes, variant))));

/** Fixed slots own every variant; reassignment changes only transforms and visibility. */
export async function addObstaclePool(THREE: ThreeModule, scene: T.Scene, config: GameConfig, loader: GLTFLoader, palette: Palette) {
  const paths = [...SOLID_ASSETS, 'river_crossing'];
  const sources = await Promise.all(paths.map(async name => (await loader.loadAsync(`/assets/models/environment/${name}.glb`)).scene));
  sources.forEach(source => repaintKitModel(THREE, source, palette.kit));
  const templates = new Map(SOLID_ASSETS.map((name, i) => [name, sources[i]!]));
  const scaleOf = (name: string) => name.startsWith(SOLID_KINDS.log) ? config.obstacle.visualScale.log : config.obstacle.visualScale.stones;
  const items = Array.from({ length: config.obstacle.poolSize }, () => {
    const group = new THREE.Group();
    group.name = 'trail-hazard';
    const solids = new Map<string, T.Object3D>();
    for (const [name, template] of templates) {
      const solid = template.clone(true);
      solid.name = name;
      const { height, depth } = scaleOf(name);
      solid.scale.multiply(new THREE.Vector3(1, height, depth));
      solid.visible = false;
      solid.traverse(node => {
        const mesh = node as T.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
      });
      solids.set(name, solid);
      group.add(solid);
    }
    const river = buildRiver(THREE, config, palette, sources[sources.length - 1]!);
    group.add(river.group);
    group.visible = false;
    scene.add(group);
    return { group, solids, river, shown: null as T.Object3D | null };
  });
  return {
    items,
    sync(hazards: TrailHazard[], elapsedMs: number) {
      items.forEach((slot, i) => {
        const hazard = hazards[i];
        slot.group.visible = Boolean(hazard);
        if (!hazard) return;
        const x = hazard.kind === 'river' ? 0 :
          (laneToX(hazard.startLane, config) + laneToX(hazard.startLane + hazard.laneCount - 1, config)) / 2;
        slot.group.position.set(x, TRAIL_Y, hazard.z);
        const wanted = hazard.kind === 'river' ? null
          : slot.solids.get(hazardAssetName(hazard.kind, hazard.laneCount, HAZARD_VARIANTS[hazardVariant(hazard.id)]))!;
        if (slot.shown !== wanted) {
          if (slot.shown) slot.shown.visible = false;
          if (wanted) wanted.visible = true;
          slot.shown = wanted;
        }
        // A negative scale flips the winding; three.js compensates per object, so shading stays correct.
        if (wanted) wanted.scale.x = hazardMirrored(hazard.id) ? -1 : 1;
        slot.river.group.visible = hazard.kind === 'river';
        if (hazard.kind === 'river') slot.river.update(elapsedMs);
      });
    },
    hide() { items.forEach(slot => { slot.group.visible = false; }); },
  };
}
