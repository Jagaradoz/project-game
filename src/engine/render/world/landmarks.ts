/**
 * Authored roadside silhouettes that break the endless scatter into memorable
 * beats. Forest trees use kit trunks with individual folded leaves; the other
 * landmarks share simple geometry and never participate in gameplay collision.
 */

import type * as THREE_NS from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { repaintKitModel } from '@/engine/render/world/palette';

import type { Palette } from '@/engine/render/world/palette';
import type { GameConfig, ThreeModule } from '@/engine/types';
import { createHeightSampler } from '@/engine/render/world/ground';
import { createRng } from '@/engine/render/world/rng';
import { LANDMARK_ZONE_FRACTIONS } from '@/engine/render/world/scatter';

interface LandmarkSet {
  group: THREE_NS.Group;
  zones: Array<{ root: THREE_NS.Group; baseZ: number }>;
}

export async function addLandmarks(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
  { span = 320, startZ = 20 }: { span?: number; startZ?: number } = {},
) {
  const farZ = startZ - span;
  const heightAt = createHeightSampler(config);
  const materials = createMaterials(THREE, palette);
  const sets = new Map<string, LandmarkSet>();
  const loader = new GLTFLoader();
  const treeModels = await Promise.all(['tree_oak', 'tree_detailed'].map(async (name) => {
    try {
    const gltf = await loader.loadAsync(`/assets/models/nature/${name}.glb`);
    repaintKitModel(THREE, gltf.scene, palette.kit);
    addLeafDetail(THREE, gltf.scene);
    return gltf.scene;
    } catch (error) {
      console.warn(`landmarks: could not load ${name}`, error);
      return null;
    }
  }));
  const availableTrees = treeModels.filter((tree): tree is THREE_NS.Group => tree !== null);

  const builders = {
    forest: (t: ThreeModule, root: THREE_NS.Group, mat: LandmarkMaterials, height: HeightAt, variant: number) => buildForestLandmark(t, root, mat, height, variant, availableTrees),
    highlands: buildHighlandsLandmark,
    oasis: buildOasisLandmark,
  } as const;

  for (const [setName, builder] of Object.entries(builders)) {
    const group = new THREE.Group();
    group.name = `landmarks-${setName}`;
    group.visible = false;
    scene.add(group);

    const zones = LANDMARK_ZONE_FRACTIONS.map((fraction, index) => {
      const root = new THREE.Group();
      const baseZ = farZ + fraction * span;
      root.position.z = baseZ;
      root.name = `landmark-${setName}-${index}`;
      builder(THREE, root, materials, heightAt, index);
      group.add(root);
      return { root, baseZ };
    });
    sets.set(setName, { group, zones });
  }

  let active = sets.get('forest');
  if (active) active.group.visible = true;

  return {
    sets,
    span,
    startZ: farZ,
    setActive(setName: string) {
      const next = sets.get(setName);
      if (!next || next === active) return;
      if (active) active.group.visible = false;
      next.group.visible = true;
      active = next;
    },
    scroll(distance: number) {
      if (!active) return;
      const offset = distance % span;
      for (const zone of active.zones) {
        const shifted = zone.baseZ - farZ + offset;
        zone.root.position.z = farZ + (shifted % span);
      }
    },
    applyPalette(next: Palette) {
      for (const tree of availableTrees) {
        tree.traverse((node) => {
          const mesh = node as THREE_NS.Mesh;
          if (!mesh.isMesh) return;
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const color = next.kit[material.name as keyof typeof next.kit];
            if (color && 'color' in material) (material as THREE_NS.MeshStandardMaterial).color.set(color);
          }
        });
      }
      materials.wood.color.set(next.kit.woodBark ?? next.ground.trailEdge);
      materials.foliage.color.set(next.kit.leafsDark ?? next.ground.grassDeep);
      materials.stone.color.set(next.kit.stoneDark ?? next.ridge.near);
      materials.sand.color.set(next.kit.dirt ?? next.ground.verge);
      materials.accent.color.set(next.accents.marker);
    },
  };
}

type LandmarkMaterials = ReturnType<typeof createMaterials>;

function createMaterials(THREE: ThreeModule, palette: Palette) {
  const material = (color: string) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  });
  return {
    wood: material(palette.kit.woodBark ?? palette.ground.trailEdge),
    foliage: material(palette.kit.leafsDark ?? palette.ground.grassDeep),
    stone: material(palette.kit.stoneDark ?? palette.ridge.near),
    sand: material(palette.kit.dirt ?? palette.ground.verge),
    accent: material(palette.accents.marker),
  };
}

function addMesh(
  THREE: ThreeModule,
  root: THREE_NS.Group,
  geometry: THREE_NS.BufferGeometry,
  material: THREE_NS.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

type HeightAt = (x: number) => number;

function buildForestLandmark(
  THREE: ThreeModule,
  root: THREE_NS.Group,
  mat: LandmarkMaterials,
  heightAt: HeightAt,
  variant: number,
  treeModels: THREE_NS.Group[],
) {
  // Authored GLB foliage and branching replace the oversized cone primitives.
  for (const side of treeModels.length ? [-1, 1] : []) {
    const tree = treeModels[(variant + (side > 0 ? 1 : 0)) % treeModels.length]!.clone(true);
    const bounds = new THREE.Box3().setFromObject(tree);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = (10.5 + variant * 0.5) / size.y;
    const radius = Math.hypot(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)), Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z))) * scale;
    const x = side * Math.max(9.5, 6.2 + radius);
    tree.scale.setScalar(scale);
    tree.position.set(x, heightAt(x) - bounds.min.y * scale, side * 0.8);
    tree.rotation.y = variant * 1.7 + side * 0.6;
    tree.traverse((node) => {
      const mesh = node as THREE_NS.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
    });
    root.add(tree);
  }
  // A small trail marker gives the composition a recognisable focal point.
  const signX = variant % 2 === 0 ? -6.3 : 6.3;
  const signY = heightAt(signX);
  addMesh(THREE, root, new THREE.CylinderGeometry(0.12, 0.16, 2.1, 6), mat.wood, [signX, signY + 1.05, -2]);
  addMesh(THREE, root, new THREE.BoxGeometry(1.5, 0.65, 0.18), mat.accent, [signX, signY + 1.75, -2], [0, variant * 0.28, 0]);
}

function buildHighlandsLandmark(
  THREE: ThreeModule,
  root: THREE_NS.Group,
  mat: LandmarkMaterials,
  heightAt: HeightAt,
  variant: number,
) {
  // Uneven standing-stone clusters create a much stronger vertical rhythm than
  // another row of similarly sized rocks.
  for (const side of [-1, 1]) {
    const centerX = side * (8.5 + (variant % 2));
    for (let index = 0; index < 3; index += 1) {
      const x = centerX + side * (index - 1) * 1.35;
      const height = 3.4 + ((index + variant) % 3) * 1.25;
      const stone = addMesh(
        THREE,
        root,
        new THREE.CylinderGeometry(0.55, 0.85, height, 5),
        mat.stone,
        [x, heightAt(x) + height / 2, (index - 1) * 1.15],
      );
      stone.rotation.z = side * (index - 1) * 0.09;
      stone.rotation.y = index * 0.7;
    }
  }
}

function buildOasisLandmark(
  THREE: ThreeModule,
  root: THREE_NS.Group,
  mat: LandmarkMaterials,
  heightAt: HeightAt,
  variant: number,
) {
  for (const side of [-1, 1]) {
    const x = side * (8.5 + (variant % 2) * 0.8);
    const y = heightAt(x);
    const trunk = addMesh(THREE, root, new THREE.CylinderGeometry(0.32, 0.5, 6.5, 7), mat.wood, [x, y + 3.25, side]);
    trunk.rotation.z = side * 0.12;
    for (let leaf = 0; leaf < 5; leaf += 1) {
      const angle = (leaf / 5) * Math.PI * 2;
      addMesh(
        THREE,
        root,
        new THREE.ConeGeometry(0.85, 4.5, 5),
        mat.foliage,
        [x + Math.sin(angle) * 1.3, y + 6.7, side + Math.cos(angle) * 1.3],
        [Math.PI / 2, 0, -angle],
      );
    }
    // Low sandstone remains fill the base while preserving sightlines.
    addMesh(THREE, root, new THREE.BoxGeometry(2.8, 1.5, 2.2), mat.sand, [x + side * 2.3, heightAt(x) + 0.75, -1.5], [0, side * 0.25, 0]);
  }
}

/** Folded individual leaves break up the kit canopy's solid polygon surfaces. */
function addLeafDetail(THREE: ThreeModule, tree: THREE_NS.Group) {
  const rng = createRng(0x1eaf);
  tree.traverse((node) => {
    const mesh = node as THREE_NS.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.material.name.startsWith('leafs')) return;
    const source = mesh.geometry;
    const position = source.getAttribute('position');
    const indices = source.index;
    const triangleCount = (indices?.count ?? position.count) / 3;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const centers: THREE_NS.Vector3[] = [];
    const weights: number[] = [];
    let area = 0;
    for (let t = 0; t < triangleCount; t += 1) {
      const read = (v: THREE_NS.Vector3, offset: number) => v.fromBufferAttribute(position, indices ? indices.getX(t * 3 + offset) : t * 3 + offset);
      read(a, 0); read(b, 1); read(c, 2);
      area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      weights.push(area);
      centers.push(a.clone(), b.clone(), c.clone());
    }
    const vertices: number[] = [], colors: number[] = [];
    for (let leaf = 0; leaf < 4200; leaf += 1) {
      const pick = rng() * area;
      let triangle = weights.findIndex((weight) => weight >= pick);
      triangle = Math.max(0, triangle);
      const u = Math.sqrt(rng()), v = rng();
      const center = centers[triangle * 3]!.clone().multiplyScalar(1 - u)
        .addScaledVector(centers[triangle * 3 + 1]!, u * (1 - v))
        .addScaledVector(centers[triangle * 3 + 2]!, u * v);
      center.add(new THREE.Vector3((rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12));
      const length = 0.025 + rng() * 0.035;
      const angle = rng() * Math.PI * 2;
      const along = new THREE.Vector3(Math.cos(angle), (rng() - 0.5) * 1.4, Math.sin(angle)).normalize().multiplyScalar(length);
      const across = new THREE.Vector3(-Math.sin(angle), 0.35, Math.cos(angle)).normalize().multiplyScalar(length * 0.48);
      const points = [center.clone().sub(along), center.clone().add(across), center.clone().add(along), center.clone().sub(across), center.clone().add(new THREE.Vector3(0, length * 0.22, 0))];
      const shade = 0.65 + rng() * 0.55;
      for (const index of [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]) {
        vertices.push(...points[index]!.toArray());
        colors.push(shade * 0.95, shade, shade * 0.85);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    mesh.geometry = geometry;
    const material = mesh.material as THREE_NS.MeshStandardMaterial;
    material.vertexColors = true;
    material.side = THREE.DoubleSide;
    // Source buffers can be shared with the trunk; disposal stays with scene ownership.
  });
}
