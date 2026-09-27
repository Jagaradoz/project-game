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

import type { KitPalette, Palette } from '@/engine/render/world/palette';
import type { GameConfig, ThreeModule } from '@/engine/types';
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
}

type ScatterLayers = Record<string, ScatterLayer>;

/** A managed material: recoloured per biome by its Kenney material name. */
interface ManagedMaterial {
  name: string;
  material: THREE_NS.MeshStandardMaterial;
}

interface ModelPart {
  geometry: THREE_NS.BufferGeometry;
  material: THREE_NS.Material;
  matrix: THREE_NS.Matrix4;
  managed: ManagedMaterial[];
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
}

interface ScatterSet {
  group: THREE_NS.Group;
  meshes: ScatterMeshEntry[];
  managed: ManagedMaterial[];
}

export interface ScatterOptions {
  sets?: Record<string, ScatterLayers>;
  span?: number;
  seed?: number;
  startZ?: number;
}

import { createRng, range } from '@/engine/render/world/rng';
import { repaintKitModel } from '@/engine/render/world/palette';
import { createHeightSampler } from '@/engine/render/world/ground';

const MODEL_DIR = '/assets/models/nature';
const Z_TRANSLATION_OFFSET = 14;

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
    count: 520,
    band: [5.6, 16],
    scale: [1.8, 3.0],
    castShadow: false,
    models: ['grass', 'plant_flatTall'],
    clusterSize: 14,
    clusterSpread: 9,
  },
  flowers: {
    count: 110,
    band: [5.7, 9],
    scale: [1.6, 2.6],
    castShadow: false,
    models: ['flower_redA', 'flower_yellowB', 'flower_purpleB'],
  },
  verge: {
    count: 95,
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
    count: 100,
    band: [6, 12],
    scale: [1.6, 2.5],
    castShadow: true,
    models: [
      'plant_bush', 'plant_bushDetailed', 'plant_bushLarge',
      'log', 'stump_old', 'stump_roundDetailed', 'rock_smallA',
    ],
    clusterSize: 7,
    clusterSpread: 8,
  },
  midground: {
    count: 100,
    band: [7, 17],
    scale: [2.2, 3.4],
    castShadow: true,
    models: [
      'tree_pineTallC_detailed', 'tree_pineTallD_detailed', 'tree_detailed',
      'tree_thin', 'tree_oak', 'tree_detailed',
      'rock_largeA', 'rock_tallA', 'stone_largeA', 'stone_tallC',
    ],
    clusterSize: 5,
    clusterSpread: 10,
  },
  canopy: {
    count: 95,
    band: [15, 48],
    scale: [2.8, 4.2],
    castShadow: false,
    models: [
      'tree_pineRoundA', 'tree_pineRoundD', 'tree_pineTallA_detailed',
      'tree_pineTallB_detailed', 'tree_pineDefaultA', 'tree_plateau',
      'tree_detailed', 'tree_pineTallC_detailed', 'tree_pineTallD_detailed',
    ],
    clusterSize: 6,
    clusterSpread: 13,
  },
};

const HIGHLANDS_LAYERS = {
  groundcover: {
    count: 170,
    band: [5.2, 20],
    scale: [1.2, 2.1],
    castShadow: false,
    models: ['grass', 'plant_flatTall', 'rock_smallA'],
    clusterSize: 12,
    clusterSpread: 10,
  },
  verge: {
    count: 125,
    band: [5.2, 10],
    scale: [1.3, 2.3],
    castShadow: false,
    models: [
      'rock_smallA', 'rock_smallG', 'stone_smallB', 'stone_smallE', 'stone_smallF',
      'mushroom_tanTall', 'plant_bush',
    ],
    clusterSize: 9,
    clusterSpread: 7,
  },
  understory: {
    count: 100,
    band: [6.2, 13],
    scale: [1.5, 2.2],
    castShadow: true,
    models: [
      'rock_largeA', 'rock_largeE', 'rock_tallF', 'rock_tallG',
      'stone_largeA', 'stone_tallC', 'stump_old', 'plant_bush',
    ],
    clusterSize: 6,
    clusterSpread: 9,
  },
  midground: {
    count: 90,
    band: [7, 18],
    scale: [2.0, 3.2],
    castShadow: true,
    models: [
      'cliff_blockHalf_stone', 'cliff_blockQuarter_stone', 'cliff_half_rock',
      'stone_tallD', 'stone_tallE', 'rock_tallH',
      'tree_pineSmallB', 'tree_simple_dark', 'tree_thin_dark',
    ],
    clusterSize: 4,
    clusterSpread: 11,
  },
  canopy: {
    count: 85,
    band: [15, 48],
    scale: [2.6, 4.4],
    castShadow: false,
    models: [
      'cliff_block_rock', 'cliff_blockSlope_rock', 'cliff_top_stone',
      'tree_pineDefaultA', 'tree_plateau_dark', 'tree_cone_dark', 'tree_tall_dark',
    ],
    clusterSize: 5,
    clusterSpread: 14,
  },
};

const OASIS_LAYERS = {
  groundcover: {
    count: 130,
    band: [5.2, 20],
    scale: [1.1, 2.0],
    castShadow: false,
    models: ['grass', 'plant_flatTall', 'stone_smallB'],
    clusterSize: 11,
    clusterSpread: 10,
  },
  verge: {
    count: 100,
    band: [5.2, 10],
    scale: [1.3, 2.2],
    castShadow: false,
    models: ['cactus_short', 'rock_smallA', 'rock_smallG', 'stone_smallE', 'plant_bush'],
    clusterSize: 8,
    clusterSpread: 8,
  },
  understory: {
    count: 85,
    band: [6.2, 13],
    scale: [1.5, 2.2],
    castShadow: true,
    models: ['cactus_tall', 'rock_largeA', 'stone_largeC', 'stump_old', 'log'],
    clusterSize: 5,
    clusterSpread: 10,
  },
  midground: {
    count: 82,
    band: [7, 18],
    scale: [2.0, 3.2],
    castShadow: true,
    models: [
      'tree_palmShort', 'tree_palmBend', 'tree_palmDetailedShort',
      'rock_tallF', 'stone_tallC', 'cactus_tall',
    ],
    clusterSize: 4,
    clusterSpread: 12,
  },
  canopy: {
    count: 75,
    band: [15, 48],
    scale: [2.6, 4.0],
    castShadow: false,
    models: [
      'tree_palm', 'tree_palmTall', 'tree_palmDetailedTall',
      'cliff_top_stone', 'rock_largeE',
    ],
    clusterSize: 5,
    clusterSpread: 15,
  },
};

export const SCATTER_SETS: Record<string, ScatterLayers> = {
  forest: FOREST_LAYERS,
  highlands: HIGHLANDS_LAYERS,
  oasis: OASIS_LAYERS,
};

export async function addScatter(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
  loader: GLTFLoader | null,
  options: ScatterOptions = {},
) {
  const { sets = SCATTER_SETS, span = 320, seed = 0x5eed, startZ = 20 } = options;
  const farZ = startZ - span;

  if (!loader) return emptyScatter(span, farZ);

  // Every set is built up front. The models are 5-17 KB each, so holding all
  // three biomes resident costs far less than a load pause mid-run would.
  const names = [
    ...new Set(
      Object.values(sets).flatMap((set) => Object.values(set).flatMap((layer) => layer.models)),
    ),
  ];
  const sources = await loadModels(THREE, loader, names, palette);
  const heightAt = createHeightSampler(config);

  const built = new Map<string, ScatterSet>();
  let setIndex = 0;

  for (const [setName, layers] of Object.entries(sets)) {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);

    const meshes: ScatterMeshEntry[] = [];
    const managed: ManagedMaterial[] = [];
    // A distinct stream per set, so adding a biome cannot reshuffle the others.
    const rng = createRng(seed + setIndex * 7919);
    setIndex += 1;

    const occupied: Footprint[] = [];
    // Reserve the largest silhouettes first, across every layer.
    for (const [layerName, layer] of Object.entries(layers).reverse()) {
      const placements = planPlacements(rng, layer, span, farZ, heightAt, sources, occupied);
      for (const [modelName, forModel] of groupByModel(placements)) {
        const source = sources.get(modelName);
        if (!source) continue;
        for (const part of source.parts) {
          meshes.push(buildInstancedMesh(THREE, group, part, forModel, layer, layerName));
          managed.push(...part.managed);
        }
      }
    }

    built.set(setName, { group, meshes, managed });
  }

  let active = built.get(Object.keys(sets)[0]!);
  if (active) active.group.visible = true;

  // Deduplicated across sets: a model shared by two biomes has one material.
  const allManaged = [...built.values()]
    .flatMap((entry) => entry.managed)
    .filter((entry, index, list) => list.findIndex((other) => other.material === entry.material) === index);

  return {
    sets: built,
    span,
    startZ: farZ,
    get meshes() {
      return active ? active.meshes : [];
    },
    /** Switches which biome's props are on screen. */
    setActive(setName: string) {
      const next = built.get(setName);
      if (!next || next === active) return;
      if (active) active.group.visible = false;
      next.group.visible = true;
      active = next;
    },
    /** One float per instance per frame; see the module note. */
    scroll(distance: number) {
      if (!active) return;
      const offset = distance % span;
      for (const entry of active.meshes) {
        const array = entry.mesh.instanceMatrix.array as Float32Array;
        for (let index = 0; index < entry.baseZ.length; index += 1) {
          const shifted = entry.baseZ[index]! - farZ + offset;
          array[index * 16 + Z_TRANSLATION_OFFSET] = farZ + (shifted % span) + entry.zOffset[index]!;
        }
        entry.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    /**
     * Every set is repainted, not just the visible one: a set that is hidden
     * during a crossfade would otherwise appear still wearing the palette of
     * whichever biome was on screen when it was last shown.
     */
    applyPalette(next: Palette) {
      for (const entry of allManaged) {
        const hex = (next.kit as KitPalette)[entry.name];
        if (hex) entry.material.color.set(hex);
      }
    },
  };
}

function emptyScatter(span: number, startZ: number) {
  return {
    sets: new Map<string, ScatterSet>(),
    meshes: [] as ScatterMeshEntry[],
    span,
    startZ,
    setActive(_setName: string) {},
    scroll(_distance: number) {},
    applyPalette(_next: Palette) {},
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
      managed: [{ name: material.name, material }],
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
    if (isLandmarkZone(z, farZ, span, 7 + radius)) continue;
    const candidate = { x, z, radius };
    if (!hasSceneryClearance(candidate, occupied, span)) continue;
    occupied.push(candidate);
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
  return { mesh, baseZ, zOffset };
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
