/** Check exported skinning in the same loader/mixer used by the game. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
for (const [name, height] of [['GoblinScout', 1.8], ['BrambleSkeleton', 2.1], ['ShroomBrute', 2.7], ['ElderTreant', 5]]) {
  const bytes = readFileSync('public/assets/models/enemies/animated/' + name + '.glb');
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const scale = height / box.getSize(new THREE.Vector3()).y;
  model.scale.setScalar(scale); model.position.y = -box.min.y * scale;
  const mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) {
    mixer.stopAllAction(); const action = mixer.clipAction(clip).reset().play();
    for (const fraction of [0, .5, .95]) {
      mixer.setTime(clip.duration * fraction); model.updateMatrixWorld(true);
      model.traverse(object => { if (object.isSkinnedMesh) object.skeleton.update(); });
      const bounds = new THREE.Box3().setFromObject(model, true), centre = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok(Math.abs(centre.x) < height && Math.abs(centre.z) < height,
        name+' '+clip.name+' stays around its lane: '+JSON.stringify({ centre: centre.toArray(), size: size.toArray() }));
      assert.ok(bounds.max.y > .3 && bounds.min.y > -height, name+' '+clip.name+' remains above ground');
      assert.ok(size.y < height * 2 && centre.y < height * 1.5, name+' '+clip.name+' retains its body proportions');
    }
    action.stop();
  }
  console.log(name+': all '+gltf.animations.length+' clips passed deformed bounds checks at three samples each');
}
