import type * as T from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GameConfig, TrailHazard, ThreeModule } from '@/engine/types';
import type { Palette } from '@/engine/render/world/palette';
import { repaintKitModel } from '@/engine/render/world/palette';
import { TRAIL_Y } from '@/engine/render/world/ground';
import { createRng } from '@/engine/render/world/rng';
import { laneToX } from '@/engine/core/state';
import { buildRiver } from '@/engine/render/actors/rivers';
import { SMALL_STONES } from '@/engine/render/world/catalog';

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
      // Ten stones per lane in two staggered rows, inside the occupied lane edges.
      for (let lane = 0; lane < lanes; lane++) {
        for (let i = 0; i < 10; i++) {
          const variant = i % parts.length;
          const { size, meshes } = parts[variant];
          const width = Math.min(.34 + rng() * .08, laneWidth * .175);
          const scale = Math.min(width / Math.max(size.x, size.z), .55 / size.y);
          transform.scale.setScalar(scale);
          transform.rotation.set(0, rng() * Math.PI * 2, 0);
          transform.position.set(
            (lane - (lanes - 1) / 2) * laneWidth + (i % 5 - 2) * laneWidth / 5.5 + (rng() - .5) * .045,
            .015,
            (i < 5 ? -.13 : .13) + (rng() - .5) * .03,
          );
          transform.updateMatrix();
          const index = counts[variant]++;
          for (const part of meshes) {
            matrix.multiplyMatrices(transform.matrix, part.matrix);
            part.mesh.setMatrixAt(index, matrix);
          }
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
  const paths = ['log_two_lane', 'log_three_lane', ...SMALL_STONES];
  const sources = await Promise.all(paths.map(async name => (await loader.loadAsync(`/assets/models/environment/${name}.glb`)).scene));
  sources.forEach(source => repaintKitModel(THREE, source, palette.kit));
  const items = Array.from({ length: config.obstacle.poolSize }, () => {
    const group = new THREE.Group();
    group.name = 'trail-hazard';
    const logs = sources.slice(0, 2).map(source => source.clone(true));
    const stones = buildStoneBand(THREE, sources.slice(2));
    const river = buildRiver(THREE, config, palette);
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
