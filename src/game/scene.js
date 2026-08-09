/**
 * Three.js scene for the runner. Primitives only -- boxes for the road, spheres
 * for the bodies. No models, no textures, no loaders.
 *
 * Three is imported from a pinned CDN URL at call time (not at module load), so
 * a network failure surfaces as a rejected promise the caller can report instead
 * of a dead page. Every mesh is allocated once here; the frame loop only moves
 * them, and enemies are shown and hidden from a fixed pool.
 */

import { CONFIG, THREE_MODULE_URL } from '../config.js';
import { laneToX } from './state.js';

const SPHERE_SEGMENTS = { width: 20, height: 14 };
const ROAD_THICKNESS = 0.2;
const ROAD_TOP_Y = ROAD_THICKNESS / 2;
/** Road is drawn from just behind the player to well past the spawn line. */
const ROAD_BEHIND_PLAYER = 16;
/** Fades the far end out so enemies do not pop into existence at the spawn line. */
const FOG_NEAR = 45;
const FOG_FAR = 170;

export async function createScene(canvas, config = CONFIG.game) {
  const THREE = await import(/* @vite-ignore */ THREE_MODULE_URL);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(config.colors.sky);
  scene.fog = new THREE.Fog(config.colors.sky, FOG_NEAR, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, 0.1, 400);
  camera.position.set(config.camera.x, config.camera.y, config.camera.z);
  camera.lookAt(0, config.camera.lookAtY, config.camera.lookAtZ);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(6, 12, 6);
  scene.add(sun);

  addRoad(THREE, scene, config);
  const dashes = addDashes(THREE, scene, config);
  const player = addPlayer(THREE, scene, config);
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

  return { THREE, scene, camera, renderer, player, enemyPool, bulletPool, dashes, resize, render };
}

function roadWidth(config) {
  return config.laneCount * config.laneWidth;
}

function addRoad(THREE, scene, config) {
  const centreZ = ROAD_BEHIND_PLAYER - config.roadLength / 2;

  const road = new THREE.Mesh(
    new THREE.BoxGeometry(roadWidth(config), ROAD_THICKNESS, config.roadLength),
    new THREE.MeshStandardMaterial({ color: config.colors.road, roughness: 0.95 }),
  );
  road.position.set(0, 0, centreZ);
  scene.add(road);

  const shoulderGeometry = new THREE.BoxGeometry(
    config.shoulderWidth,
    ROAD_THICKNESS,
    config.roadLength,
  );
  const shoulderMaterial = new THREE.MeshStandardMaterial({
    color: config.colors.shoulder,
    roughness: 1,
  });
  const shoulderX = roadWidth(config) / 2 + config.shoulderWidth / 2;

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
    shoulder.position.set(side * shoulderX, -0.02, centreZ);
    scene.add(shoulder);
  }
}

/**
 * Lane dividers as a recycled ladder of dashes. Scrolling these is what reads as
 * forward motion -- the road itself never moves.
 */
function addDashes(THREE, scene, config) {
  const geometry = new THREE.BoxGeometry(config.dashWidth, 0.02, config.dashLength);
  const material = new THREE.MeshBasicMaterial({ color: config.colors.dash });
  const period = config.dashLength + config.dashGap;
  const dashes = [];

  for (let lane = 1; lane < config.laneCount; lane += 1) {
    const x = laneToX(lane, config) - config.laneWidth / 2;
    for (let index = 0; index < config.dashCount; index += 1) {
      const dash = new THREE.Mesh(geometry, material);
      dash.position.set(x, ROAD_TOP_Y + 0.01, config.spawnZ + index * period);
      scene.add(dash);
      dashes.push({ mesh: dash, baseZ: config.spawnZ + index * period });
    }
  }

  return { items: dashes, period, span: config.dashCount * period, startZ: config.spawnZ };
}

function addPlayer(THREE, scene, config) {
  const player = new THREE.Mesh(
    new THREE.SphereGeometry(config.playerRadius, SPHERE_SEGMENTS.width, SPHERE_SEGMENTS.height),
    new THREE.MeshStandardMaterial({
      color: config.colors.player,
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
    }),
  );
  player.position.set(laneToX(1, config), ROAD_TOP_Y + config.playerRadius, config.playerZ);
  scene.add(player);
  return player;
}

function addEnemyPool(THREE, scene, config) {
  const geometry = new THREE.SphereGeometry(
    config.enemyRadius,
    SPHERE_SEGMENTS.width,
    SPHERE_SEGMENTS.height,
  );
  const material = new THREE.MeshStandardMaterial({ color: config.colors.enemy, roughness: 0.4 });

  return Array.from({ length: config.enemyPoolSize }, () => {
    const enemy = new THREE.Mesh(geometry, material);
    enemy.position.y = ROAD_TOP_Y + config.enemyRadius;
    enemy.visible = false;
    scene.add(enemy);
    return enemy;
  });
}

/** Capsule-ish tracer: a stretched box reads as a shot better than a dot does. */
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
