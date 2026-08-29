/**
 * Three.js scene for the Low-Poly Runner - Authentic Natural Forest Road & Canopy Tunnel.
 *
 * Implements a lush, immersive woodland aesthetic inspired by natural dirt forest trails:
 * - Overarching tree canopy forming a "green tunnel" overhead.
 * - Earthen dirt trail with subtle wheel/foot ruts and mossy encroaching verges.
 * - Dense vertical tree trunks, rich trailside undergrowth, and woodland details.
 * - Atmospheric morning sunbeams, misty emerald fog, and floating golden forest motes.
 */

import { CONFIG, THREE_MODULE_URL, GLTF_LOADER_URL } from '../config.js?v=1.9.1';
import { laneToX } from './state.js?v=1.9.1';

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
  // Tall arching trees that create the overarching canopy tunnel
  canopyArch: [
    { id: 'treeTall', path: './assets/models/nature/tree_tall.glb', scale: 3.4 },
    { id: 'treeTallDark', path: './assets/models/nature/tree_tall_dark.glb', scale: 3.4 },
    { id: 'treeTallFall', path: './assets/models/nature/tree_tall_fall.glb', scale: 3.3 },
    { id: 'treeThin', path: './assets/models/nature/tree_thin.glb', scale: 3.5 },
    { id: 'treeThinDark', path: './assets/models/nature/tree_thin_dark.glb', scale: 3.5 },
    { id: 'treeOak', path: './assets/models/nature/tree_oak.glb', scale: 3.1 },
    { id: 'treeOakDark', path: './assets/models/nature/tree_oak_dark.glb', scale: 3.1 },
    { id: 'treeDetailed', path: './assets/models/nature/tree_detailed.glb', scale: 3.1 },
    { id: 'treeDetailedDark', path: './assets/models/nature/tree_detailed_dark.glb', scale: 3.1 },
    { id: 'pineTallA', path: './assets/models/nature/tree_pineTallA_detailed.glb', scale: 3.3 },
    { id: 'pineTallB', path: './assets/models/nature/tree_pineTallB_detailed.glb', scale: 3.3 },
  ],
  // Flank trees: dense vertical woodland stands & deep forest canopy
  flankTrees: [
    { id: 'pineDefaultA', path: './assets/models/nature/tree_pineDefaultA.glb', scale: 2.7 },
    { id: 'pineDefaultB', path: './assets/models/nature/tree_pineDefaultB.glb', scale: 2.7 },
    { id: 'pineRoundA', path: './assets/models/nature/tree_pineRoundA.glb', scale: 2.8 },
    { id: 'pineRoundC', path: './assets/models/nature/tree_pineRoundC.glb', scale: 2.6 },
    { id: 'treeCone', path: './assets/models/nature/tree_cone.glb', scale: 2.6 },
    { id: 'treeConeDark', path: './assets/models/nature/tree_cone_dark.glb', scale: 2.6 },
    { id: 'treePlateau', path: './assets/models/nature/tree_plateau.glb', scale: 2.8 },
    { id: 'treeFat', path: './assets/models/nature/tree_fat.glb', scale: 2.6 },
    { id: 'treeSimple', path: './assets/models/nature/tree_simple.glb', scale: 2.6 },
  ],
  // Dense trailside shrubs, ferns, wild grass & flowers
  undergrowth: [
    { id: 'plantBushDetailed', path: './assets/models/nature/plant_bushDetailed.glb', scale: 2.3 },
    { id: 'plantBushLarge', path: './assets/models/nature/plant_bushLarge.glb', scale: 2.4 },
    { id: 'plantBushSmall', path: './assets/models/nature/plant_bushSmall.glb', scale: 2.0 },
    { id: 'plantFlatTall', path: './assets/models/nature/plant_flatTall.glb', scale: 2.5 },
    { id: 'plantFlatShort', path: './assets/models/nature/plant_flatShort.glb', scale: 2.4 },
    { id: 'grassLarge', path: './assets/models/nature/grass_large.glb', scale: 2.3 },
    { id: 'flowerYellow', path: './assets/models/nature/flower_yellowA.glb', scale: 2.2 },
    { id: 'flowerPurple', path: './assets/models/nature/flower_purpleA.glb', scale: 2.2 },
    { id: 'flowerRed', path: './assets/models/nature/flower_redA.glb', scale: 2.2 },
  ],
  // Forest floor details: mossy logs, stumps, mushroom clusters, boulders
  props: [
    { id: 'mushroomRed', path: './assets/models/nature/mushroom_redGroup.glb', scale: 2.5 },
    { id: 'mushroomTan', path: './assets/models/nature/mushroom_tanGroup.glb', scale: 2.5 },
    { id: 'logLarge', path: './assets/models/nature/log_large.glb', scale: 2.1 },
    { id: 'logStack', path: './assets/models/nature/log_stack.glb', scale: 2.0 },
    { id: 'stumpRound', path: './assets/models/nature/stump_roundDetailed.glb', scale: 2.0 },
    { id: 'stumpOld', path: './assets/models/nature/stump_old.glb', scale: 2.0 },
    { id: 'campfireStones', path: './assets/models/nature/campfire_stones.glb', scale: 1.9 },
    { id: 'rockSmallA', path: './assets/models/nature/rock_smallA.glb', scale: 2.4 },
    { id: 'rockSmallB', path: './assets/models/nature/rock_smallB.glb', scale: 2.4 },
    { id: 'rockLargeA', path: './assets/models/nature/rock_largeA.glb', scale: 2.2 },
    { id: 'rockTallA', path: './assets/models/nature/rock_tallA.glb', scale: 2.4 },
    { id: 'stoneLargeA', path: './assets/models/nature/stone_largeA.glb', scale: 2.3 },
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
 * Organic, authentic natural forest scenery with overarching canopy tunnel:
 * - Layer 1 (Overarching Canopy Tunnel): Tall trees leaning inward over the road forming the green tunnel.
 * - Layer 2 (Trailside Undergrowth): Dense shrubs, ferns, wildflowers, and fallen logs along dirt verges.
 * - Layer 3 (Dense Vertical Forest Columns): Flanking groves with tall vertical trunks rising through foliage.
 * - Layer 4 (Deep Forest Stands & Rock Outcrops): Massive dark pines, plateau oaks, and granite boulders.
 */
async function addRoadsideScenery(THREE, scene, config, loader) {
  const span = config.scenery.span;
  const startZ = ROAD_BEHIND_PLAYER - span;
  const items = [];

  // Pre-load all nature GLB models categorized by type
  const loadedPools = {
    canopyArch: [],
    flankTrees: [],
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

  const allTrees = [...loadedPools.canopyArch, ...loadedPools.flankTrees];
  const hasAssets = allTrees.length > 0;

  const rng = createPRNG(4281);
  const pick = (arr) => (arr.length > 0 ? arr[Math.floor(rng() * arr.length)] : null);

  // Generate scenic clusters across both Left (side = -1) and Right (side = +1)
  const sides = [-1, 1];

  for (const side of sides) {
    // 1. Overarching Canopy Tunnel Trees (|X| = 4.2 to 6.2)
    // Tall trees that lean inward over the road to form the green canopy tunnel
    let curZ = startZ + rng() * 3.0;
    while (curZ < ROAD_BEHIND_PLAYER) {
      curZ += 4.2 + rng() * 3.2; // step 4.2 - 7.4m
      if (curZ >= ROAD_BEHIND_PLAYER) break;

      const clusterGroup = new THREE.Group();
      const baseZ = curZ;
      const posX = side * (4.2 + rng() * 1.8);
      const posY = getTerrainElevation(Math.abs(posX));

      if (loadedPools.canopyArch.length > 0) {
        const archEntry = pick(loadedPools.canopyArch);
        const archMesh = archEntry.model.clone(true);
        const s = archEntry.asset.scale * (0.95 + rng() * 0.35);
        archMesh.scale.set(s, s, s);

        // Inward tilt over the dirt road to form the green canopy tunnel
        // Left side leans right (rotation.z negative), Right side leans left (rotation.z positive)
        const inwardLean = side === -1 ? -(0.14 + rng() * 0.12) : (0.14 + rng() * 0.12);
        const pitchLean = (rng() - 0.5) * 0.08;
        archMesh.rotation.set(pitchLean, rng() * Math.PI * 2, inwardLean);
        clusterGroup.add(archMesh);

        // Dense undergrowth hugging the foot of the canopy tree
        if (loadedPools.undergrowth.length > 0) {
          const bushEntry = pick(loadedPools.undergrowth);
          const bush = bushEntry.model.clone(true);
          const bs = bushEntry.asset.scale * (0.8 + rng() * 0.4);
          bush.scale.set(bs, bs, bs);
          bush.position.set(-side * 0.6 + (rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.8);
          bush.rotation.y = rng() * Math.PI * 2;
          clusterGroup.add(bush);
        }

        // 60% chance of mushrooms, wildflowers, or mossy stump at the tree base
        if (rng() < 0.6 && loadedPools.props.length > 0) {
          const propEntry = pick(loadedPools.props);
          const prop = propEntry.model.clone(true);
          const ps = propEntry.asset.scale * (0.75 + rng() * 0.35);
          prop.scale.set(ps, ps, ps);
          prop.position.set((rng() - 0.5) * 1.2, 0, (rng() - 0.5) * 1.2);
          prop.rotation.y = rng() * Math.PI * 2;
          clusterGroup.add(prop);
        }
      }

      clusterGroup.position.set(posX, posY, baseZ);
      scene.add(clusterGroup);
      items.push({ group: clusterGroup, baseZ, initialX: posX });
    }

    // 2. Trailside Low Undergrowth & Ground Cover (|X| = 2.8 to 4.2)
    // Fills gaps between canopy trees along the dirt road verge
    curZ = startZ + rng() * 2.5;
    while (curZ < ROAD_BEHIND_PLAYER) {
      curZ += 3.2 + rng() * 2.8;
      if (curZ >= ROAD_BEHIND_PLAYER) break;

      if (rng() < 0.75) {
        const clusterGroup = new THREE.Group();
        const baseZ = curZ;
        const posX = side * (2.8 + rng() * 1.3);
        const posY = getTerrainElevation(Math.abs(posX));

        const featureRoll = rng();
        if (featureRoll < 0.45 && loadedPools.undergrowth.length > 0) {
          const bushEntry = pick(loadedPools.undergrowth);
          const bush = bushEntry.model.clone(true);
          const s = bushEntry.asset.scale * (0.75 + rng() * 0.35);
          bush.scale.set(s, s, s);
          bush.rotation.y = rng() * Math.PI * 2;
          clusterGroup.add(bush);

          if (rng() < 0.5 && loadedPools.props.length > 0) {
            const shroom = pick(loadedPools.props).model.clone(true);
            shroom.scale.set(1.4, 1.4, 1.4);
            shroom.position.set((rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6);
            shroom.rotation.y = rng() * Math.PI * 2;
            clusterGroup.add(shroom);
          }
        } else if (featureRoll < 0.75 && loadedPools.props.length > 0) {
          const propEntry = pick(loadedPools.props);
          const prop = propEntry.model.clone(true);
          const s = propEntry.asset.scale * (0.8 + rng() * 0.35);
          prop.scale.set(s, s, s);
          prop.rotation.y = rng() * Math.PI * 2;
          if (propEntry.asset.id.includes('log')) {
            prop.rotation.y = (rng() - 0.5) * 0.5;
          }
          clusterGroup.add(prop);
        } else if (loadedPools.undergrowth.length > 0) {
          const flowerEntry = pick(loadedPools.undergrowth);
          const flower = flowerEntry.model.clone(true);
          const s = flowerEntry.asset.scale * (0.8 + rng() * 0.3);
          flower.scale.set(s, s, s);
          flower.rotation.y = rng() * Math.PI * 2;
          clusterGroup.add(flower);
        }

        clusterGroup.position.set(posX, posY, baseZ);
        scene.add(clusterGroup);
        items.push({ group: clusterGroup, baseZ, initialX: posX });
      }
    }

    // 3. Dense Vertical Woodland Stands (|X| = 6.5 to 15.0) - Image 2 style
    curZ = startZ + rng() * 3.5;
    while (curZ < ROAD_BEHIND_PLAYER) {
      curZ += 4.8 + rng() * 3.8;
      if (curZ >= ROAD_BEHIND_PLAYER) break;

      const clusterGroup = new THREE.Group();
      const baseZ = curZ;
      const posX = side * (6.5 + rng() * 7.5);
      const posY = getTerrainElevation(Math.abs(posX));

      if (hasAssets) {
        // Vertical trunk tree
        const primaryTree = pick(loadedPools.flankTrees.length > 0 ? loadedPools.flankTrees : allTrees);
        const pMesh = primaryTree.model.clone(true);
        const pScale = primaryTree.asset.scale * (0.9 + rng() * 0.4);
        pMesh.scale.set(pScale, pScale, pScale);
        pMesh.rotation.y = rng() * Math.PI * 2;
        clusterGroup.add(pMesh);

        // 75% chance of secondary tree in grove
        if (rng() < 0.75) {
          const secTree = pick(allTrees);
          const sMesh = secTree.model.clone(true);
          const sScale = secTree.asset.scale * (0.7 + rng() * 0.35);
          sMesh.scale.set(sScale, sScale, sScale);
          const offX = (rng() - 0.5) * 2.5;
          const offZ = (rng() - 0.5) * 2.5;
          sMesh.position.set(offX, 0, offZ);
          sMesh.rotation.y = rng() * Math.PI * 2;
          clusterGroup.add(sMesh);
        }

        // 65% chance of base undergrowth / boulder
        if (rng() < 0.65 && (loadedPools.undergrowth.length > 0 || loadedPools.props.length > 0)) {
          const underEntry = rng() < 0.5 ? pick(loadedPools.undergrowth) : pick(loadedPools.props);
          if (underEntry) {
            const uMesh = underEntry.model.clone(true);
            const uScale = underEntry.asset.scale * (0.7 + rng() * 0.4);
            uMesh.scale.set(uScale, uScale, uScale);
            uMesh.position.set((rng() - 0.5) * 1.5, 0, (rng() - 0.5) * 1.5);
            uMesh.rotation.y = rng() * Math.PI * 2;
            clusterGroup.add(uMesh);
          }
        }
      }

      clusterGroup.position.set(posX, posY, baseZ);
      scene.add(clusterGroup);
      items.push({ group: clusterGroup, baseZ, initialX: posX });
    }

    // 4. Deep Forest Canopy & Ridge (|X| = 15.5 to 26.0)
    curZ = startZ + rng() * 4.5;
    while (curZ < ROAD_BEHIND_PLAYER) {
      curZ += 6.0 + rng() * 5.0;
      if (curZ >= ROAD_BEHIND_PLAYER) break;

      const clusterGroup = new THREE.Group();
      const baseZ = curZ;
      const posX = side * (15.5 + rng() * 9.5);
      const posY = getTerrainElevation(Math.abs(posX));

      if (hasAssets) {
        const isRockOutcrop = rng() < 0.35 && loadedPools.props.length > 0;
        if (isRockOutcrop) {
          const rockEntry = pick(loadedPools.props);
          const rMesh = rockEntry.model.clone(true);
          const rScale = rockEntry.asset.scale * (1.1 + rng() * 0.5);
          rMesh.scale.set(rScale, rScale, rScale);
          rMesh.rotation.y = rng() * Math.PI * 2;
          clusterGroup.add(rMesh);
        } else {
          const deepTree = pick(loadedPools.flankTrees.length > 0 ? loadedPools.flankTrees : allTrees);
          const tMesh = deepTree.model.clone(true);
          const tScale = deepTree.asset.scale * (1.05 + rng() * 0.45);
          tMesh.scale.set(tScale, tScale, tScale);
          tMesh.rotation.y = rng() * Math.PI * 2;
          clusterGroup.add(tMesh);

          if (rng() < 0.65) {
            const deepTree2 = pick(allTrees);
            const tMesh2 = deepTree2.model.clone(true);
            const tScale2 = deepTree2.asset.scale * (0.85 + rng() * 0.4);
            tMesh2.scale.set(tScale2, tScale2, tScale2);
            tMesh2.position.set((rng() - 0.5) * 3.5, 0, (rng() - 0.5) * 3.5);
            tMesh2.rotation.y = rng() * Math.PI * 2;
            clusterGroup.add(tMesh2);
          }
        }
      }

      clusterGroup.position.set(posX, posY, baseZ);
      scene.add(clusterGroup);
      items.push({ group: clusterGroup, baseZ, initialX: posX });
    }

    // 5. Distant Valley Flanks (|X| = 24.0 to 29.0)
    curZ = startZ + rng() * 6.0;
    while (curZ < ROAD_BEHIND_PLAYER) {
      curZ += 9.0 + rng() * 6.0;
      if (curZ >= ROAD_BEHIND_PLAYER) break;

      const clusterGroup = new THREE.Group();
      const baseZ = curZ;
      const posX = side * (24.0 + rng() * 5.0);
      const posY = getTerrainElevation(Math.abs(posX));

      if (hasAssets) {
        if (rng() < 0.45 && loadedPools.props.length > 0) {
          const rEntry = pick(loadedPools.props);
          const rMesh = rEntry.model.clone(true);
          const rScale = rEntry.asset.scale * (1.2 + rng() * 0.5);
          rMesh.scale.set(rScale, rScale, rScale);
          rMesh.rotation.y = rng() * Math.PI * 2;
          clusterGroup.add(rMesh);
        } else {
          const tEntry = pick(loadedPools.flankTrees.length > 0 ? loadedPools.flankTrees : allTrees);
          const tMesh = tEntry.model.clone(true);
          const tScale = tEntry.asset.scale * (1.15 + rng() * 0.45);
          tMesh.scale.set(tScale, tScale, tScale);
          tMesh.rotation.y = rng() * Math.PI * 2;
          clusterGroup.add(tMesh);
        }
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
