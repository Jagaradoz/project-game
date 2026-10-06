/** Character spell assemblies, pooled embers, cast flashes and impact bursts. */
import type * as T from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GameConfig, GameState, ThreeModule } from '@/engine/types';
import { laneToX } from '@/engine/core/state';
import { TRAIL_Y } from '@/engine/render/world/ground';

const SPELLS: Record<string, { file: string; color: string }> = {
  mage: { file: 'Mage', color: '#ff8d32' }, druid: { file: 'Druid', color: '#8cff69' },
  skeletonMage: { file: 'SkeletonMage', color: '#70efdf' }, witch: { file: 'Witch', color: '#c787ff' },
  magicalGirl: { file: 'MagicalGirl', color: '#ffa0df' },
};
export async function addSpellPool(THREE: ThreeModule, scene: T.Scene, config: GameConfig, loader: GLTFLoader) {
  const templates = new Map<string, T.Group>();
  const loops = new Map<string, T.AnimationClip>();
  const owned = new Set<{ dispose(): void }>();
  await Promise.all(Object.entries(SPELLS).map(async ([id, profile]) => {
    try {
      const gltf = await loader.loadAsync('/assets/models/spells/' + profile.file + '.glb');
      const model = gltf.scene;
      const loop = gltf.animations.find(clip => clip.name === 'Loop')?.clone();
      if (loop) {
        // Gameplay places the projectile; the catalog loop owns its component effects.
        loop.tracks = loop.tracks.filter(track => !track.name.endsWith('.position'));
        loops.set(id, loop);
      }
      const ball = model.getObjectByName(profile.file + '_EnergyBall') ??
        model.getObjectByName(profile.file.replace('SkeletonMage', 'Skeleton_Mage').replace('MagicalGirl', 'Magical_Girl') + '_EnergyBall') ?? model;
      const box = new THREE.Box3().setFromObject(ball);
      const diameter = Math.max(.01, box.getSize(new THREE.Vector3()).length() / Math.sqrt(3));
      const container = new THREE.Group();
      model.position.sub(box.getCenter(new THREE.Vector3()));
      container.add(model); container.scale.setScalar(.55 / diameter);
      templates.set(id, container);
    } catch (error) { console.warn('Spell assembly unavailable:', id, error); }
  }));
  const geometry = new THREE.IcosahedronGeometry(.16, 0);
  const material = new THREE.MeshBasicMaterial({ color: '#ff8d32', transparent: true,
    opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false });
  owned.add(geometry); owned.add(material);
  const trails = new THREE.InstancedMesh(geometry, material, config.bulletPoolSize * 6);
  trails.frustumCulled = false; scene.add(trails);
  const sparks = new THREE.InstancedMesh(geometry, material, 96);
  sparks.frustumCulled = false; scene.add(sparks);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(.3, 8, 6), material);
  owned.add(flash.geometry);
  scene.add(flash);
  const warningMaterial = new THREE.MeshBasicMaterial({ color: '#ff573e', transparent: true, opacity: .5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  owned.add(warningMaterial);
  const warning = new THREE.Mesh(new THREE.PlaneGeometry(config.laneWidth * .85, 22), warningMaterial);
  owned.add(warning.geometry);
  warning.rotation.x = -Math.PI / 2; warning.position.y = TRAIL_Y + .04;
  warning.visible = false; scene.add(warning);
  const items = Array.from({ length: config.bulletPoolSize }, () => {
    const mesh = new THREE.Group(); mesh.visible = false; scene.add(mesh);
    return { mesh, model: null as T.Object3D | null, character: '', mixer: null as T.AnimationMixer | null };
  });
  const chips = Array.from({ length: 96 }, () => ({ life: 0, position: new THREE.Vector3(), velocity: new THREE.Vector3() }));
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  const origin = new THREE.Vector3();
  let character = config.defaultCharacter as string, nextChip = 0, flashLife = 0, lastEventMs = -1;
  function impact(x: number, y: number, z: number) {
    for (let n = 0; n < 12; n++) {
      const chip = chips[nextChip++ % chips.length]!;
      chip.life = .45; chip.position.set(x, y, z);
      chip.velocity.set((Math.random() - .5) * 6, Math.random() * 4, (Math.random() - .5) * 6);
    }
  }
  function hideInstances(mesh: T.InstancedMesh) {
    scale.setScalar(0);
    for (let i = 0; i < mesh.count; i++) { matrix.compose(origin, quaternion, scale); mesh.setMatrixAt(i, matrix); }
    mesh.instanceMatrix.needsUpdate = true;
  }
  hideInstances(trails); hideInstances(sparks); flash.visible = false;
  function setCharacter(id: string) { character = SPELLS[id] ? id : config.defaultCharacter; }
  function sync(state: GameState, dtSec: number, id: string) {
    setCharacter(id);
    material.color.set(SPELLS[character]!.color);
    const newFrame = state.elapsedMs !== lastEventMs;
    if (newFrame) {
      if (state.justFired) flashLife = .13;
      for (const mark of state.justImpacts) impact(laneToX(mark.lane, config), TRAIL_Y + 1.2, mark.z);
      if (state.justBossAttack) impact(laneToX(state.lane, config), TRAIL_Y + .3, config.playerZ);
      lastEventMs = state.elapsedMs;
    }
    flashLife = Math.max(0, flashLife - dtSec);
    warning.visible = state.bossWarningLane !== null;
    warning.position.x = laneToX(state.bossWarningLane ?? 1, config);
    warning.position.z = -10;
    warningMaterial.opacity = .25 + (Math.sin(state.elapsedMs * .018) + 1) * .2;
    flash.visible = flashLife > 0;
    flash.position.set(laneToX(state.lane, config), TRAIL_Y + 1.2 + state.jumpHeight, -.85);
    flash.scale.setScalar(.3 + flashLife * 5);
    items.forEach((slot, i) => {
      const bullet = state.bullets[i]; slot.mesh.visible = Boolean(bullet);
      if (bullet) {
        if (slot.character !== character) {
          slot.mixer?.stopAllAction();
          if (slot.model) slot.mixer?.uncacheRoot(slot.model);
          slot.mesh.clear();
          slot.model = templates.get(character)?.clone(true) ?? new THREE.Mesh(geometry, material);
          slot.mesh.add(slot.model); slot.character = character;
          const loop = loops.get(character);
          slot.mixer = loop ? new THREE.AnimationMixer(slot.model) : null;
          if (loop) slot.mixer!.clipAction(loop).play();
        }
        slot.mixer?.update(dtSec);
        slot.mesh.position.set(laneToX(bullet.lane, config), TRAIL_Y + 1.2, bullet.z);
        slot.model!.rotation.z = state.elapsedMs * .009 + i;
        slot.model!.scale.setScalar((templates.get(character)?.scale.x ?? 1) * (1 + Math.sin(state.elapsedMs * .018 + i) * .1));
      }
      for (let t = 0; t < 6; t++) {
        const at = i * 6 + t;
        const phase = state.elapsedMs * .015 + i + t;
        origin.set(bullet ? laneToX(bullet.lane, config) + Math.sin(phase) * .06 : 0,
          TRAIL_Y + 1.2 + Math.cos(phase) * .07, bullet ? bullet.z + .45 + t * .35 : 0);
        scale.setScalar(bullet ? (1 - t / 6) * (1.3 + Math.sin(phase) * .15) : 0);
        matrix.compose(origin, quaternion, scale); trails.setMatrixAt(at, matrix);
      }
    });
    chips.forEach((chip, i) => {
      chip.life = Math.max(0, chip.life - dtSec);
      if (chip.life) { chip.position.addScaledVector(chip.velocity, dtSec); chip.position.z += state.speed * dtSec; chip.velocity.y -= dtSec * 5; }
      scale.setScalar(chip.life * 1.8); matrix.compose(chip.position, quaternion, scale); sparks.setMatrixAt(i, matrix);
    });
    trails.instanceMatrix.needsUpdate = true; sparks.instanceMatrix.needsUpdate = true;
  }
  return { items, sync, setCharacter, impact, hide() {
    items.forEach(s => { s.mesh.visible = false; }); flash.visible = false; warning.visible = false;
    hideInstances(trails); hideInstances(sparks);
  }, reset() {
    chips.forEach(chip => { chip.life = 0; }); flashLife = 0; lastEventMs = -1;
    items.forEach(s => { s.mesh.visible = false; }); flash.visible = false; warning.visible = false;
    hideInstances(trails); hideInstances(sparks);
  }, dispose() {
    for (const slot of items) {
      slot.mixer?.stopAllAction(); if (slot.model) slot.mixer?.uncacheRoot(slot.model);
    }
    for (const template of templates.values()) template.traverse(o => {
      const mesh = o as T.Mesh; if (!mesh.isMesh) return; owned.add(mesh.geometry);
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        owned.add(mat); for (const value of Object.values(mat)) if (value instanceof THREE.Texture) owned.add(value);
      }
    });
    owned.forEach(r => r.dispose());
  } };
}
