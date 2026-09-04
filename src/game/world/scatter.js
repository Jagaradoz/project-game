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

import { createRng, range } from './rng.js?v=1.10.0';
import { repaintKitModel } from './palette.js?v=1.10.0';
import { createHeightSampler } from './ground.js?v=1.10.0';

const MODEL_DIR = './assets/models/nature';
const Z_TRANSLATION_OFFSET = 14;

/**
 * Layers are ordered by distance from the trail. Only the two nearest cast
 * shadows: an InstancedMesh is culled as a single unit, so every instance of a
 * shadow-casting layer is drawn into the shadow map whether or not it is inside
 * the light frustum. Distant canopy would pay that cost for no visible gain.
 */
const FOREST_LAYERS = {
  /**
   * Grass tufts, and a lot of them. A bank of flat vertex-coloured ground reads
   * as painted cardboard no matter how good the lighting is; breaking the
   * silhouette with cheap geometry is what makes it read as terrain.
   */
  groundcover: {
    count: 700,
    band: [3.9, 20],
    scale: [1.3, 2.4],
    castShadow: false,
    models: ['grass', 'plant_flatTall'],
  },
  verge: {
    count: 420,
    band: [3.9, 9],
    scale: [1.2, 2.1],
    castShadow: false,
    models: [
      'flower_redA', 'flower_yellowB', 'flower_purpleB',
      'mushroom_red', 'mushroom_redGroup', 'mushroom_tanTall',
      'rock_smallA', 'rock_smallG', 'stone_smallB',
    ],
  },
  understory: {
    count: 240,
    band: [4.6, 11],
    scale: [1.6, 2.5],
    castShadow: true,
    models: [
      'plant_bush', 'plant_bushDetailed', 'plant_bushLarge',
      'log', 'stump_old', 'stump_roundDetailed', 'rock_smallA',
    ],
  },
  midground: {
    count: 200,
    band: [5.2, 15],
    scale: [2.2, 3.4],
    castShadow: true,
    models: [
      'tree_pineSmallB', 'tree_pineSmallC', 'tree_default', 'tree_simple',
      'tree_thin', 'tree_oak', 'tree_detailed',
      'rock_largeA', 'rock_tallA', 'stone_largeA', 'stone_tallC',
    ],
  },
  canopy: {
    count: 240,
    band: [12, 46],
    scale: [2.8, 4.2],
    castShadow: false,
    models: [
      'tree_pineRoundA', 'tree_pineRoundD', 'tree_pineTallA_detailed',
      'tree_pineTallB_detailed', 'tree_pineDefaultA', 'tree_plateau',
      'tree_fat', 'tree_blocks', 'tree_detailed',
    ],
  },
};

const HIGHLANDS_LAYERS = {
  groundcover: {
    count: 520,
    band: [3.9, 20],
    scale: [1.2, 2.1],
    castShadow: false,
    models: ['grass', 'plant_flatTall', 'rock_smallA'],
  },
  verge: {
    count: 420,
    band: [3.9, 9],
    scale: [1.3, 2.3],
    castShadow: false,
    models: [
      'rock_smallA', 'rock_smallG', 'stone_smallB', 'stone_smallE', 'stone_smallF',
      'mushroom_tanTall', 'plant_bush',
    ],
  },
  understory: {
    count: 240,
    band: [6.2, 13],
    scale: [1.5, 2.2],
    castShadow: true,
    models: [
      'rock_largeA', 'rock_largeE', 'rock_tallF', 'rock_tallG',
      'stone_largeA', 'stone_tallC', 'stump_old', 'plant_bush',
    ],
  },
  midground: {
    count: 190,
    band: [5.4, 16],
    scale: [2.0, 3.2],
    castShadow: true,
    models: [
      'cliff_blockHalf_stone', 'cliff_blockQuarter_stone', 'cliff_half_rock',
      'stone_tallD', 'stone_tallE', 'rock_tallH',
      'tree_pineSmallB', 'tree_simple_dark', 'tree_thin_dark',
    ],
  },
  canopy: {
    count: 210,
    band: [12, 46],
    scale: [2.6, 4.4],
    castShadow: false,
    models: [
      'cliff_block_rock', 'cliff_blockSlope_rock', 'cliff_top_stone',
      'tree_pineDefaultA', 'tree_plateau_dark', 'tree_cone_dark', 'tree_tall_dark',
    ],
  },
};

const OASIS_LAYERS = {
  groundcover: {
    count: 380,
    band: [3.9, 20],
    scale: [1.1, 2.0],
    castShadow: false,
    models: ['grass', 'plant_flatTall', 'stone_smallB'],
  },
  verge: {
    count: 300,
    band: [3.9, 9],
    scale: [1.3, 2.2],
    castShadow: false,
    models: ['cactus_short', 'rock_smallA', 'rock_smallG', 'stone_smallE', 'plant_bush'],
  },
  understory: {
    count: 200,
    band: [6.2, 13],
    scale: [1.5, 2.2],
    castShadow: true,
    models: ['cactus_tall', 'rock_largeA', 'stone_largeC', 'stump_old', 'log'],
  },
  midground: {
    count: 170,
    band: [5.4, 16],
    scale: [2.0, 3.2],
    castShadow: true,
    models: [
      'tree_palmShort', 'tree_palmBend', 'tree_palmDetailedShort',
      'rock_tallF', 'stone_tallC', 'cactus_tall',
    ],
  },
  canopy: {
    count: 180,
    band: [12, 46],
    scale: [2.6, 4.0],
    castShadow: false,
    models: [
      'tree_palm', 'tree_palmTall', 'tree_palmDetailedTall',
      'cliff_top_stone', 'rock_largeE',
    ],
  },
};

export const SCATTER_SETS = {
  forest: FOREST_LAYERS,
  highlands: HIGHLANDS_LAYERS,
  oasis: OASIS_LAYERS,
};

export async function addScatter(THREE, scene, config, palette, loader, options = {}) {
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

  const built = new Map();
  let setIndex = 0;

  for (const [setName, layers] of Object.entries(sets)) {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);

    const meshes = [];
    const managed = [];
    // A distinct stream per set, so adding a biome cannot reshuffle the others.
    const rng = createRng(seed + setIndex * 7919);
    setIndex += 1;

    for (const [layerName, layer] of Object.entries(layers)) {
      const placements = planPlacements(rng, layer, span, farZ, heightAt);
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

  let active = built.get(Object.keys(sets)[0]);
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
    setActive(setName) {
      const next = built.get(setName);
      if (!next || next === active) return;
      if (active) active.group.visible = false;
      next.group.visible = true;
      active = next;
    },
    /** One float per instance per frame; see the module note. */
    scroll(distance) {
      if (!active) return;
      const offset = distance % span;
      for (const entry of active.meshes) {
        const array = entry.mesh.instanceMatrix.array;
        for (let index = 0; index < entry.baseZ.length; index += 1) {
          const shifted = entry.baseZ[index] - farZ + offset;
          array[index * 16 + Z_TRANSLATION_OFFSET] = farZ + (shifted % span) + entry.zOffset[index];
        }
        entry.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    /**
     * Every set is repainted, not just the visible one: a set that is hidden
     * during a crossfade would otherwise appear still wearing the palette of
     * whichever biome was on screen when it was last shown.
     */
    applyPalette(next) {
      for (const entry of allManaged) {
        const hex = next.kit[entry.name];
        if (hex) entry.material.color.set(hex);
      }
    },
  };
}

function emptyScatter(span, startZ) {
  return {
    sets: new Map(),
    meshes: [],
    span,
    startZ,
    setActive() {},
    scroll() {},
    applyPalette() {},
  };
}

/** Loaded in parallel: seventeen serial awaits used to gate the whole boot. */
async function loadModels(THREE, loader, names, palette) {
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${MODEL_DIR}/${name}.glb`);
        repaintKitModel(THREE, gltf.scene, palette.kit);
        return [name, { parts: collectParts(THREE, gltf.scene) }];
      } catch (error) {
        console.warn(`scatter: could not load ${name}.glb`, error);
        return null;
      }
    }),
  );

  return new Map(entries.filter(Boolean));
}

/** One entry per primitive, carrying its transform relative to the model root. */
function collectParts(THREE, root) {
  root.updateWorldMatrix(true, true);
  const parts = [];

  root.traverse((child) => {
    if (!child.isMesh) return;
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    parts.push({
      geometry: child.geometry,
      material,
      matrix: child.matrixWorld.clone(),
      managed: [{ name: material.name, material }],
    });
  });

  return parts;
}

function planPlacements(rng, layer, span, farZ, heightAt) {
  const [minDist, maxDist] = layer.band;
  const [minScale, maxScale] = layer.scale;

  return Array.from({ length: layer.count }, () => {
    const x = (rng() < 0.5 ? -1 : 1) * range(rng, minDist, maxDist);
    return {
      model: layer.models[Math.floor(rng() * layer.models.length) % layer.models.length],
      x,
      // Sunk very slightly so a flat model base never floats over a sloped bank.
      y: heightAt(x) - 0.05,
      z: farZ + rng() * span,
      rotationY: rng() * Math.PI * 2,
      scale: range(rng, minScale, maxScale),
    };
  });
}

function groupByModel(placements) {
  const byModel = new Map();
  for (const placement of placements) {
    if (!byModel.has(placement.model)) byModel.set(placement.model, []);
    byModel.get(placement.model).push(placement);
  }
  return byModel;
}

function buildInstancedMesh(THREE, group, part, placements, layer, layerName) {
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
