/**
 * Instanced roadside scenery.
 *
 * The old scatter cloned every prop into its own Object3D, which cost roughly
 * 450 draw calls for a forest that still looked sparse. Kenney's models are a
 * untextured primitives, so they instance cleanly: one InstancedMesh per
 * (model, primitive, quality/shadow policy) shares ground and top decorations.
 *
 * Recycling writes the z translation straight into the instance matrix buffer.
 * Everything else about an instance (x, rotation, scale) is baked once at build
 * time and never touched again, so a frame costs one float write per prop.
 */

import type * as THREE_NS from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { Palette } from '@/engine/render/world/palette';
import type { GameConfig, ShadowQuality, ThreeModule } from '@/engine/types';
import type { Rng } from '@/engine/render/world/rng';

/** One band of props at a fixed distance range from the trail. */
interface ScatterLayer {
  count: number;
  band: number[];
  scale: number[];
  castShadow: boolean;
  models: string[];
  /** Props arrive in readable groves instead of uniform procedural noise. */
  clusterSize?: number;
  clusterSpread?: number;
  /** Thinned by the quality level; see DETAIL_FRACTION. Only for layers that are pure filler. */
  detail?: boolean;
  /**
   * Skips the footprint clearance check. For dense low grass only: overlapping
   * a tuft is invisible, and checking thousands of tiny footprints against
   * every prop would dominate load time.
   */
  overlap?: boolean;
  /** Small low props can occupy the dirt shoulder outside the physical lanes. */
  shoulder?: boolean;
}

type ScatterLayers = Record<string, ScatterLayer>;

interface ModelPart {
  geometry: THREE_NS.BufferGeometry;
  material: THREE_NS.Material | THREE_NS.Material[];
  matrix: THREE_NS.Matrix4;
}

type Placement = SceneryPlacement;

interface ModelSource {
  parts: ModelPart[];
  radius: number;
  plateau?: Plateau;
}

interface ScatterMeshEntry {
  mesh: THREE_NS.InstancedMesh;
  baseZ: Float32Array;
  zOffset: Float32Array;
  /** Instances built; `mesh.count` may draw fewer when the layer is a detail layer. */
  fullCount: number;
  detail: boolean;
}

export interface ScatterOptions {
  layers?: ScatterLayers;
  span?: number;
  seed?: number;
  startZ?: number;
}

import { createRng, range } from '@/engine/render/world/rng';
import { createHeightSampler, trailHalfWidth } from '@/engine/render/world/ground';
import {
  ENVIRONMENT_MODEL_DIR, BROADLEAF_TREES, DISTANT_TREES, PALM_TREES,
  SMALL_STONES, BIG_STONES, TOP_MODELS, readPlateau, planPlateauDecorations, wrappedSceneryZ,
  type Plateau, type SceneryPlacement,
} from '@/engine/render/world/catalog';


/**
 * Share of a detail layer drawn at each quality level. Placements are random,
 * so drawing a prefix of the instance buffer is an even thinning, and it can
 * change at runtime with no rebuild -- the runtime's auto-quality uses this.
 */
export const DETAIL_FRACTION: Record<ShadowQuality, number> = {
  high: 1,
  medium: 0.5,
  low: 0,
};
const Z_TRANSLATION_OFFSET = 14;
/** Landmarks sit within this distance of the trail centre; props further out need not avoid them. */
const LANDMARK_REACH_X = 18;

/** Shared authored beats. Scatter leaves these slices open for landmarks. */
export const LANDMARK_ZONE_FRACTIONS = [0.12, 0.38, 0.64, 0.88] as const;

export function isLandmarkZone(z: number, farZ: number, span: number, radius = 10): boolean {
  return LANDMARK_ZONE_FRACTIONS.some((fraction) =>
    Math.abs(z - (farZ + span * fraction)) < radius,
  );
}

/**
 * Deliberately sparse: fewer, larger props in wider clusters, so the verges read
 * as a few bold shapes rather than a busy carpet, while still filling the bands.
 *
 * Nearby substantial props cast shadows: an InstancedMesh is culled as a
 * single unit, so every instance of a
 * shadow-casting layer is drawn into the shadow map whether or not it is inside
 * the light frustum. Distant canopy would pay that cost for no visible gain.
 */
const FOREST_LAYERS: ScatterLayers = {
  groundcover: {
    count: 264, band: [5.6, 24], scale: [2.25, 3.75], castShadow: false,
    models: ['grass', 'plant_flatTall'], clusterSize: 14, clusterSpread: 12,
  },
  flowers: {
    count: 38, band: [5.7, 9], scale: [1.5, 2.38], castShadow: false,
    models: ['flower_redA', 'flower_yellowB', 'flower_purpleB'],
  },
  shoulder: {
    count: 47, band: [0, 0], scale: [0.45, 0.8], castShadow: false, shoulder: true,
    models: ['stone_smallPair', 'stone_smallPile', 'grass'],
  },
  verge: {
    count: 33, band: [5.2, 9.5], scale: [1.5, 2.62], castShadow: false,
    models: ['flower_redA', 'flower_yellowB', 'flower_purpleB',
      'mushroom_red', 'mushroom_redGroup', 'mushroom_tanTall', ...SMALL_STONES],
    clusterSize: 10, clusterSpread: 8,
  },
  understory: {
    count: 36, band: [6, 12], scale: [2, 3.12], castShadow: true,
    models: ['plant_bush', 'plant_bushLarge', 'stump_old', 'stump_round'],
    clusterSize: 7, clusterSpread: 10,
  },
  boulders: {
    count: 10, band: [6.5, 14], scale: [2.5, 3.75], castShadow: true,
    models: BIG_STONES, clusterSize: 3, clusterSpread: 6,
  },
  midground: {
    count: 36, band: [7, 17], scale: [2.75, 4.25], castShadow: true,
    models: BROADLEAF_TREES, clusterSize: 5, clusterSpread: 13,
  },
  palms: {
    count: 9, band: [17, 35], scale: [3.12, 4.5], castShadow: false,
    models: PALM_TREES, clusterSize: 4, clusterSpread: 8,
  },
  canopy: {
    count: 38, band: [15, 48], scale: [3.5, 5.25], castShadow: false,
    models: [...BROADLEAF_TREES, 'tree_pineRoundD', 'tree_pineSmallB'],
    clusterSize: 6, clusterSpread: 17,
  },
  farForest: {
    count: 165, band: [40, 100], scale: [3.75, 5.75], castShadow: false,
    models: DISTANT_TREES, clusterSize: 8, clusterSpread: 21, detail: true,
  },
  meadow: {
    count: 825, band: [20, 95], scale: [2.75, 4.5], castShadow: false,
    models: ['grass', 'plant_flatTall'], detail: true, overlap: true,
  },
};

export async function addScatter(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  _palette: Palette,
  loader: GLTFLoader | null,
  options: ScatterOptions = {},
) {
  const { layers = FOREST_LAYERS, span = 320, seed = 0x5eed, startZ = 20 } = options;
  const farZ = startZ - span;

  if (!loader) return emptyScatter(span, farZ);

  const names = [...new Set([...Object.values(layers).flatMap((layer) => layer.models), ...TOP_MODELS])];
  const sources = await loadModels(THREE, loader, names);
  const heightAt = createHeightSampler(config);

  const group = new THREE.Group();
  scene.add(group);
  const meshes: ScatterMeshEntry[] = [];
  const rng = createRng(seed);
  const occupied: Footprint[] = [];

  // Complete planning first, including platform tops, so shared models share batches.
  const batches = new Map<string, { model: string; placements: Placement[]; layer: ScatterLayer }>();
  const gather = (placements: Placement[], layer: ScatterLayer) => {
    for (const placement of placements) {
      const key = `${placement.model}:${Boolean(layer.detail)}:${layer.castShadow}`;
      if (!batches.has(key)) batches.set(key, { model: placement.model, placements: [], layer });
      batches.get(key)!.placements.push(placement);
    }
  };
  // Outcrops reserve their full footprint before ordinary vegetation is planned.
  const ordered = Object.entries(layers).reverse().sort(([, a], [, b]) =>
    Number(b.models.some((name) => sources.get(name)?.plateau)) -
    Number(a.models.some((name) => sources.get(name)?.plateau)));
  for (const [, layer] of ordered) {
    const placements = planPlacements(rng, layer, span, farZ, heightAt, sources, occupied, config);
    gather(placements, layer);
    for (const platform of placements) {
      const plateau = sources.get(platform.model)?.plateau;
      if (!plateau) continue;
      const decorations = planPlateauDecorations(rng, platform, plateau, sources);
      for (const decoration of decorations) {
        gather([decoration], { ...layer, detail: false, castShadow: decoration.model.startsWith('tree_') });
      }
    }
  }
  for (const { model, placements, layer } of batches.values()) {
    for (const part of sources.get(model)!.parts) {
      meshes.push(buildInstancedMesh(THREE, group, part, placements, layer, model));
    }
  }

  let lastDistance: number | null = null;
  return {
    meshes,
    span,
    startZ: farZ,
    /** Thins every detail layer to the level's share. */
    setQuality(level: ShadowQuality) {
      const fraction = DETAIL_FRACTION[level] ?? 1;
      for (const entry of meshes) {
        if (entry.detail) {
          const count = Math.round(entry.fullCount * fraction);
          if (entry.mesh.count !== count) lastDistance = null;
          entry.mesh.count = count;
        }
      }
    },
    /** One float per instance per frame; see the module note. */
    scroll(distance: number) {
      if (distance === lastDistance) return;
      lastDistance = distance;
      for (const entry of meshes) {
        const array = entry.mesh.instanceMatrix.array as Float32Array;
        for (let index = 0; index < entry.mesh.count; index += 1) {
          array[index * 16 + Z_TRANSLATION_OFFSET] = wrappedSceneryZ(entry.baseZ[index]!, distance, farZ, span) + entry.zOffset[index]!;
        }
        entry.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

function emptyScatter(span: number, startZ: number) {
  return {
    meshes: [] as ScatterMeshEntry[],
    span,
    startZ,
    setQuality(_level: ShadowQuality) {},
    scroll(_distance: number) {},
  };
}

/** Loaded in parallel: seventeen serial awaits used to gate the whole boot. */
async function loadModels(
  THREE: ThreeModule,
  loader: GLTFLoader,
  names: string[],
): Promise<Map<string, ModelSource>> {
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${ENVIRONMENT_MODEL_DIR}/${name}.glb`);
        let plateau: Plateau | undefined;
        gltf.scene.traverse((node) => {
          plateau ??= readPlateau(node.userData);
          const mesh = node as THREE_NS.Mesh;
          if (mesh.isMesh) plateau ??= readPlateau(mesh.geometry.userData);
        });
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const radius = Math.hypot(
          Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
          Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
        );
        return [name, { parts: collectParts(gltf.scene), radius, plateau }] as const;
      } catch (error) {
        console.warn(`scatter: could not load ${name}.glb`, error);
        return null;
      }
    }),
  );

  return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
}

/** One entry per primitive, carrying its transform relative to the model root. */
function collectParts(root: THREE_NS.Object3D): ModelPart[] {
  root.updateWorldMatrix(true, true);
  const parts: ModelPart[] = [];

  root.traverse((child) => {
    const mesh = child as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material;
    parts.push({
      geometry: mesh.geometry,
      material,
      matrix: mesh.matrixWorld.clone(),
    });
  });

  return parts;
}

export interface Footprint { x: number; z: number; radius: number }

/** Distance wraps exactly like the renderer, including neighbours at the seam. */
export function hasSceneryClearance(candidate: Footprint, occupied: Footprint[], span: number): boolean {
  return occupied.every((other) => {
    const dz = Math.abs(candidate.z - other.z) % span;
    return Math.hypot(candidate.x - other.x, Math.min(dz, span - dz)) >=
      candidate.radius + other.radius + 0.18;
  });
}

export function planPlacements(
  rng: Rng,
  layer: ScatterLayer,
  span: number,
  farZ: number,
  heightAt: (x: number) => number,
  sources: Map<string, { radius: number }>,
  occupied: Footprint[],
  config: GameConfig,
): Placement[] {
  const laneHalf = config.laneCount * config.laneWidth / 2;
  const dirtHalf = trailHalfWidth(config);
  const [minDist = 0, maxDist = 0] = layer.shoulder ? [laneHalf + 0.3, dirtHalf - 0.4] : layer.band;
  const [minScale = 1, maxScale = 1] = layer.scale;
  const placements: Placement[] = [];
  let cluster: { x: number; z: number } | undefined;
  let clusteredCount = -1;
  // Rejection sampling leaves space when a band is full; never force an overlap.
  for (let attempt = 0; attempt < layer.count * 40 && placements.length < layer.count; attempt += 1) {
    const model = layer.models[Math.floor(rng() * layer.models.length)]!;
    const source = sources.get(model);
    if (!source) continue;
    const scale = range(rng, minScale, maxScale);
    const radius = source.radius * scale;
    const inner = Math.max(minDist, (layer.shoulder ? laneHalf + 0.3 : dirtHalf + 0.5) + radius);
    const outer = maxDist - (layer.shoulder ? radius : 0);
    if (inner > outer) continue;
    if (layer.clusterSize && (clusteredCount !== Math.floor(placements.length / layer.clusterSize) || attempt % 40 === 0)) {
      clusteredCount = Math.floor(placements.length / layer.clusterSize);
      cluster = { x: (rng() < 0.5 ? -1 : 1) * range(rng, inner, outer), z: farZ + rng() * span };
    }
    const spread = layer.clusterSpread ?? 5;
    const x = cluster ? cluster.x + range(rng, -spread / 2, spread / 2) :
      (rng() < 0.5 ? -1 : 1) * range(rng, inner, outer);
    if (Math.abs(x) < inner || Math.abs(x) > outer) continue;
    const z = cluster ? wrappedSceneryZ(cluster.z + range(rng, -spread, spread), 0, farZ, span) : farZ + rng() * span;
    // Reserve complete landmark silhouettes, including the prop's own radius.
    const nearLandmarks = Math.abs(x) - radius < LANDMARK_REACH_X;
    if (nearLandmarks && isLandmarkZone(z, farZ, span, 7 + radius)) continue;
    const candidate = { x, z, radius };
    if (!layer.overlap) {
      if (!hasSceneryClearance(candidate, occupied, span)) continue;
      occupied.push(candidate);
    }
    placements.push({ model, x, y: heightAt(x) - 0.03, z, rotationY: rng() * Math.PI * 2, scale });
  }
  return placements;
}

function buildInstancedMesh(
  THREE: ThreeModule,
  group: THREE_NS.Group,
  part: ModelPart,
  placements: Placement[],
  layer: ScatterLayer,
  layerName: string,
): ScatterMeshEntry {
  const mesh = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
  mesh.castShadow = layer.castShadow;
  mesh.receiveShadow = false;
  mesh.name = `scatter:${layerName}`;
  // Instances move every frame, so a cached bounding sphere would be wrong
  // immediately; culling the whole layer as one unit is not worth the upkeep.
  mesh.frustumCulled = false;

  const composed = new THREE.Matrix4();
  const placement = new THREE.Matrix4();
  const axis = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const baseZ = new Float32Array(placements.length);
  const zOffset = new Float32Array(placements.length);

  placements.forEach((entry, index) => {
    quaternion.setFromAxisAngle(axis, entry.rotationY);
    position.set(entry.x, entry.y, entry.z);
    scale.setScalar(entry.scale);
    placement.compose(position, quaternion, scale);
    composed.multiplyMatrices(placement, part.matrix);

    mesh.setMatrixAt(index, composed);
    baseZ[index] = entry.anchorZ ?? entry.z;
    // Whatever z the part contributes on top of the placement, preserved so the
    // per-frame write can rebuild the full translation from the wrapped value.
    zOffset[index] = composed.elements[Z_TRANSLATION_OFFSET] - baseZ[index]!;
  });

  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return { mesh, baseZ, zOffset, fullCount: placements.length, detail: Boolean(layer.detail) };
}
