/** Geometry-only loader audit; browser checks cover actual textures/rendering. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
for (const name of ['Mage', 'Druid', 'SkeletonMage', 'Witch', 'MagicalGirl']) {
  const bytes = readFileSync('public/assets/models/characters/animated/'+name+'.glb');
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'geometry-audit-textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength), '');
  const model = gltf.scene, mixer = new THREE.AnimationMixer(model);
  const parts = []; model.traverse(object => { if (object.isMesh) parts.push(object); });
  const head = parts.find(part => /_Head$/i.test(part.name));
  const hat = parts.find(part => /_Hat$/i.test(part.name));
  for (const clip of gltf.animations) {
    mixer.stopAllAction(); mixer.clipAction(clip).reset().play();
    for (const fraction of [0, .5, .95]) {
      mixer.setTime(clip.duration*fraction); model.updateMatrixWorld(true);
      for (const part of parts) part.skeleton?.update();
      const body = new THREE.Box3().setFromObject(model, true);
      assert.ok([...body.min.toArray(), ...body.max.toArray()].every(value => Number.isFinite(value) && Math.abs(value) < 8),
        name+' '+clip.name+' retains finite local body bounds');
      if (head && hat) {
        const headBox = new THREE.Box3().setFromObject(head, true);
        const hatBox = new THREE.Box3().setFromObject(hat, true);
        const distance = headBox.getCenter(new THREE.Vector3()).distanceTo(hatBox.getCenter(new THREE.Vector3()));
        assert.ok(distance < 1.5, name+' '+clip.name+' hat stays with head: distance '+distance);
      }
    }
  }
  console.log(name+': six clips passed geometry bounds'+(hat ? ' and hat attachment' : '')+' checks');
}
