/**
 * Three.js scene for the Low-Poly Runner.
 *
 * Implements a rich, stylized low-poly aesthetic with flat-shaded geometries,
 * faceted road segments, animated hazard curbs, roadside pine trees, geometric boulders,
 * sci-fi light pylons, and parallax background mountain ranges.
 */

import { CONFIG, THREE_MODULE_URL, GLTF_LOADER_URL } from '../config.js?v=1.4.0';
import { laneToX } from './state.js?v=1.4.0';

const ROAD_THICKNESS = 0.25;
const ROAD_TOP_Y = ROAD_THICKNESS / 2;
const ROAD_BEHIND_PLAYER = 18;
const FOG_NEAR = 65;
const FOG_FAR = 240;

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

  // Lighting tuned for crisp low-poly facet highlights & rich atmosphere
  const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x0f172a, 1.4);
  scene.add(hemiLight);

  const sun = new THREE.DirectionalLight(0xfffbeb, 1.8);
  sun.position.set(14, 22, 10);
  scene.add(sun);

  const ambientFill = new THREE.AmbientLight(0x1e293b, 0.7);
  scene.add(ambientFill);

  const roadSegments = addLowPolyRoad(THREE, scene, config);
  const dashes = addDashes(THREE, scene, config);
  const scenery = addRoadsideScenery(THREE, scene, config);
  const mountains = addBackgroundMountains(THREE, scene, config);
  const player = await addPlayer(THREE, scene, config);
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
    mountains,
    resize,
    render,
  };
}

function roadWidth(config) {
  return config.laneCount * config.laneWidth;
}

/**
 * Modular low-poly road track with faceted road decks, alternating hazard curbs,
 * and roadside terrain embankments that scroll continuously with distance.
 */
function addLowPolyRoad(THREE, scene, config) {
  const width = roadWidth(config);
  const segmentLength = config.scenery.segmentLength;
  const count = config.scenery.segmentCount;
  const totalSpan = count * segmentLength;
  const startZ = ROAD_BEHIND_PLAYER - totalSpan;

  const roadMat = new THREE.MeshStandardMaterial({
    color: config.colors.road,
    roughness: 0.7,
    metalness: 0.15,
    flatShading: true,
  });

  const curbLightMat = new THREE.MeshStandardMaterial({
    color: config.colors.curbLight,
    roughness: 0.5,
    metalness: 0.3,
    flatShading: true,
  });

  const curbDarkMat = new THREE.MeshStandardMaterial({
    color: config.colors.curbDark,
    roughness: 0.75,
    flatShading: true,
  });

  const terrainMat = new THREE.MeshStandardMaterial({
    color: config.colors.terrain,
    roughness: 0.9,
    flatShading: true,
  });

  const roadGeo = new THREE.BoxGeometry(width, ROAD_THICKNESS, segmentLength);
  const curbGeo = new THREE.BoxGeometry(0.38, ROAD_THICKNESS + 0.1, segmentLength / 4);
  const terrainGeo = new THREE.BoxGeometry(18, ROAD_THICKNESS * 0.7, segmentLength);

  const segments = [];

  for (let i = 0; i < count; i += 1) {
    const group = new THREE.Group();
    const baseZ = startZ + i * segmentLength + segmentLength / 2;

    // Main road deck
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    group.add(roadMesh);

    // Left and right hazard curbs with alternating high-contrast low-poly blocks
    const halfWidth = width / 2;
    for (let c = 0; c < 4; c += 1) {
      const cz = -segmentLength / 2 + (c + 0.5) * (segmentLength / 4);
      const isAlt = (i * 4 + c) % 2 === 0;
      const cMat = isAlt ? curbLightMat : curbDarkMat;

      const curbL = new THREE.Mesh(curbGeo, cMat);
      curbL.position.set(-halfWidth - 0.19, 0.05, cz);
      group.add(curbL);

      const curbR = new THREE.Mesh(curbGeo, cMat);
      curbR.position.set(halfWidth + 0.19, 0.05, cz);
      group.add(curbR);
    }

    // Side terrain embankments (faceted terrain slopes)
    const terrainL = new THREE.Mesh(terrainGeo, terrainMat);
    terrainL.position.set(-halfWidth - 9.3, -0.04, 0);
    terrainL.rotation.z = 0.04;
    group.add(terrainL);

    const terrainR = new THREE.Mesh(terrainGeo, terrainMat);
    terrainR.position.set(halfWidth + 9.3, -0.04, 0);
    terrainR.rotation.z = -0.04;
    group.add(terrainR);

    group.position.set(0, 0, baseZ);
    scene.add(group);
    segments.push({ group, baseZ });
  }

  return { items: segments, span: totalSpan, startZ, segmentLength };
}

/**
 * Recycled lane dashes with neon cyan glow.
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
 * Rich collection of roadside low-poly props (pine trees, rocks, sci-fi light pylons)
 * placed close to the road edges and recycled continuously.
 */
function addRoadsideScenery(THREE, scene, config) {
  const span = config.scenery.span;
  const count = config.scenery.itemCount;
  const startZ = ROAD_BEHIND_PLAYER - span;
  const items = [];

  const trunkMat = new THREE.MeshStandardMaterial({
    color: config.colors.treeTrunk,
    roughness: 0.9,
    flatShading: true,
  });

  const foliageMats = [
    new THREE.MeshStandardMaterial({ color: config.colors.treeFoliage, roughness: 0.75, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: config.colors.treeFoliageAlt, roughness: 0.8, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: config.colors.treeFoliageWarm, roughness: 0.7, flatShading: true }),
  ];

  const rockMats = [
    new THREE.MeshStandardMaterial({ color: config.colors.rock, roughness: 0.85, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: config.colors.rockAlt, roughness: 0.9, flatShading: true }),
  ];

  const pylonPillarMat = new THREE.MeshStandardMaterial({
    color: config.colors.curbDark,
    roughness: 0.4,
    metalness: 0.5,
    flatShading: true,
  });

  const pylonGlowMat = new THREE.MeshBasicMaterial({ color: config.colors.lightPylon });

  function createPineTree(scale = 1, matIndex = 0) {
    const group = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 1.4 * scale, 5);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = (1.4 * scale) / 2;
    group.add(trunk);

    const fMat = foliageMats[matIndex % foliageMats.length];
    const tiers = 3;
    for (let t = 0; t < tiers; t += 1) {
      const radius = (1.6 - t * 0.38) * scale;
      const height = (1.8 - t * 0.3) * scale;
      const coneGeo = new THREE.ConeGeometry(radius, height, 5);
      const cone = new THREE.Mesh(coneGeo, fMat);
      cone.position.y = 0.9 * scale + t * 1.0 * scale;
      cone.rotation.y = (t * Math.PI) / 3;
      group.add(cone);
    }
    return group;
  }

  function createRock(scale = 1, matIndex = 0) {
    const geo = new THREE.DodecahedronGeometry(scale, 0);
    const mesh = new THREE.Mesh(geo, rockMats[matIndex % rockMats.length]);
    mesh.position.y = scale * 0.7;
    mesh.rotation.set(scale * 1.8, scale * 1.3, scale * 0.7);
    return mesh;
  }

  function createPylon(scale = 1) {
    const group = new THREE.Group();
    const pillarGeo = new THREE.CylinderGeometry(0.14 * scale, 0.22 * scale, 3.4 * scale, 6);
    const pillar = new THREE.Mesh(pillarGeo, pylonPillarMat);
    pillar.position.y = (3.4 * scale) / 2;
    group.add(pillar);

    const beaconGeo = new THREE.OctahedronGeometry(0.35 * scale, 0);
    const beacon = new THREE.Mesh(beaconGeo, pylonGlowMat);
    beacon.position.y = 3.4 * scale + 0.3;
    group.add(beacon);

    return group;
  }

  const stepZ = span / count;
  for (let i = 0; i < count; i += 1) {
    const baseZ = startZ + i * stepZ;
    const side = i % 2 === 0 ? -1 : 1;
    // Keep scenery positioned cleanly right next to the curbs for high visibility
    const distOffset = 4.4 + ((i * 17) % 10) * 0.45;
    const posX = side * distOffset;
    const propType = (i * 7) % 6;

    let prop;
    const scale = 0.85 + ((i * 13) % 10) * 0.09;

    if (propType <= 2) {
      prop = createPineTree(scale, i);
    } else if (propType <= 4) {
      prop = createRock(scale * 1.15, i);
    } else {
      prop = createPylon(scale * 0.95);
    }

    prop.position.set(posX, 0, baseZ);
    scene.add(prop);
    items.push({ group: prop, baseZ });
  }

  return { items, span, startZ };
}

/**
 * Low-poly mountain silhouettes in the horizon with subtle parallax scrolling.
 */
function addBackgroundMountains(THREE, scene, config) {
  const count = config.scenery.mountainCount;
  const span = 280;
  const startZ = -160;
  const items = [];

  const mountainMat = new THREE.MeshStandardMaterial({
    color: config.colors.mountain,
    roughness: 0.9,
    flatShading: true,
  });

  const peakMat = new THREE.MeshStandardMaterial({
    color: config.colors.mountainPeak,
    roughness: 0.85,
    flatShading: true,
  });

  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const posX = side * (32 + ((i * 23) % 45));
    const posZ = startZ + ((i * 47) % span);
    const height = 28 + ((i * 37) % 32);
    const radius = 20 + ((i * 29) % 20);

    const group = new THREE.Group();
    const coneGeo = new THREE.ConeGeometry(radius, height, 5);
    const baseMesh = new THREE.Mesh(coneGeo, mountainMat);
    baseMesh.position.y = height / 2 - 3;
    group.add(baseMesh);

    // Snow cap
    const capGeo = new THREE.ConeGeometry(radius * 0.38, height * 0.38, 5);
    const capMesh = new THREE.Mesh(capGeo, peakMat);
    capMesh.position.y = height - (height * 0.38) / 2 - 3;
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
async function addPlayer(THREE, scene, config) {
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

  // Helper to load GLTFLoader
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
 * Low-poly faceted enemy combat drones.
 */
function addEnemyPool(THREE, scene, config) {
  const geometry = new THREE.OctahedronGeometry(config.enemyRadius, 0);
  const material = new THREE.MeshStandardMaterial({
    color: config.colors.enemy,
    roughness: 0.3,
    metalness: 0.3,
    flatShading: true,
  });

  return Array.from({ length: config.enemyPoolSize }, () => {
    const enemy = new THREE.Mesh(geometry, material);
    enemy.position.y = ROAD_TOP_Y + config.enemyRadius;
    enemy.visible = false;
    scene.add(enemy);
    return enemy;
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
