import type * as T from 'three';
import type { GameConfig, ThreeModule } from '@/engine/types';
import type { Palette } from '@/engine/render/world/palette';
import { createHeightSampler } from '@/engine/render/world/ground';

/**
 * The river is authored in Blender (`river_crossing.glb`, tools/export_river_asset.py) from this very
 * valley profile: opaque water filling the hole the terrain mask cuts, vertical banks, mud, foam, reeds and
 * rocks. Code only places it and animates the surface ripples on top.
 */
export function buildRiver(THREE: ThreeModule, config: GameConfig, palette: Palette, template: T.Object3D) {
  void palette;
  const group = new THREE.Group();
  group.name = 'river-channel';
  // Beyond the terrain and fog: neither end is visible from the gameplay camera.
  const halfWidth = 512;
  const depth = config.obstacle.riverRadius * 2;
  const heightAt = createHeightSampler(config);
  const channel = template.clone(true);
  channel.traverse(node => {
    const mesh = node as T.Mesh;
    if (!mesh.isMesh) return;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
  });
  group.add(channel);
  const foamMaterial = new THREE.MeshBasicMaterial({ color: '#d4e5d4', transparent: true, opacity: .42, depthWrite: false });
  const ripples = Array.from({ length: 56 }, (_, i) => {
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(.34 + (i % 4) * .2, .026), foamMaterial);
    foam.rotation.x = -Math.PI / 2;
    const x = -24 + i * 48 / 55;
    foam.position.set(x, heightAt(x) - .027, (i % 5 - 2) * depth * .17);
    group.add(foam);
    return { mesh: foam, x: foam.position.x, z: foam.position.z };
  });
  return {
    group,
    halfWidth,
    update(elapsedMs: number) {
      const time = elapsedMs / 1000;
      ripples.forEach((r, i) => {
        r.mesh.position.x = r.x + Math.sin(time * .8 + i * 1.7) * .12;
        r.mesh.position.y = heightAt(r.mesh.position.x) - .027;
        r.mesh.position.z = r.z + Math.sin(time + i) * .025;
        r.mesh.scale.x = 1 + Math.sin(time * 1.2 + i) * .15;
      });
    },
  };
}

/** One fixed splash pool; no particle allocations or separate animation loop. */
export function createDrowningSplash(THREE: ThreeModule, scene: T.Scene, palette: Palette) {
  const group = new THREE.Group();
  group.name = 'drowning-splash';
  group.visible = false;
  const material = new THREE.MeshBasicMaterial({ color: '#d4e5d4', transparent: true, opacity: .8, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.35, .025, 4, 28), material);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const dropMaterial = new THREE.MeshStandardMaterial({ color: palette.kit.water, roughness: .4, flatShading: true });
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.045, 0), dropMaterial, 12);
  drops.frustumCulled = false;
  group.add(drops);
  scene.add(group);
  const transform = new THREE.Object3D();
  return {
    group,
    update(active: boolean, progress: number, x: number, z: number) {
      group.visible = active && progress < 1;
      if (!group.visible) return;
      group.position.set(x, -.02, z);
      ring.scale.setScalar(1 + progress * 2.2);
      material.opacity = .8 * (1 - progress);
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2;
        const radius = .12 + progress * (.5 + (i % 3) * .15);
        transform.position.set(Math.cos(angle) * radius, Math.sin(Math.PI * progress) * (.3 + (i % 3) * .1), Math.sin(angle) * radius);
        transform.scale.setScalar(1 - progress);
        transform.updateMatrix();
        drops.setMatrixAt(i, transform.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
    },
  };
}
