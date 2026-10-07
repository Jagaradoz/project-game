import type * as T from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GameConfig, TrailHazard, ThreeModule } from '@/engine/types';
import type { Palette } from '@/engine/render/world/palette';
import { repaintKitModel } from '@/engine/render/world/palette';
import { TRAIL_Y } from '@/engine/render/world/ground';
import { createRng } from '@/engine/render/world/rng';
import { laneToX } from '@/engine/core/state';
import { buildRiver } from '@/engine/render/actors/rivers';

/** Boulders first, then the small stones that fill the gaps between them. */
const BAND_STONES = ['stone_bigA', 'stone_bigC', 'stone_leaning', 'stone_bigB', 'stone_bigDuo', 'stone_mediumA', 'stone_mediumTrio'];
/** Tall boulders; the flatter big stones double as gap fillers and bank rocks. */
const BOULDER_VARIANTS = 3;
const RIVER_ROCKS = 5;
const BIG_COUNT = 3;
const ROTATION_JITTER = .35;
/** Stones stay inside the hazard's collision depth plus a little visual margin. */
const BAND_HALF_DEPTH = 1;
const BOULDER_FOOTPRINT = 1.5;
const BOULDER_MAX_HEIGHT = 1.15;

function buildStoneBand(THREE: ThreeModule, sources: T.Group[]) {
  const group = new THREE.Group();
  group.name = 'stone-band';
  const parts = sources.map(source => {
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const normalise = new THREE.Matrix4().makeTranslation(-centre.x, -bounds.min.y, -centre.z);
    const meshes: { mesh: T.InstancedMesh; matrix: T.Matrix4 }[] = [];
    source.traverse(node => {
      const part = node as T.Mesh;
      if (!part.isMesh) return;
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, 30);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      meshes.push({ mesh, matrix: normalise.clone().multiply(part.matrixWorld) });
    });
    return { meshes, bounds, size };
  });
  const transform = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  return {
    group,
    arrange(id: number, lanes: number, laneWidth: number) {
      const rng = createRng(id * 1877);
      const counts = sources.map(() => 0);
      const place = (variant: number, laneX: number, z: number, footprint: number, maxHeight: number) => {
        const { size, meshes } = parts[variant];
        let x = laneX;
        const scale = Math.min(footprint / Math.max(size.x, size.z), maxHeight / size.y);
        transform.scale.setScalar(scale);
        // Rotation is at most ROTATION_JITTER off axis; keep that footprint inside the occupied lanes and depth.
        const cos = Math.cos(ROTATION_JITTER), sin = Math.sin(ROTATION_JITTER);
        const reachX = scale * (size.x * cos + size.z * sin) / 2, reachZ = scale * (size.z * cos + size.x * sin) / 2;
        const edge = lanes * laneWidth / 2;
        x = Math.max(-edge + reachX, Math.min(edge - reachX, x));
        const zClamped = Math.max(-BAND_HALF_DEPTH + reachZ, Math.min(BAND_HALF_DEPTH - reachZ, z));
        transform.rotation.set(0, (rng() < .5 ? 0 : Math.PI) + (rng() * 2 - 1) * ROTATION_JITTER, 0);
        transform.position.set(x, .015, zClamped);
        transform.updateMatrix();
        const index = counts[variant]++;
        for (const part of meshes) {
          matrix.multiplyMatrices(transform.matrix, part.matrix);
          part.mesh.setMatrixAt(index, matrix);
        }
      };
      // Per lane: a staggered wall of boulders with smaller stones wedged into the gaps.
      for (let lane = 0; lane < lanes; lane++) {
        const centre = (lane - (lanes - 1) / 2) * laneWidth;
        for (let i = 0; i < BIG_COUNT; i++) {
          const x = centre + (i - 1) * laneWidth * .33 + (rng() - .5) * .08;
          place(Math.floor(rng() * BOULDER_VARIANTS), x, (i % 2 ? .12 : -.12) + (rng() - .5) * .08,
            BOULDER_FOOTPRINT + rng() * .22, BOULDER_MAX_HEIGHT);
        }
        for (const side of [-1, 1]) {
          place(BOULDER_VARIANTS + Math.floor(rng() * (parts.length - BOULDER_VARIANTS)),
            centre + side * laneWidth * .17, side * .42 + (rng() - .5) * .08, .8 + rng() * .16, BOULDER_MAX_HEIGHT * .6);
        }
      }
      parts.forEach((part, i) => part.meshes.forEach(({ mesh }) => {
        mesh.count = counts[i];
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox();
      }));
    },
  };
}

/** Fixed slots own every variant; reassignment changes only transforms and visibility. */
export async function addObstaclePool(THREE: ThreeModule, scene: T.Scene, config: GameConfig, loader: GLTFLoader, palette: Palette) {
  const paths = ['log_two_lane', 'log_three_lane', ...BAND_STONES];
  const sources = await Promise.all(paths.map(async name => (await loader.loadAsync(`/assets/models/environment/${name}.glb`)).scene));
  sources.forEach(source => repaintKitModel(THREE, source, palette.kit));
  const items = Array.from({ length: config.obstacle.poolSize }, () => {
    const group = new THREE.Group();
    group.name = 'trail-hazard';
    const logs = sources.slice(0, 2).map(source => source.clone(true));
    const stones = buildStoneBand(THREE, sources.slice(2));
    const river = buildRiver(THREE, config, palette, sources.slice(2, 2 + RIVER_ROCKS));
    for (const log of logs) log.traverse(node => {
      const mesh = node as T.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    group.add(...logs, stones.group, river.group);
    group.visible = false;
    scene.add(group);
    return { group, logs, stones, river, assignedId: -1, assignedLanes: 0 };
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
        slot.logs.forEach((log, index) => { log.visible = hazard.kind === 'log' && index === hazard.laneCount - 2; });
        slot.stones.group.visible = hazard.kind === 'stones';
        slot.river.group.visible = hazard.kind === 'river';
        if (hazard.kind === 'stones' && (slot.assignedId !== hazard.id || slot.assignedLanes !== hazard.laneCount)) {
          slot.stones.arrange(hazard.id, hazard.laneCount, config.laneWidth);
          slot.assignedId = hazard.id;
          slot.assignedLanes = hazard.laneCount;
        }
        if (hazard.kind === 'river') slot.river.update(elapsedMs);
      });
    },
    hide() { items.forEach(slot => { slot.group.visible = false; }); },
  };
}
