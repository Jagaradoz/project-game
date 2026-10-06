import type * as T from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GameConfig, RootObstacle, ThreeModule } from '@/engine/types';
import { TRAIL_Y } from '@/engine/render/world/ground';

/** The trunk is roadside; the authored long root points across all three lanes. */
export async function addObstaclePool(THREE: ThreeModule, scene: T.Scene, config: GameConfig, loader: GLTFLoader) {
  const source = (await loader.loadAsync('/assets/models/environment/tree_root_oak.glb')).scene;
  const items = Array.from({ length: config.obstacle.poolSize }, () => {
    const group = new THREE.Group();
    const tree = source.clone(true);
    tree.scale.setScalar(4.15);
    tree.traverse(o => { const mesh = o as T.Mesh; if (mesh.isMesh) mesh.castShadow = true; });
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(config.laneWidth * 3, .75),
      new THREE.MeshBasicMaterial({ color: '#ffb449', transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide }));
    marker.rotation.x = -Math.PI / 2; marker.position.y = .025;
    group.add(tree, marker); group.visible = false; scene.add(group);
    return { group, tree, marker };
  });
  return {
    sync(roots: RootObstacle[], elapsedMs: number) {
      items.forEach((slot, i) => {
        const root = roots[i]; slot.group.visible = Boolean(root);
        if (!root) return;
        slot.group.position.set(0, TRAIL_Y, root.z);
        slot.tree.rotation.y = root.side === -1 ? 0 : Math.PI;
        // The export centres its bounds. Account for the original trunk and
        // root offsets so the trunk is roadside and the root crosses z=0.
        slot.tree.position.set(root.side * (4.8 - .306716 * 4.15), -.080529 * 4.15,
          root.side * .237757 * 4.15);
        slot.marker.visible = !root.cleared;
        slot.marker.scale.y = 1 + Math.sin(elapsedMs * .008) * .1;
      });
    },
    hide() { items.forEach(s => { s.group.visible = false; }); },
  };
}
