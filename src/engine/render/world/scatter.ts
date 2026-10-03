/**
 * Instanced roadside scenery.
 *
 * The old scatter cloned every prop into its own Object3D, which cost roughly
 * 450 draw calls for a forest that still looked sparse. Kenney's models are a
 * handful of untextured primitives each, so they instance cleanly: one
 * InstancedMesh per (model, primitive) collapses the same forest -- at several
 * times the density -- into a couple of dozen calls.
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
}

type ScatterLayers = Record<string, ScatterLayer>;

interface ModelPart {
  geometry: THREE_NS.BufferGeometry;
  material: THREE_NS.Material;
  matrix: THREE_NS.Matrix4;
}

interface Placement {
  model: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
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
import { repaintKitModel } from '@/engine/render/world/palette';
import { createHeightSampler } from '@/engine/render/world/ground';

const MODEL_DIR = '/assets/models/nature';

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
 * Layers are ordered by distance from the trail. Only the two nearest cast
 * shadows: an InstancedMesh is culled as a single unit, so every instance of a
 * shadow-casting layer is drawn into the shadow map whether or not it is inside
 * the light frustum. Distant canopy would pay that cost for no visible gain.
 */
const FOREST_LAYERS = {
  /**
   * Keep enough grass to break the ground silhouette, but leave broad quiet
   * shapes so the trail reads like the site's poster-style panels.
   */
  groundcover: {
    count: 480,
    band: [5.6, 24],
    scale: [1.8, 3.0],
    castShadow: false,
    models: ['grass', 'plant_flatTall'],
    clusterSize: 14,
    clusterSpread: 9,
  },
  flowers: {
    count: 70,
    band: [5.7, 9],
    scale: [1.6, 2.6],
    castShadow: false,
    models: ['flower_redA', 'flower_yellowB', 'flower_purpleB'],
  },
  verge: {
    count: 60,
    band: [5.2, 9.5],
    scale: [1.2, 2.1],
    castShadow: false,
    models: [
      'flower_redA', 'flower_yellowB', 'flower_purpleB',
      'mushroom_red', 'mushroom_redGroup', 'mushroom_tanTall',
      'rock_smallA', 'rock_smallG', 'stone_smallB',
    ],
    clusterSize: 10,
    clusterSpread: 6,
  },
  understory: {
    count: 65,
    band: [6, 12],
    scale: [1.6, 2.5],
    castShadow: true,
    models: [
      'plant_bush', 'plant_bushLarge',
      'log', 'stump_old', 'stump_round', 'rock_smallA',
    ],
    clusterSize: 7,
    clusterSpread: 8,
  },
  /**
   * A handful of big stones near the path: a mid-height silhouette between
   * the bushes and the trees, and a landmark to measure speed against.
   */
  boulders: {
    count: 12,
    band: [6.5, 14],
    scale: [3.2, 4.6],
    castShadow: true,
    models: ['rock_largeB', 'rock_largeC', 'rock_largeD', 'stone_largeB', 'stone_largeD'],
    clusterSize: 3,
    clusterSpread: 5,
  },
  midground: {
    count: 65,
    band: [7, 17],
    scale: [2.2, 3.4],
    castShadow: true,
    models: [
      'tree_pineTallC', 'tree_pineTallD', 'tree_simple',
      'tree_thin', 'tree_oak',
      'rock_largeA', 'rock_tallA', 'stone_largeA', 'stone_tallC',
    ],
    clusterSize: 5,
    clusterSpread: 10,
  },
  canopy: {
    count: 70,
    band: [15, 48],
    scale: [2.8, 4.2],
    castShadow: false,
    models: [
      'tree_pineRoundA', 'tree_pineRoundD', 'tree_pineTallA',
      'tree_pineTallB', 'tree_pineDefaultA', 'tree_plateau',
      'tree_pineTallC', 'tree_pineTallD',
    ],
    clusterSize: 6,
    clusterSpread: 13,
  },
  /**
   * Fills the flat ground out to where the fog takes over, so the forest reads
   * as continuous instead of a strip along the path. Simplest kit trees, no
   * shadows, and thinned by quality: this is the first thing a slow device loses.
   */
  farForest: {
    count: 300,
    band: [40, 100],
    scale: [3.0, 4.6],
    castShadow: false,
    models: [
      'tree_pineRoundA', 'tree_pineRoundD', 'tree_pineTallA',
      'tree_pineDefaultA', 'tree_simple', 'tree_cone',
    ],
    clusterSize: 8,
    clusterSpread: 16,
    detail: true,
  },
  /** Grass across the open ground between the trees, out to the fog. */
  meadow: {
    count: 1500,
    band: [20, 95],
    scale: [2.2, 3.6],
    castShadow: false,
    models: ['grass', 'grass_large', 'plant_flatTall'],
    detail: true,
    overlap: true,
  },
};

export async function addScatter(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
  loader: GLTFLoader | null,
  options: ScatterOptions = {},
) {
  const { layers = FOREST_LAYERS, span = 320, seed = 0x5eed, startZ = 20 } = options;
  const farZ = startZ - span;

  if (!loader) return emptyScatter(span, farZ);

  const names = [...new Set(Object.values(layers).flatMap((layer) => layer.models))];
  const sources = await loadModels(THREE, loader, names, palette);
  const heightAt = createHeightSampler(config);

  const group = new THREE.Group();
  scene.add(group);
  const meshes: ScatterMeshEntry[] = [];
  const rng = createRng(seed);
  const occupied: Footprint[] = [];

  // Reserve the largest silhouettes first, across every layer.
  for (const [layerName, layer] of Object.entries(layers).reverse()) {
    const placements = planPlacements(rng, layer, span, farZ, heightAt, sources, occupied);
    for (const [modelName, forModel] of groupByModel(placements)) {
      const source = sources.get(modelName);
      if (!source) continue;
      for (const part of source.parts) {
        meshes.push(buildInstancedMesh(THREE, group, part, forModel, layer, layerName));
      }
    }
  }

  return {
    meshes,
    span,
    startZ: farZ,
    /** Thins every detail layer to the level's share. */
    setQuality(level: ShadowQuality) {
      const fraction = DETAIL_FRACTION[level] ?? 1;
      for (const entry of meshes) {
        if (entry.detail) entry.mesh.count = Math.round(entry.fullCount * fraction);
      }
    },
    /** One float per instance per frame; see the module note. */
    scroll(distance: number) {
      const offset = distance % span;
      for (const entry of meshes) {
        const array = entry.mesh.instanceMatrix.array as Float32Array;
        for (let index = 0; index < entry.mesh.count; index += 1) {
          const shifted = entry.baseZ[index]! - farZ + offset;
          array[index * 16 + Z_TRANSLATION_OFFSET] = farZ + (shifted % span) + entry.zOffset[index]!;
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
  palette: Palette,
) {
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${MODEL_DIR}/${name}.glb`);
        repaintKitModel(THREE, gltf.scene, palette.kit);
        if (name === 'grass') thickenGrass(THREE, gltf.scene);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const radius = Math.hypot(
          Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
          Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
        );
        return [name, { parts: collectParts(THREE, gltf.scene), radius }] as const;
      } catch (error) {
        console.warn(`scatter: could not load ${name}.glb`, error);
        return null;
      }
    }),
  );

  return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
}

/** One entry per primitive, carrying its transform relative to the model root. */
function collectParts(THREE: ThreeModule, root: THREE_NS.Object3D): ModelPart[] {
  root.updateWorldMatrix(true, true);
  const parts: ModelPart[] = [];

  root.traverse((child) => {
    const mesh = child as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE_NS.MeshStandardMaterial;
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

function planPlacements(
  rng: Rng,
  layer: ScatterLayer,
  span: number,
  farZ: number,
  heightAt: (x: number) => number,
  sources: Map<string, { radius: number }>,
  occupied: Footprint[],
): Placement[] {
  const [minDist = 0, maxDist = 0] = layer.band;
  const [minScale = 1, maxScale = 1] = layer.scale;
  const placements: Placement[] = [];
  // Rejection sampling leaves space when a band is full; never force an overlap.
  for (let attempt = 0; attempt < layer.count * 40 && placements.length < layer.count; attempt += 1) {
    const model = layer.models[Math.floor(rng() * layer.models.length)]!;
    const source = sources.get(model);
    if (!source) continue;
    const scale = range(rng, minScale, maxScale);
    const radius = source.radius * scale;
    const x = (rng() < 0.5 ? -1 : 1) * range(rng, Math.max(minDist, 5.4 + radius), maxDist);
    if (Math.abs(x) > maxDist) continue;
    const z = farZ + rng() * span;
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

function groupByModel(placements: Placement[]): Map<string, Placement[]> {
  const byModel = new Map<string, Placement[]>();
  for (const placement of placements) {
    if (!byModel.has(placement.model)) byModel.set(placement.model, []);
    byModel.get(placement.model)!.push(placement);
  }
  return byModel;
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
    baseZ[index] = entry.z;
    // Whatever z the part contributes on top of the placement, preserved so the
    // per-frame write can rebuild the full translation from the wrapped value.
    zOffset[index] = composed.elements[Z_TRANSLATION_OFFSET] - entry.z;
  });

  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return { mesh, baseZ, zOffset, fullCount: placements.length, detail: Boolean(layer.detail) };
}

/** Curved, tapered blades in one geometry keep each tuft to a single draw batch. */
function thickenGrass(THREE: ThreeModule, root: THREE_NS.Group) {
  const rng = createRng(0x6a55);
  root.traverse((node) => {
    const mesh = node as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    const positions: number[] = [];
    for (let blade = 0; blade < 11; blade += 1) {
      const angle = rng() * Math.PI * 2;
      const height = 0.18 + rng() * 0.25;
      const x = (rng() - 0.5) * 0.24, z = (rng() - 0.5) * 0.24;
      const point = (step: number, side: number) => {
        const t = step / 3;
        const width = 0.024 * (1 - t);
        return [x + Math.cos(angle) * height * t * t * 0.55 + Math.sin(angle) * width * side,
          height * t, z + Math.sin(angle) * height * t * t * 0.55 - Math.cos(angle) * width * side];
      };
      for (let segment = 0; segment < 3; segment += 1) {
        positions.push(...point(segment, -1), ...point(segment, 1), ...point(segment + 1, 1),
          ...point(segment, -1), ...point(segment + 1, 1), ...point(segment + 1, -1));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    mesh.geometry = geometry;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.side = THREE.DoubleSide;
  });
}
