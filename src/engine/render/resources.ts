import type * as THREE from 'three';

/** Cloned rigs own their bone textures; geometry and materials stay shared. */
export function disposeSkeletons(root: THREE.Object3D): void {
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse(node => {
    const mesh = node as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
}

/** Includes Points and Sprites, which a mesh-only teardown misses. */
export function collectResources(root: THREE.Object3D, resources: Set<{ dispose(): void }>): void {
  function materialResources(material: THREE.Material): void {
    resources.add(material);
    for (const value of Object.values(material)) {
      if (value?.isTexture) resources.add(value);
    }
    const uniforms = (material as THREE.ShaderMaterial).uniforms;
    for (const uniform of Object.values(uniforms ?? {})) {
      if (uniform.value?.isTexture) resources.add(uniform.value);
    }
  }

  root.traverse(node => {
    const mesh = node as THREE.Mesh & { skeleton?: THREE.Skeleton };
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) resources.add(mesh as THREE.InstancedMesh);
    if (mesh.skeleton) resources.add(mesh.skeleton);
    if (mesh.geometry) resources.add(mesh.geometry);
    if (mesh.material) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materialResources(material);
    }
    if (mesh.customDepthMaterial) materialResources(mesh.customDepthMaterial);
    if (mesh.customDistanceMaterial) materialResources(mesh.customDistanceMaterial);
  });
}
