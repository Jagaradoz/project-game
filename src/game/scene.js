/**
 * Three.js scene for the Low-Poly Runner - Authentic Natural Forest Road & Canopy Tunnel.
 *
 * Implements a lush, immersive woodland aesthetic inspired by natural dirt forest trails:
 * - Overarching tree canopy forming a "green tunnel" overhead.
 * - Earthen dirt trail with subtle wheel/foot ruts and mossy encroaching verges.
 * - Dense vertical tree trunks, rich trailside undergrowth, and woodland details.
 * - Atmospheric morning sunbeams, misty emerald fog, and floating golden forest motes.
 */

import { CONFIG, THREE_MODULE_URL, GLTF_LOADER_URL } from '../config.js?v=1.9.4';
import { laneToX } from './state.js?v=1.9.4';

const ROAD_THICKNESS = 0.25;
const ROAD_TOP_Y = ROAD_THICKNESS / 2;
const ROAD_BEHIND_PLAYER = 18;
const FOG_NEAR = 65;
const FOG_FAR = 260;

/** Deterministic pseudo-random number generator for consistent procedural scatter */
function createPRNG(seed = 4281) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const NATURE_GLB_ASSETS = {
  // Roadside feature trees: slender, elegant low-poly pines, birches, and tall oaks with clean vertical lines
  roadsideTrees: [
    { id: 'treeTall', path: './assets/models/nature/tree_tall.glb', scale: 3.1 },
    { id: 'treeTallDark', path: './assets/models/nature/tree_tall_dark.glb', scale: 3.1 },
    { id: 'treeThin', path: './assets/models/nature/tree_thin.glb', scale: 3.2 },
    { id: 'treeThinDark', path: './assets/models/nature/tree_thin_dark.glb', scale: 3.2 },
    { id: 'treeOak', path: './assets/models/nature/tree_oak.glb', scale: 2.8 },
    { id: 'treeOakDark', path: './assets/models/nature/tree_oak_dark.glb', scale: 2.8 },
    { id: 'treeDetailed', path: './assets/models/nature/tree_detailed.glb', scale: 2.8 },
    { id: 'treePineTallA', path: './assets/models/nature/tree_pineTallA_detailed.glb', scale: 3.0 },
    { id: 'treePineTallB', path: './assets/models/nature/tree_pineTallB_detailed.glb', scale: 3.0 },
    { id: 'treePineTallC', path: './assets/models/nature/tree_pineTallC_detailed.glb', scale: 3.0 },
  ],
  // Meadow & rolling knoll trees: natural low-poly conifers and forest pines
  meadowTrees: [
    { id: 'pineDefaultA', path: './assets/models/nature/tree_pineDefaultA.glb', scale: 2.5 },
    { id: 'pineDefaultB', path: './assets/models/nature/tree_pineDefaultB.glb', scale: 2.5 },
    { id: 'pineRoundA', path: './assets/models/nature/tree_pineRoundA.glb', scale: 2.6 },
    { id: 'pineRoundB', path: './assets/models/nature/tree_pineRoundB.glb', scale: 2.6 },
    { id: 'treeCone', path: './assets/models/nature/tree_cone.glb', scale: 2.5 },
    { id: 'treeConeDark', path: './assets/models/nature/tree_cone_dark.glb', scale: 2.5 },
    { id: 'treeSimple', path: './assets/models/nature/tree_simple.glb', scale: 2.5 },
    { id: 'treeSimpleDark', path: './assets/models/nature/tree_simple_dark.glb', scale: 2.5 },
  ],
  // Trailside wildflower patches, low shrubs, and ferns
  undergrowth: [
    { id: 'flowerYellow', path: './assets/models/nature/flower_yellowA.glb', scale: 1.8 },
    { id: 'flowerPurple', path: './assets/models/nature/flower_purpleA.glb', scale: 1.8 },
    { id: 'flowerRed', path: './assets/models/nature/flower_redA.glb', scale: 1.8 },
    { id: 'plantBushSmall', path: './assets/models/nature/plant_bushSmall.glb', scale: 1.8 },
    { id: 'plantBushDetailed', path: './assets/models/nature/plant_bushDetailed.glb', scale: 1.9 },
    { id: 'plantFlatShort', path: './assets/models/nature/plant_flatShort.glb', scale: 1.9 },
    { id: 'grassLarge', path: './assets/models/nature/grass_large.glb', scale: 1.9 },
  ],
  // Minimal forest floor accents: mossy rocks, granite stones, small fallen log
  props: [
    { id: 'rockSmallA', path: './assets/models/nature/rock_smallA.glb', scale: 2.0 },
    { id: 'rockSmallB', path: './assets/models/nature/rock_smallB.glb', scale: 2.0 },
    { id: 'stoneLargeA', path: './assets/models/nature/stone_largeA.glb', scale: 1.8 },
    { id: 'logLarge', path: './assets/models/nature/log_large.glb', scale: 1.6 },
    { id: 'mushroomRed', path: './assets/models/nature/mushroom_redGroup.glb', scale: 1.8 },
  ],
};

/** Exact terrain surface elevation at a given lateral distance from road centerline */
function getTerrainElevation(absX) {
  if (absX <= 9.5) return 0.0;
  if (absX <= 21.0) return (absX - 9.5) * 0.01;
  return 0.115 + (absX - 21.0) * 0.015;
}

export async function createScene(canvas, config = CONFIG.game) {
  const THREE = await import(/* @vite-ignore */ THREE_MODULE_URL);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.colors.sky);
  scene.fog = new THREE.Fog(config.colors.fog, FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 500);
  camera.position.set(config.camera.x, config.camera.y, config.camera.z);
  camera.lookAt(0, config.camera.lookAtY, config.camera.lookAtZ);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  // Lighting tuned for bright sunlit forest canopy atmosphere and crisp low-poly facet highlights
  const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x22c55e, 2.4);
  scene.add(hemiLight);

  const sun = new THREE.DirectionalLight(0xfffaed, 2.8);
  sun.position.set(18, 36, 14);
  scene.add(sun);

  const ambientFill = new THREE.AmbientLight(0x7dd3fc, 1.1);
  scene.add(ambientFill);

  // Initialize GLTF Loader
  let loader = null;
  try {
    let GLTFLoaderClass = null;
    try {
      const mod = await import(/* @vite-ignore */ GLTF_LOADER_URL);
      GLTFLoaderClass = mod.GLTFLoader;
    } catch (e) {
      try {
        const mod2 = await import(/* @vite-ignore */ 'three/addons/loaders/GLTFLoader.js');
        GLTFLoaderClass = mod2.GLTFLoader;
      } catch (err) {
        console.warn('GLTFLoader dynamic import fallback failed:', err);
      }
    }
    if (GLTFLoaderClass) {
      loader = new GLTFLoaderClass();
    }
  } catch (err) {
    console.error('Failed to initialize GLTFLoader:', err);
  }

  const roadSegments = addLowPolyRoad(THREE, scene, config);
  const dashes = addDashes(THREE, scene, config);
  const scenery = await addRoadsideScenery(THREE, scene, config, loader);
  const fireflies = addFireflies(THREE, scene, config);
  const mountains = addBackgroundMountains(THREE, scene, config);
  const player = await addPlayer(THREE, scene, config, loader);
  const enemyPool = addEnemyPool(THREE, scene, config);
  const bulletPool = addBulletPool(THREE, scene, config);

  function resize() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function render() {
    renderer.render(scene, camera);
  }

  resize();

  return {
    THREE,
    scene,
    camera,
    renderer,
    player,
    enemyPool,
    bulletPool,
    dashes,
    roadSegments,
    scenery,
    fireflies,
    mountains,
    resize,
    render,
  };
}

function roadWidth(config) {
  return config.laneCount * config.laneWidth;
}

/**
 * Natural earthen forest trail with compacted dirt ruts, soft mossy grassy verges,
 * and rolling multi-tier woodland knoll embankments.
 */
function addLowPolyRoad(THREE, scene, config) {
  const width = roadWidth(config);
  const segmentLength = config.scenery.segmentLength;
  const count = config.scenery.segmentCount;
  const totalSpan = count * segmentLength;
  const startZ = ROAD_BEHIND_PLAYER - totalSpan;

  // Rich earthen dirt trail bed
  const roadMat = new THREE.MeshStandardMaterial({
    color: config.colors.road,
    roughness: 0.94,
    metalness: 0.03,
    flatShading: true,
  });

  // Darker compacted dirt wheel/foot ruts
  const rutMat = new THREE.MeshStandardMaterial({
    color: config.colors.roadEdge || '#3e2c1e',
    roughness: 0.98,
    metalness: 0.02,
    flatShading: true,
  });

  // Soft mossy/grassy verge encroaching along trail borders
  const vergeMat = new THREE.MeshStandardMaterial({
    color: config.colors.roadVerge || '#244d33',
    roughness: 0.9,
    flatShading: true,
  });

  const terrainMat = new THREE.MeshStandardMaterial({
    color: config.colors.terrain,
    roughness: 0.92,
    flatShading: true,
  });

  const terrainFacetedMat = new THREE.MeshStandardMaterial({
    color: config.colors.terrainFaceted,
    roughness: 0.88,
    flatShading: true,
  });

  const terrainDeepMat = new THREE.MeshStandardMaterial({
    color: config.colors.terrainDeep || '#0c2717',
    roughness: 0.94,
    flatShading: true,
  });

  const roadGeo = new THREE.BoxGeometry(width + 0.4, ROAD_THICKNESS, segmentLength);
  const rutGeo = new THREE.BoxGeometry(0.7, ROAD_THICKNESS + 0.02, segmentLength);
  const vergeGeo = new THREE.BoxGeometry(0.85, ROAD_THICKNESS + 0.05, segmentLength);
  const innerTerrainGeo = new THREE.BoxGeometry(14, ROAD_THICKNESS * 0.85, segmentLength);
  const midTerrainGeo = new THREE.BoxGeometry(22, ROAD_THICKNESS * 1.5, segmentLength);
  const outerTerrainGeo = new THREE.BoxGeometry(38, ROAD_THICKNESS * 2.5, segmentLength);

  const segments = [];

  for (let i = 0; i < count; i += 1) {
    const group = new THREE.Group();
    const baseZ = startZ + i * segmentLength + segmentLength / 2;

    // Main earthen dirt trail bed
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    group.add(roadMesh);

    // Left and right worn dirt rut tracks
    const rutL = new THREE.Mesh(rutGeo, rutMat);
    rutL.position.set(-0.95, 0.01, 0);
    group.add(rutL);

    const rutR = new THREE.Mesh(rutGeo, rutMat);
    rutR.position.set(0.95, 0.01, 0);
    group.add(rutR);

    // Soft natural grassy verges along the trail edges (no blocky curbs)
    const halfWidth = width / 2;
    const vergeL = new THREE.Mesh(vergeGeo, vergeMat);
    vergeL.position.set(-halfWidth - 0.25, 0.02, 0);
    vergeL.rotation.z = 0.04;
    group.add(vergeL);

    const vergeR = new THREE.Mesh(vergeGeo, vergeMat);
    vergeR.position.set(halfWidth + 0.25, 0.02, 0);
    vergeR.rotation.z = -0.04;
    group.add(vergeR);

    // Tier 1 inner grassy meadow
    const terrainL1 = new THREE.Mesh(innerTerrainGeo, terrainMat);
    terrainL1.position.set(-halfWidth - 7.2, -0.01, 0);
    terrainL1.rotation.z = 0.015;
    group.add(terrainL1);

    const terrainR1 = new THREE.Mesh(innerTerrainGeo, terrainMat);
    terrainR1.position.set(halfWidth + 7.2, -0.01, 0);
    terrainR1.rotation.z = -0.015;
    group.add(terrainR1);

    // Tier 2 mid elevated forest knoll
    const terrainL2 = new THREE.Mesh(midTerrainGeo, terrainFacetedMat);
    terrainL2.position.set(-halfWidth - 21.0, 0.12, 0);
    terrainL2.rotation.z = 0.025;
    group.add(terrainL2);

    const terrainR2 = new THREE.Mesh(midTerrainGeo, terrainFacetedMat);
    terrainR2.position.set(halfWidth + 21.0, 0.12, 0);
    terrainR2.rotation.z = -0.025;
    group.add(terrainR2);

    // Tier 3 outer valley flanks
    const terrainL3 = new THREE.Mesh(outerTerrainGeo, terrainDeepMat);
    terrainL3.position.set(-halfWidth - 46.0, 0.35, 0);
    terrainL3.rotation.z = 0.035;
    group.add(terrainL3);

    const terrainR3 = new THREE.Mesh(outerTerrainGeo, terrainDeepMat);
    terrainR3.position.set(halfWidth + 46.0, 0.35, 0);
    terrainR3.rotation.z = -0.035;
    group.add(terrainR3);

    group.position.set(0, 0, baseZ);
    scene.add(group);
    segments.push({ group, baseZ });
  }

  return { items: segments, span: totalSpan, startZ, segmentLength };
}

/**
 * Luminous woodland spirit trail dots guiding the player through the 3 lanes naturally.
 */
function addDashes(THREE, scene, config) {
  const geometry = new THREE.OctahedronGeometry(0.09, 0);
  const material = new THREE.MeshBasicMaterial({ color: config.colors.dash });
  const period = config.dashLength + config.dashGap;
  const dashes = [];

  for (let lane = 1; lane < config.laneCount; lane += 1) {
    const x = laneToX(lane, config) - config.laneWidth / 2;
    for (let index = 0; index < config.dashCount; index += 1) {
      const dash = new THREE.Mesh(geometry, material);
      dash.position.set(x, ROAD_TOP_Y + 0.04, config.spawnZ + index * period);
      dash.rotation.y = Math.PI / 4;
      scene.add(dash);
      dashes.push({ mesh: dash, baseZ: config.spawnZ + index * period });
    }
  }

  return { items: dashes, period, span: config.dashCount * period, startZ: config.spawnZ };
}

/**
 * Organic, minimalist low-poly nature scenery:
 * - Layer 1 (Roadside Feature Trees): Elegant, well-spaced trees alternating along the trail with clear breathing room.
 * - Layer 2 (Meadow & Rolling Knolls): Broadly spaced woodland groves giving depth without clutter.
 * - Layer 3 (Distant Ridge & Foothills): Sparse tall pines and granite rock formations.
 * - Layer 4 (Delicate Trailside Accents): Tasteful wildflower patches, smooth stones, and low ferns along the verge.
 */
async function addRoadsideScenery(THREE, scene, config, loader) {
  const span = config.scenery.span;
  const startZ = ROAD_BEHIND_PLAYER - span;
  const items = [];

  // Pre-load all nature GLB models categorized by type
  const loadedPools = {
    roadsideTrees: [],
    meadowTrees: [],
    undergrowth: [],
    props: [],
  };

  if (loader) {
    for (const [poolKey, assetList] of Object.entries(NATURE_GLB_ASSETS)) {
      for (const asset of assetList) {
        try {
          const gltf = await loader.loadAsync(asset.path);
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          loadedPools[poolKey].push({ asset, model: gltf.scene });
        } catch (e) {
          console.warn(`Failed to load nature model ${asset.path}:`, e);
        }
      }
    }
  }

  const allTrees = [...loadedPools.roadsideTrees, ...loadedPools.meadowTrees];
  const rng = createPRNG(4281);
  const pick = (arr) => (arr.length > 0 ? arr[Math.floor(rng() * arr.length)] : null);

  // Generate scenic features across both Left (side = -1) and Right (side = +1)
  const sides = [-1, 1];

  for (const side of sides) {
    // 1. Roadside Feature Trees (|X| = 5.6 to 7.6)
    // Staggered with an offset between left and right sides so trees alternate naturally along the road
    const sideOffset = side === -1 ? 0 : 8.5;
    let curZ = startZ + 3.0 + sideOffset + rng() * 3.0;
    while (curZ < ROAD_BEHIND_PLAYER) {
      curZ += 15.0 + rng() * 11.0; // step 15m - 26m
      if (curZ >= ROAD_BEHIND_PLAYER) break;

      const clusterGroup = new THREE.Group();
      const baseZ = curZ;
      const posX = side * (5.6 + rng() * 1.8);
      const posY = getTerrainElevation(Math.abs(posX));

      const treePool = loadedPools.roadsideTrees.length > 0 ? loadedPools.roadsideTrees : allTrees;
      if (treePool.length > 0) {
        const treeEntry = pick(treePool);
        const treeMesh = treeEntry.model.clone(true);
        const s = treeEntry.asset.scale * (0.9 + rng() * 0.25);
        treeMesh.scale.set(s, s, s);

        // Subtle organic tilt (upright, slight natural low-poly lean)
        const tiltZ = (rng() - 0.5) * 0.06;
        const tiltX = (rng() - 0.5) * 0.06;
        treeMesh.rotation.set(tiltX, rng() * Math.PI * 2, tiltZ);
        clusterGroup.add(treeMesh);

        // 35% chance of a small wildflower or small rock accent at tree base
        if (rng() < 0.35) {
          const accentPool = rng() < 0.6 ? loadedPools.undergrowth : loadedPools.props;
          if (accentPool.length > 0) {
            const accentEntry = pick(accentPool);
            const accentMesh = accentEntry.model.clone(true);
            const as = accentEntry.asset.scale * 0.8;
            accentMesh.scale.set(as, as, as);
            accentMesh.position.set((rng() - 0.5) * 0.8, 0, (rng() - 0.5) * 0.8);
            accentMesh.rotation.y = rng() * Math.PI * 2;
            clusterGroup.add(accentMesh);
          }
        }
      }

      clusterGroup.position.set(posX, posY, baseZ);
      scene.add(clusterGroup);
      items.push({ group: clusterGroup, baseZ, initialX: posX });
    }

    // 2. Meadow & Rolling Knoll Trees (|X| = 9.5 to 17.0)
    // Spacious placement across the open grass knolls
    const meadowSideOffset = side === -1 ? 4.0 : 14.0;
    curZ = startZ + 5.0 + meadowSideOffset + rng() * 4.0;
    while (curZ < ROAD_BEHIND_PLAYER) {
      curZ += 20.0 + rng() * 14.0; // step 20m - 34m
      if (curZ >= ROAD_BEHIND_PLAYER) break;

      const clusterGroup = new THREE.Group();
      const baseZ = curZ;
      const posX = side * (9.5 + rng() * 7.5);
      const posY = getTerrainElevation(Math.abs(posX));

      const meadowPool = loadedPools.meadowTrees.length > 0 ? loadedPools.meadowTrees : allTrees;
      if (meadowPool.length > 0) {
        const treeEntry = pick(meadowPool);
        const treeMesh = treeEntry.model.clone(true);
        const s = treeEntry.asset.scale * (0.85 + rng() * 0.35);
        treeMesh.scale.set(s, s, s);
        treeMesh.rotation.set((rng() - 0.5) * 0.05, rng() * Math.PI * 2, (rng() - 0.5) * 0.05);
        clusterGroup.add(treeMesh);

        // 20% chance of a second companion tree in a loose grove
        if (rng() < 0.2 && allTrees.length > 0) {
          const compEntry = pick(allTrees);
          const compMesh = compEntry.model.clone(true);
          const cs = compEntry.asset.scale * (0.7 + rng() * 0.3);
          compMesh.scale.set(cs, cs, cs);
          compMesh.position.set((rng() - 0.5) * 2.8, 0, (rng() - 0.5) * 2.8);
          compMesh.rotation.y = rng() * Math.PI * 2;
          clusterGroup.add(compMesh);
        }
      }

      clusterGroup.position.set(posX, posY, baseZ);
      scene.add(clusterGroup);
      items.push({ group: clusterGroup, baseZ, initialX: posX });
    }

    // 3. Distant Foothills & Ridge Features (|X| = 19.0 to 30.0)
    // Sparse accents on the outer slopes
    curZ = startZ + 8.0 + sideOffset + rng() * 6.0;
    while (curZ < ROAD_BEHIND_PLAYER) {
      curZ += 30.0 + rng() * 20.0; // step 30m - 50m
      if (curZ >= ROAD_BEHIND_PLAYER) break;

      const clusterGroup = new THREE.Group();
      const baseZ = curZ;
      const posX = side * (19.0 + rng() * 11.0);
      const posY = getTerrainElevation(Math.abs(posX));

      const isRock = rng() < 0.35 && loadedPools.props.length > 0;
      if (isRock) {
        const rockEntry = pick(loadedPools.props);
        const rockMesh = rockEntry.model.clone(true);
        const rs = rockEntry.asset.scale * (1.1 + rng() * 0.4);
        rockMesh.scale.set(rs, rs, rs);
        rockMesh.rotation.y = rng() * Math.PI * 2;
        clusterGroup.add(rockMesh);
      } else if (allTrees.length > 0) {
        const distTree = pick(allTrees);
        const distMesh = distTree.model.clone(true);
        const ds = distTree.asset.scale * (1.0 + rng() * 0.4);
        distMesh.scale.set(ds, ds, ds);
        distMesh.rotation.y = rng() * Math.PI * 2;
        clusterGroup.add(distMesh);
      }

      clusterGroup.position.set(posX, posY, baseZ);
      scene.add(clusterGroup);
      items.push({ group: clusterGroup, baseZ, initialX: posX });
    }

    // 4. Subtle Trailside Ground Accents (|X| = 3.9 to 5.0)
    // Clean, spaced wildflowers, small rocks, and gentle ground details along the verge
    curZ = startZ + 7.0 + sideOffset + rng() * 4.0;
    while (curZ < ROAD_BEHIND_PLAYER) {
      curZ += 16.0 + rng() * 12.0; // step 16m - 28m
      if (curZ >= ROAD_BEHIND_PLAYER) break;

      const clusterGroup = new THREE.Group();
      const baseZ = curZ;
      const posX = side * (3.9 + rng() * 1.0);
      const posY = getTerrainElevation(Math.abs(posX));

      const roll = rng();
      if (roll < 0.45 && loadedPools.undergrowth.length > 0) {
        // Wildflower or low grass
        const flowerEntry = pick(loadedPools.undergrowth);
        const flowerMesh = flowerEntry.model.clone(true);
        const s = flowerEntry.asset.scale * (0.8 + rng() * 0.3);
        flowerMesh.scale.set(s, s, s);
        flowerMesh.rotation.y = rng() * Math.PI * 2;
        clusterGroup.add(flowerMesh);
      } else if (roll < 0.75 && loadedPools.props.length > 0) {
        // Small stone or rock
        const propEntry = pick(loadedPools.props);
        const propMesh = propEntry.model.clone(true);
        const s = propEntry.asset.scale * (0.75 + rng() * 0.3);
        propMesh.scale.set(s, s, s);
        propMesh.rotation.y = rng() * Math.PI * 2;
        if (propEntry.asset.id.includes('log')) {
          // Orient log parallel to the trail
          propMesh.rotation.y = (rng() - 0.5) * 0.3;
        }
        clusterGroup.add(propMesh);
      } else if (loadedPools.undergrowth.length > 0) {
        // Small low bush
        const bushEntry = pick(loadedPools.undergrowth);
        const bushMesh = bushEntry.model.clone(true);
        const s = bushEntry.asset.scale * (0.7 + rng() * 0.3);
        bushMesh.scale.set(s, s, s);
        bushMesh.rotation.y = rng() * Math.PI * 2;
        clusterGroup.add(bushMesh);
      }

      clusterGroup.position.set(posX, posY, baseZ);
      scene.add(clusterGroup);
      items.push({ group: clusterGroup, baseZ, initialX: posX });
    }
  }

  return { items, span, startZ };
}

/**
 * Atmospheric floating glowing forest motes and sun dust spores drifting through the canopy air.
 */
function addFireflies(THREE, scene, config) {
  const count = config.scenery.fireflyCount || 36;
  const span = config.scenery.span;
  const startZ = ROAD_BEHIND_PLAYER - span;
  const fireflyGeo = new THREE.OctahedronGeometry(0.12, 0);
  const fireflyMat = new THREE.MeshBasicMaterial({ color: config.colors.firefly || '#fef08a' });
  const items = [];

  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(fireflyGeo, fireflyMat);
    const side = i % 2 === 0 ? -1 : 1;
    const initialX = side * (0.8 + ((i * 13) % 11) * 0.7);
    const initialY = 1.0 + ((i * 7) % 6) * 0.7;
    const baseZ = startZ + (i * (span / count));
    const phase = i * 0.7;

    mesh.position.set(initialX, initialY, baseZ);
    scene.add(mesh);
    items.push({ mesh, baseZ, initialX, initialY, phase });
  }

  return { items, span, startZ };
}

/**
 * Layered low-poly background mountain ridges and green forested foothills.
 */
function addBackgroundMountains(THREE, scene, config) {
  const count = config.scenery.mountainCount || 22;
  const span = 320;
  const startZ = -200;
  const items = [];

  const mountainMat = new THREE.MeshStandardMaterial({
    color: config.colors.mountain,
    roughness: 0.92,
    flatShading: true,
  });

  const peakMat = new THREE.MeshStandardMaterial({
    color: config.colors.mountainPeak,
    roughness: 0.88,
    flatShading: true,
  });

  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const posX = side * (42 + ((i * 23) % 55));
    const posZ = startZ + ((i * 37) % span);
    const height = 32 + ((i * 29) % 40);
    const radius = 24 + ((i * 19) % 24);

    const group = new THREE.Group();
    const coneGeo = new THREE.ConeGeometry(radius, height, 6);
    const baseMesh = new THREE.Mesh(coneGeo, mountainMat);
    baseMesh.position.y = height / 2 - 3;
    group.add(baseMesh);

    // Forest mist mountain crest
    const capGeo = new THREE.ConeGeometry(radius * 0.42, height * 0.42, 6);
    const capMesh = new THREE.Mesh(capGeo, peakMat);
    capMesh.position.y = height - (height * 0.42) / 2 - 3;
    group.add(capMesh);

    group.position.set(posX, 0, posZ);
    scene.add(group);
    items.push({ group, baseZ: posZ, initialX: posX });
  }

  return { items, span, startZ };
}

/**
 * Rigged 3D player character with skeletal animations and low-poly fallback.
 */
async function addPlayer(THREE, scene, config, loader) {
  const group = new THREE.Group();

  // Procedural geometric fallback group
  const fallbackGroup = new THREE.Group();
  const bodyGeo = new THREE.IcosahedronGeometry(config.playerRadius, 1);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: config.colors.player,
    roughness: 0.25,
    metalness: 0.4,
    flatShading: true,
    transparent: true,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  fallbackGroup.add(body);

  const ringGeo = new THREE.TorusGeometry(config.playerRadius * 0.95, 0.08, 6, 12);
  const ringMat = new THREE.MeshBasicMaterial({ color: config.colors.dash, transparent: true });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  fallbackGroup.add(ring);

  fallbackGroup.position.y = config.playerRadius;
  group.add(fallbackGroup);

  // Model container for loaded rigged GLTF characters
  const modelContainer = new THREE.Group();
  group.add(modelContainer);

  group.position.set(laneToX(1, config), ROAD_TOP_Y, config.playerZ);
  scene.add(group);

  const playerObj = {
    group,
    body,
    ring,
    material: bodyMat,
    materials: [bodyMat, ringMat],
    mixer: null,
    actions: {},
    currentAction: null,
    currentActionName: null,
    characterId: config.defaultCharacter || 'robot',
    fallbackVisible: true,
    modelContainer,
    fallbackGroup,
  };

  const gltfCache = new Map();

  playerObj.playAnimation = function playAnimation(name, duration = 0.2, loop = true) {
    if (!playerObj.mixer || playerObj.fallbackVisible) return;
    if (playerObj.currentActionName === name && playerObj.currentAction?.isRunning()) return;

    const targetAction =
      playerObj.actions[name] ||
      playerObj.actions.run ||
      playerObj.actions.idle ||
      Object.values(playerObj.actions)[0];

    if (!targetAction) return;

    if (loop) {
      targetAction.setLoop(THREE.LoopRepeat, Infinity);
      targetAction.clampWhenFinished = false;
    } else {
      targetAction.setLoop(THREE.LoopOnce, 1);
      targetAction.clampWhenFinished = true;
    }

    if (playerObj.currentAction && playerObj.currentAction !== targetAction) {
      targetAction.reset();
      targetAction.fadeIn(duration);
      targetAction.play();
      playerObj.currentAction.fadeOut(duration);
    } else {
      targetAction.reset();
      targetAction.play();
    }

    playerObj.currentAction = targetAction;
    playerObj.currentActionName = name;
  };

  playerObj.loadCharacter = async function loadCharacter(charId) {
    playerObj.characterId = charId;

    if (charId === 'orb' || !loader) {
      // Switch to procedural energy orb
      modelContainer.visible = false;
      fallbackGroup.visible = true;
      playerObj.fallbackVisible = true;
      if (playerObj.mixer) {
        playerObj.mixer.stopAllAction();
        playerObj.mixer = null;
      }
      playerObj.materials = [bodyMat, ringMat];
      playerObj.actions = {};
      playerObj.currentAction = null;
      playerObj.currentActionName = null;
      return true;
    }

    const charDef = config.characters?.[charId] || config.characters?.robot;
    if (!charDef || !charDef.path) return false;

    try {
      let gltf = gltfCache.get(charDef.path);
      if (!gltf) {
        gltf = await loader.loadAsync(charDef.path);
        gltfCache.set(charDef.path, gltf);
      }

      // Clean up previous model and mixer
      if (playerObj.mixer) {
        playerObj.mixer.stopAllAction();
      }
      while (modelContainer.children.length > 0) {
        modelContainer.remove(modelContainer.children[0]);
      }

      const model = gltf.scene;
      const materials = [];

      model.traverse((child) => {
        if (child.isMesh || child.isSkinnedMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            // Clone materials so opacity blinking doesn't affect other models
            if (Array.isArray(child.material)) {
              child.material = child.material.map((m) => {
                const cm = m.clone();
                cm.transparent = true;
                materials.push(cm);
                return cm;
              });
            } else {
              child.material = child.material.clone();
              child.material.transparent = true;
              materials.push(child.material);
            }
          }
        }
      });

      // Align model bounding box to place feet on ground level (Y = 0)
      const box = new THREE.Box3().setFromObject(model);
      const scale = charDef.scale || 1.0;
      model.scale.set(scale, scale, scale);

      // Recompute ground offset after scale
      const scaledBox = new THREE.Box3().setFromObject(model);
      model.position.set(0, -scaledBox.min.y + (charDef.offsetY || 0), 0);
      model.rotation.y = charDef.rotationY ?? Math.PI;

      modelContainer.add(model);
      modelContainer.visible = true;
      fallbackGroup.visible = false;

      // Set up AnimationMixer with animations from original GLTF
      const mixer = new THREE.AnimationMixer(model);
      const actions = {};
      const clipMap = new Map(gltf.animations.map((c) => [c.name.toLowerCase(), c]));

      for (const [logicalName, clipName] of Object.entries(charDef.animations || {})) {
        let clip = gltf.animations.find((c) => c.name === clipName);
        if (!clip) {
          clip = clipMap.get(clipName.toLowerCase());
        }
        if (clip) {
          actions[logicalName] = mixer.clipAction(clip);
        }
      }

      // If no configured clips matched, make all available clips accessible
      if (Object.keys(actions).length === 0 && gltf.animations.length > 0) {
        gltf.animations.forEach((clip, idx) => {
          const name = idx === 0 ? 'run' : clip.name.toLowerCase();
          actions[name] = mixer.clipAction(clip);
        });
      }

      playerObj.mixer = mixer;
      playerObj.actions = actions;
      playerObj.materials = materials.length > 0 ? materials : [bodyMat];
      playerObj.fallbackVisible = false;
      playerObj.currentAction = null;
      playerObj.currentActionName = null;

      playerObj.playAnimation('run', 0.1, true);
      return true;
    } catch (err) {
      console.error(`Failed to load character model ${charId}:`, err);
      modelContainer.visible = false;
      fallbackGroup.visible = true;
      playerObj.fallbackVisible = true;
      playerObj.materials = [bodyMat, ringMat];
      return false;
    }
  };

  // Pre-load default character
  await playerObj.loadCharacter(config.defaultCharacter || 'robot');

  return playerObj;
}

/**
 * Low-poly faceted enemy combat drones with glowing energy core and orbit ring.
 */
function addEnemyPool(THREE, scene, config) {
  const coreGeo = new THREE.OctahedronGeometry(config.enemyRadius * 0.85, 0);
  const coreMat = new THREE.MeshStandardMaterial({
    color: config.colors.enemy,
    roughness: 0.25,
    metalness: 0.7,
    flatShading: true,
  });

  const ringGeo = new THREE.TorusGeometry(config.enemyRadius * 1.1, 0.05, 5, 8);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });

  return Array.from({ length: config.enemyPoolSize }, () => {
    const group = new THREE.Group();
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 3;
    group.add(ring);

    group.position.y = ROAD_TOP_Y + config.enemyRadius;
    group.visible = false;
    scene.add(group);
    return group;
  });
}

/**
 * Glowing energy projectiles.
 */
function addBulletPool(THREE, scene, config) {
  const geometry = new THREE.BoxGeometry(
    config.bulletRadius * 2,
    config.bulletRadius * 2,
    config.bulletRadius * 8,
  );
  const material = new THREE.MeshBasicMaterial({ color: config.colors.bullet });

  return Array.from({ length: config.bulletPoolSize }, () => {
    const bullet = new THREE.Mesh(geometry, material);
    bullet.position.y = ROAD_TOP_Y + config.playerRadius;
    bullet.visible = false;
    scene.add(bullet);
    return bullet;
  });
}

export { ROAD_TOP_Y };
