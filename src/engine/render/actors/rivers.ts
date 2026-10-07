import type * as T from 'three';
import type { GameConfig, ThreeModule } from '@/engine/types';
import type { Palette } from '@/engine/render/world/palette';
import { createHeightSampler } from '@/engine/render/world/ground';
import { createRng } from '@/engine/render/world/rng';

const WET_BANK = .5;
const BANK_ROCKS = 7;
const BANK_ROCK_SPAN = 30;

/** Water is an opaque recessed surface; lighting and moving highlights provide depth. */
export function buildRiver(THREE: ThreeModule, config: GameConfig, palette: Palette, rocks: T.Object3D[] = []) {
  const group = new THREE.Group();
  group.name = 'river-channel';
  // Beyond the terrain and fog: neither end is visible from the gameplay camera.
  const halfWidth = 512;
  const depth = config.obstacle.riverRadius * 2;
  const heightAt = createHeightSampler(config);
  const edgeReach = config.trailEdge.meander + config.trailEdge.pinch;
  const positiveX = Array.from({ length: 49 }, (_, i) => i / 4);
  for (let x = 16; x < halfWidth; x += 4) positiveX.push(x);
  positiveX.push(halfWidth);
  const samples = [...positiveX.slice(1).reverse().map(x => -x), ...positiveX];
  // Follow the existing valley profile so water remains visible beyond the road.
  function surface(nearZ: number, farZ: number, offsetY: number, material: T.Material) {
    const positions: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      const x = samples[i - 1], nextX = samples[i];
      const y = heightAt(x) + offsetY, nextY = heightAt(nextX) + offsetY;
      positions.push(x, y, nearZ, nextX, nextY, nearZ, nextX, nextY, farZ,
        x, y, nearZ, nextX, nextY, farZ, x, y, farZ);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  const soil = new THREE.MeshStandardMaterial({ color: palette.kit.dirtDark, roughness: .95, flatShading: true, side: THREE.DoubleSide });
  const bank = new THREE.MeshStandardMaterial({ color: palette.kit.dirt, roughness: .9, flatShading: true });
  const waterMaterial = new THREE.MeshStandardMaterial({ color: palette.kit.water, roughness: .4, metalness: .05, flatShading: true });
  surface(depth / 2, -depth / 2, -.035, waterMaterial);
  surface(depth / 2, -depth / 2, -.65, soil);
  for (const side of [-1, 1]) {
    const positions: number[] = [];
    for (let segment = 1; segment < samples.length; segment++) {
      const x = samples[segment - 1];
      const nextX = samples[segment];
      const y = heightAt(Math.abs(x) + edgeReach) + .015;
      const nextY = heightAt(Math.abs(nextX) + edgeReach) + .015;
      const z = side * (depth / 2 + .005);
      const bottom = heightAt(x) - .7, nextBottom = heightAt(nextX) - .7;
      positions.push(x, y, z, x, bottom, z, nextX, nextBottom, z,
        x, y, z, nextX, nextBottom, z, nextX, nextY, z);
    }
    const wallGeometry = new THREE.BufferGeometry();
    wallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    wallGeometry.computeVertexNormals();
    const wall = new THREE.Mesh(wallGeometry, soil);
    wall.receiveShadow = true;
    group.add(wall);
    surface(side * depth / 2 + .08, side * depth / 2 - .08, -.012, bank);
  }
  // A darker channel down the middle reads as depth; pale foam traces each bank.
  const deepMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.kit.water).multiplyScalar(.74), roughness: .4, metalness: .05, flatShading: true,
  });
  surface(depth * .26, -depth * .26, -.03, deepMaterial);
  const foamMaterial = new THREE.MeshBasicMaterial({ color: '#d4e5d4', transparent: true, opacity: .42, depthWrite: false });
  const edgeFoamMaterial = new THREE.MeshBasicMaterial({ color: '#e6f0e2', transparent: true, opacity: .6, depthWrite: false });
  for (const side of [-1, 1]) {
    const inner = side * (depth / 2 - .26), outer = side * (depth / 2 - .08);
    surface(Math.max(inner, outer), Math.min(inner, outer), -.02, edgeFoamMaterial).receiveShadow = false;
  }
  // Wet mud darkens the ground beside the water, so the channel reads wider than its hit zone.
  const mud = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.kit.dirtDark).lerp(new THREE.Color(palette.kit.water), .12), roughness: .8, flatShading: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  for (const side of [-1, 1]) {
    const inner = side * (depth / 2 + .02), outer = side * (depth / 2 + WET_BANK);
    surface(Math.max(inner, outer), Math.min(inner, outer), .01, mud);
  }
  // Boulders sit on both banks, just outside the water.
  const rng = createRng(config.obstacle.riverRadius * 1000 | 0);
  rocks.forEach(rock => rock.updateMatrixWorld(true));
  const rockBounds = rocks.map(rock => new THREE.Box3().setFromObject(rock));
  if (rocks.length) for (const side of [-1, 1]) {
    for (let i = 0; i < BANK_ROCKS; i++) {
      const variant = Math.floor(rng() * rocks.length);
      const scale = 1.1 + rng() * .9;
      const x = -BANK_ROCK_SPAN / 2 + (i + rng() * .7) * BANK_ROCK_SPAN / BANK_ROCKS;
      const rock = rocks[variant]!.clone(true);
      rock.scale.setScalar(scale);
      rock.rotation.y = rng() * Math.PI * 2;
      rock.position.set(x, heightAt(x) - rockBounds[variant]!.min.y * scale - .02, side * (depth / 2 + .3 + rng() * .45));
      rock.traverse(node => {
        const mesh = node as T.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
      });
      group.add(rock);
    }
  }
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
