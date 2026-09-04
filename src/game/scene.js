/**
 * Three.js scene for the Low-Poly Runner - Authentic Kenney Nature Kit 3D Assets.
 *
 * Implements a rich, stylized low-poly woodland aesthetic using official CC0 low-poly
 * 3D nature models (pines, oaks, detailed trees, rocks, boulders, logs, stumps,
 * mushroom clusters, bushes, and campfires), combined with earthen forest trails,
 * timber/moss curbs, floating fireflies, and rolling misty mountain ridges.
 */

import { CONFIG, THREE_MODULE_URL, GLTF_LOADER_URL } from '../config.js?v=1.8.1';
import { laneToX } from './state.js?v=1.8.1';

const ROAD_THICKNESS = 0.25;
const ROAD_TOP_Y = ROAD_THICKNESS / 2;
const ROAD_BEHIND_PLAYER = 18;
const FOG_NEAR = 55;
const FOG_FAR = 240;

const NATURE_GLB_ASSETS = {
  foreground: [
    { id: 'plantBush', path: './assets/models/nature/plant_bushDetailed.glb', scale: 2.2 },
    { id: 'plantBushLarge', path: './assets/models/nature/plant_bushLarge.glb', scale: 2.2 },
    { id: 'mushroomGroup', path: './assets/models/nature/mushroom_redGroup.glb', scale: 2.4 },
    { id: 'rockSmall', path: './assets/models/nature/rock_smallA.glb', scale: 2.5 },
    { id: 'logLarge', path: './assets/models/nature/log_large.glb', scale: 1.9 },
    { id: 'stumpRound', path: './assets/models/nature/stump_roundDetailed.glb', scale: 1.8 },
    { id: 'campfireStones', path: './assets/models/nature/campfire_stones.glb', scale: 1.8 },
  ],
  midground: [
    { id: 'pineDefaultA', path: './assets/models/nature/tree_pineDefaultA.glb', scale: 2.5 },
    { id: 'pineTallA', path: './assets/models/nature/tree_pineTallA_detailed.glb', scale: 2.5 },
    { id: 'treeOak', path: './assets/models/nature/tree_oak.glb', scale: 2.4 },
    { id: 'treeDetailed', path: './assets/models/nature/tree_detailed.glb', scale: 2.4 },
    { id: 'rockLargeA', path: './assets/models/nature/rock_largeA.glb', scale: 2.0 },
    { id: 'rockTallA', path: './assets/models/nature/rock_tallA.glb', scale: 2.2 },
  ],
  background: [
    { id: 'pineRoundA', path: './assets/models/nature/tree_pineRoundA.glb', scale: 2.8 },
    { id: 'treePlateau', path: './assets/models/nature/tree_plateau.glb', scale: 2.8 },
    { id: 'treeFat', path: './assets/models/nature/tree_fat.glb', scale: 2.6 },
    { id: 'treeDetailedBg', path: './assets/models/nature/tree_detailed.glb', scale: 2.7 },
  ],
};

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

  // Lighting tuned for lush forest canopy atmosphere and crisp low-poly facet highlights
  const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x14532d, 1.6);
  scene.add(hemiLight);

  const sun = new THREE.DirectionalLight(0xfffae0, 2.0);
  sun.position.set(16, 24, 12);
  scene.add(sun);

  const ambientFill = new THREE.AmbientLight(0x132e27, 0.8);
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
 * Modular low-poly forest trail with earthen track decks, alternating timber logs &
 * mossy stone curbs, and dual-layer grassy knoll embankments.
 */
function addLowPolyRoad(THREE, scene, config) {
  const width = roadWidth(config);
  const segmentLength = config.scenery.segmentLength;
  const count = config.scenery.segmentCount;
  const totalSpan = count * segmentLength;
  const startZ = ROAD_BEHIND_PLAYER - totalSpan;

  const roadMat = new THREE.MeshStandardMaterial({
    color: config.colors.road,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  });

  const curbMossMat = new THREE.MeshStandardMaterial({
    color: config.colors.curbLight,
    roughness: 0.8,
    metalness: 0.1,
    flatShading: true,
  });

  const curbTimberMat = new THREE.MeshStandardMaterial({
    color: config.colors.curbDark,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });

  const terrainMat = new THREE.MeshStandardMaterial({
    color: config.colors.terrain,
    roughness: 0.9,
    flatShading: true,
  });

  const terrainFacetedMat = new THREE.MeshStandardMaterial({
    color: config.colors.terrainFaceted,
    roughness: 0.85,
    flatShading: true,
  });

  const roadGeo = new THREE.BoxGeometry(width, ROAD_THICKNESS, segmentLength);
  const curbGeo = new THREE.BoxGeometry(0.42, ROAD_THICKNESS + 0.14, segmentLength / 4);
  const innerTerrainGeo = new THREE.BoxGeometry(10, ROAD_THICKNESS * 0.85, segmentLength);
  const outerTerrainGeo = new THREE.BoxGeometry(18, ROAD_THICKNESS * 1.6, segmentLength);

  const segments = [];

  for (let i = 0; i < count; i += 1) {
    const group = new THREE.Group();
    const baseZ = startZ + i * segmentLength + segmentLength / 2;

    // Main earthen forest trail deck
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    group.add(roadMesh);

    // Left and right curbs: alternating carved timber logs and mossy stone blocks
    const halfWidth = width / 2;
    for (let c = 0; c < 4; c += 1) {
      const cz = -segmentLength / 2 + (c + 0.5) * (segmentLength / 4);
      const isAlt = (i * 4 + c) % 2 === 0;
      const cMat = isAlt ? curbMossMat : curbTimberMat;

      const curbL = new THREE.Mesh(curbGeo, cMat);
      curbL.position.set(-halfWidth - 0.21, 0.07, cz);
      group.add(curbL);

      const curbR = new THREE.Mesh(curbGeo, cMat);
      curbR.position.set(halfWidth + 0.21, 0.07, cz);
      group.add(curbR);
    }

    // Tier 1 inner grassy embankment
    const terrainL1 = new THREE.Mesh(innerTerrainGeo, terrainMat);
    terrainL1.position.set(-halfWidth - 5.3, -0.02, 0);
    terrainL1.rotation.z = 0.05;
    group.add(terrainL1);

    const terrainR1 = new THREE.Mesh(innerTerrainGeo, terrainMat);
    terrainR1.position.set(halfWidth + 5.3, -0.02, 0);
    terrainR1.rotation.z = -0.05;
    group.add(terrainR1);

    // Tier 2 outer elevated forest knoll
    const terrainL2 = new THREE.Mesh(outerTerrainGeo, terrainFacetedMat);
    terrainL2.position.set(-halfWidth - 15.5, 0.22, 0);
    terrainL2.rotation.z = 0.08;
    group.add(terrainL2);

    const terrainR2 = new THREE.Mesh(outerTerrainGeo, terrainFacetedMat);
    terrainR2.position.set(halfWidth + 15.5, 0.22, 0);
    terrainR2.rotation.z = -0.08;
    group.add(terrainR2);

    group.position.set(0, 0, baseZ);
    scene.add(group);
    segments.push({ group, baseZ });
  }

  return { items: segments, span: totalSpan, startZ, segmentLength };
}

/**
 * Recycled lane trail markers with subtle glowing forest spirit green.
 */
function addDashes(THREE, scene, config) {
  const geometry = new THREE.BoxGeometry(config.dashWidth, 0.035, config.dashLength);
  const material = new THREE.MeshBasicMaterial({ color: config.colors.dash });
  const period = config.dashLength + config.dashGap;
  const dashes = [];

  for (let lane = 1; lane < config.laneCount; lane += 1) {
    const x = laneToX(lane, config) - config.laneWidth / 2;
    for (let index = 0; index < config.dashCount; index += 1) {
      const dash = new THREE.Mesh(geometry, material);
      dash.position.set(x, ROAD_TOP_Y + 0.02, config.spawnZ + index * period);
      scene.add(dash);
      dashes.push({ mesh: dash, baseZ: config.spawnZ + index * period });
    }
  }

  return { items: dashes, period, span: config.dashCount * period, startZ: config.spawnZ };
}

/**
 * Multi-layer authentic Kenney low-poly 3D nature scenery:
 * - Layer 1 (Foreground Trailside): Bushes, red toadstools, rocks, logs, stumps, campfires.
 * - Layer 2 (Midground Trees): Multi-tier pines, broadleaf oaks, detailed trees, granite boulders.
 * - Layer 3 (Background Canopy): Deep pine stands, plateau trees, and rocky monoliths.
 */
async function addRoadsideScenery(THREE, scene, config, loader) {
  const span = config.scenery.span;
  const count = config.scenery.itemCount;
  const startZ = ROAD_BEHIND_PLAYER - span;
  const items = [];

  // Pre-load all nature GLB models categorized by layer
  const loadedLayers = { foreground: [], midground: [], background: [] };

  if (loader) {
    for (const [layerKey, assetList] of Object.entries(NATURE_GLB_ASSETS)) {
      for (const asset of assetList) {
        try {
          const gltf = await loader.loadAsync(asset.path);
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          loadedLayers[layerKey].push({ asset, model: gltf.scene });
        } catch (e) {
          console.warn(`Failed to load nature model ${asset.path}:`, e);
        }
      }
    }
  }

  const stepZ = span / count;
  for (let i = 0; i < count; i += 1) {
    const baseZ = startZ + i * stepZ;
    const side = i % 2 === 0 ? -1 : 1;
    const propGroup = new THREE.Group();

    // 1. Foreground Accent (Trailside shrubs, rocks, logs, campfire)
    if (loadedLayers.foreground.length > 0) {
      const fgIdx = (i * 5) % loadedLayers.foreground.length;
      const fgEntry = loadedLayers.foreground[fgIdx];
      const fgClone = fgEntry.model.clone(true);
      const fgScale = fgEntry.asset.scale * (0.9 + ((i * 11) % 7) * 0.04);
      fgClone.scale.set(fgScale, fgScale, fgScale);
      fgClone.rotation.y = ((i * 2.1) % 1) * Math.PI * 2;
      const fgDist = 3.6 + ((i * 13) % 7) * 0.3;
      fgClone.position.set(side * fgDist, 0, (Math.random() - 0.5) * 1.5);
      propGroup.add(fgClone);
    }

    // 2. Midground Forest Trees & Boulders
    if (loadedLayers.midground.length > 0) {
      const mgIdx = (i * 3 + 1) % loadedLayers.midground.length;
      const mgEntry = loadedLayers.midground[mgIdx];
      const mgClone = mgEntry.model.clone(true);
      const mgScale = mgEntry.asset.scale * (0.88 + ((i * 17) % 9) * 0.05);
      mgClone.scale.set(mgScale, mgScale, mgScale);
      mgClone.rotation.y = ((i * 1.7) % 1) * Math.PI * 2;
      const mgDist = 6.2 + ((i * 19) % 9) * 0.5;
      mgClone.position.set(side * mgDist, 0, (Math.random() - 0.5) * 2.0);
      propGroup.add(mgClone);
    }

    // 3. Background Canopy (Every other cluster for deep forest density)
    if (i % 2 === 0 && loadedLayers.background.length > 0) {
      const bgIdx = (i * 2) % loadedLayers.background.length;
      const bgEntry = loadedLayers.background[bgIdx];
      const bgClone = bgEntry.model.clone(true);
      const bgScale = bgEntry.asset.scale * (0.92 + ((i * 7) % 8) * 0.05);
      bgClone.scale.set(bgScale, bgScale, bgScale);
      bgClone.rotation.y = ((i * 3.3) % 1) * Math.PI * 2;
      const bgDist = 11.5 + ((i * 23) % 11) * 0.7;
      bgClone.position.set(side * bgDist, 0, (Math.random() - 0.5) * 3.0);
      propGroup.add(bgClone);
    }

    propGroup.position.set(0, 0, baseZ);
    scene.add(propGroup);
    items.push({ group: propGroup, baseZ });
  }

  return { items, span, startZ };
}

/**
 * Atmospheric floating glowing firefly particles drifting through the forest air.
 */
function addFireflies(THREE, scene, config) {
  const count = config.scenery.fireflyCount || 24;
  const span = config.scenery.span;
  const startZ = ROAD_BEHIND_PLAYER - span;
  const fireflyGeo = new THREE.OctahedronGeometry(0.1, 0);
  const fireflyMat = new THREE.MeshBasicMaterial({ color: config.colors.firefly });
  const items = [];

  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(fireflyGeo, fireflyMat);
    const side = i % 2 === 0 ? -1 : 1;
    const initialX = side * (1.2 + ((i * 13) % 7) * 0.7);
    const initialY = 1.2 + ((i * 7) % 5) * 0.6;
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
  const count = config.scenery.mountainCount;
  const span = 300;
  const startZ = -180;
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
    const posX = side * (35 + ((i * 23) % 50));
    const posZ = startZ + ((i * 47) % span);
    const height = 30 + ((i * 37) % 35);
    const radius = 22 + ((i * 29) % 22);

    const group = new THREE.Group();
    const coneGeo = new THREE.ConeGeometry(radius, height, 5);
    const baseMesh = new THREE.Mesh(coneGeo, mountainMat);
    baseMesh.position.y = height / 2 - 3;
    group.add(baseMesh);

    // Forest mist mountain crest
    const capGeo = new THREE.ConeGeometry(radius * 0.42, height * 0.42, 5);
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
