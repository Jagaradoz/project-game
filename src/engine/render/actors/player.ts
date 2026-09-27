/**
 * The player character.
 *
 * Handles loading a rigged GLTF, cross-fading its animation clips, hiding the
 * weapons a character pack ships but this loadout does not use, and lending its
 * blade to the projectile pool. Falls back to a procedural orb whenever no
 * loader or no model is available, so the game is never unplayable.
 */

import type * as THREE_NS from 'three';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { Palette } from '@/engine/render/world/palette';
import type { CharacterDef, CharacterRoster, GameConfig, ThreeModule } from '@/engine/types';

/** The character's own weapon mesh, reused as the thrown projectile. */
export interface ProjectileSource {
  geometry: THREE_NS.BufferGeometry;
  material: THREE_NS.Material;
}

/**
 * The player handle. Methods are attached after construction because
 * `playAnimation` and `loadCharacter` both close over the object itself.
 */
export interface PlayerRefs {
  group: THREE_NS.Group;
  body: THREE_NS.Mesh;
  ring: THREE_NS.Mesh;
  material: THREE_NS.MeshStandardMaterial;
  materials: THREE_NS.Material[];
  mixer: THREE_NS.AnimationMixer | null;
  actions: Record<string, THREE_NS.AnimationAction>;
  currentAction: THREE_NS.AnimationAction | null;
  currentActionName: string | null;
  characterId: string;
  fallbackVisible: boolean;
  modelContainer: THREE_NS.Group;
  fallbackGroup: THREE_NS.Group;
  projectile?: ProjectileSource | null;
  playAnimation(name: string, duration?: number, loop?: boolean, restart?: boolean): void;
  loadCharacter(charId: string): Promise<boolean>;
}

import { laneToX } from '@/engine/core/state';
import { TRAIL_Y } from '@/engine/render/world/ground';

export async function addPlayer(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
  loader: GLTFLoader | null,
): Promise<PlayerRefs> {
  const group = new THREE.Group();

  const fallbackGroup = new THREE.Group();
  const bodyGeo = new THREE.IcosahedronGeometry(config.playerRadius, 1);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: palette.accents.player,
    roughness: 0.25,
    metalness: 0.4,
    flatShading: true,
    transparent: true,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  fallbackGroup.add(body);

  const ringGeo = new THREE.TorusGeometry(config.playerRadius * 0.95, 0.08, 6, 12);
  const ringMat = new THREE.MeshBasicMaterial({ color: palette.accents.bullet, transparent: true });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  fallbackGroup.add(ring);

  fallbackGroup.position.y = config.playerRadius;
  group.add(fallbackGroup);

  const modelContainer = new THREE.Group();
  group.add(modelContainer);

  group.position.set(laneToX(1, config), TRAIL_Y, config.playerZ);
  scene.add(group);

  const playerObj: PlayerRefs = {
    group,
    body,
    ring,
    material: bodyMat,
    materials: [bodyMat, ringMat],
    mixer: null,
    actions: {},
    currentAction: null,
    currentActionName: null,
    characterId: config.defaultCharacter,
    fallbackVisible: true,
    modelContainer,
    fallbackGroup,
    // Both are reassigned immediately below; they have to close over playerObj
    // itself, which is not in scope inside its own literal.
    playAnimation: () => {},
    loadCharacter: async () => false,
  };

  const gltfCache = new Map<string, GLTF>();
  /**
   * Guards against a slow load landing after a newer one. Switching characters
   * quickly used to leave the player wearing one model and driving another
   * model's animation clips.
   */
  let loadToken = 0;

  playerObj.playAnimation = function playAnimation(name: string, duration = 0.2, loop = true, restart = false) {
    if (!playerObj.mixer || playerObj.fallbackVisible) return;
    if (!restart && playerObj.currentActionName === name && (
      playerObj.currentAction?.isRunning() ||
      (name === 'death' && playerObj.currentAction?.paused)
    )) return;

    const targetAction =
      playerObj.actions[name] ||
      playerObj.actions.run;

    if (!targetAction) return;

    // A missing attack must keep running rather than turn the run into a
    // clamped one-shot (or accidentally choose an idle clip).
    const resolvedName = playerObj.actions[name] ? name : 'run';
    if (resolvedName !== name) loop = true;
    if (!restart && playerObj.currentAction === targetAction && targetAction.isRunning()) return;

    if (loop) {
      targetAction.setLoop(THREE.LoopRepeat, Infinity);
      targetAction.clampWhenFinished = false;
    } else {
      targetAction.setLoop(THREE.LoopOnce, 1);
      targetAction.clampWhenFinished = true;
    }

    if (playerObj.currentAction && playerObj.currentAction !== targetAction) {
      targetAction.reset();
      targetAction.setEffectiveTimeScale(resolvedName === 'shoot' ? 2 : 1);
      targetAction.setEffectiveWeight(1);
      targetAction.fadeIn(duration);
      targetAction.play();
      playerObj.currentAction.fadeOut(duration);
    } else {
      targetAction.reset();
      targetAction.setEffectiveTimeScale(resolvedName === 'shoot' ? 2 : 1);
      targetAction.setEffectiveWeight(1);
      targetAction.play();
    }

    playerObj.currentAction = targetAction;
    playerObj.currentActionName = resolvedName;
  };

  playerObj.loadCharacter = async function loadCharacter(charId: string): Promise<boolean> {
    const token = loadToken += 1;
    playerObj.characterId = charId;

    if (charId === 'orb' || !loader) {
      modelContainer.visible = false;
      fallbackGroup.visible = true;
      playerObj.fallbackVisible = true;
      if (playerObj.mixer) {
        playerObj.mixer.stopAllAction();
        playerObj.mixer = null;
      }
      playerObj.materials = [bodyMat, ringMat];
      playerObj.actions = {};
      playerObj.currentAction = null;
      playerObj.currentActionName = null;
      playerObj.projectile = null;
      return true;
    }

    const roster = config.characters as unknown as CharacterRoster;
    const charDef: CharacterDef | undefined = roster?.[charId] ?? roster?.[config.defaultCharacter];
    if (!charDef || !charDef.path) return false;

    try {
      let gltf = gltfCache.get(charDef.path);
      if (!gltf) {
        gltf = await loader.loadAsync(charDef.path);
        gltfCache.set(charDef.path, gltf);
      }

      // Another character was picked while this one was downloading; that load
      // owns the player now, and applying this one would half-overwrite it.
      if (token !== loadToken) return false;

      if (playerObj.mixer) playerObj.mixer.stopAllAction();
      while (modelContainer.children.length > 0) {
        modelContainer.remove(modelContainer.children[0]);
      }

      const model = gltf.scene;
      const materials: THREE_NS.Material[] = [];

      model.traverse((node) => {
        const child = node as THREE_NS.Mesh & { isSkinnedMesh?: boolean };
        if (!child.isMesh && !child.isSkinnedMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (!child.material) return;
        // Cloned so the invulnerability blink cannot bleed into another model.
        if (Array.isArray(child.material)) {
          child.material = child.material.map((entry) => {
            const clone = entry.clone();
            clone.transparent = true;
            materials.push(clone);
            return clone;
          });
        } else {
          child.material = child.material.clone();
          child.material.transparent = true;
          materials.push(child.material);
        }
      });

      hideUnusedParts(model, charDef.hideParts);
      playerObj.projectile = extractProjectile(model, charDef.projectilePart);

      const scale = charDef.scale || 1.0;
      model.scale.set(scale, scale, scale);

      const scaledBox = new THREE.Box3().setFromObject(model);
      model.position.set(0, -scaledBox.min.y + (charDef.offsetY || 0), 0);
      model.rotation.y = charDef.rotationY ?? Math.PI;

      modelContainer.add(model);
      modelContainer.visible = true;
      fallbackGroup.visible = false;

      const mixer = new THREE.AnimationMixer(model);
      const actions: Record<string, THREE_NS.AnimationAction> = {};
      const clipMap = new Map(gltf.animations.map((clip) => [clip.name.toLowerCase(), clip]));

      const animationMap = (charDef.animations ?? {}) as Record<string, string>;
      for (const [logicalName, clipName] of Object.entries(animationMap)) {
        const clip =
          gltf.animations.find((entry) => entry.name === clipName) ||
          clipMap.get(clipName.toLowerCase());
        if (clip) actions[logicalName] = mixer.clipAction(clip);
      }

      if (Object.keys(actions).length === 0 && gltf.animations.length > 0) {
        const runClip = gltf.animations.find((clip) => /^run(?:ning)?(?:_|$)/i.test(clip.name));
        if (runClip) actions.run = mixer.clipAction(runClip);
      }

      playerObj.mixer = mixer;
      playerObj.actions = actions;
      playerObj.materials = materials.length > 0 ? materials : [bodyMat];
      playerObj.fallbackVisible = false;
      playerObj.currentAction = null;
      playerObj.currentActionName = null;

      playerObj.playAnimation('run', 0.1, true);
      return true;
    } catch (error) {
      console.error(`Failed to load character model ${charId}:`, error);
      if (token !== loadToken) return false;
      modelContainer.visible = false;
      fallbackGroup.visible = true;
      playerObj.fallbackVisible = true;
      playerObj.materials = [bodyMat, ringMat];
      playerObj.mixer?.stopAllAction();
      playerObj.mixer = null;
      playerObj.actions = {};
      playerObj.currentAction = null;
      playerObj.currentActionName = null;
      playerObj.projectile = null;
      return false;
    }
  };

  await playerObj.loadCharacter(config.defaultCharacter);

  return playerObj;
}

/**
 * The character's own weapon, borrowed as the thrown projectile. Reusing the
 * mesh that is already in the file keeps the projectile in the character's art
 * style for free -- no extra asset, no extra download.
 */
function extractProjectile(
  model: THREE_NS.Object3D,
  partName: string | undefined,
): ProjectileSource | null {
  if (!partName) return null;

  let source: THREE_NS.Mesh | null = null;
  model.traverse((node) => {
    const child = node as THREE_NS.Mesh;
    if (source || child.name !== partName || !child.isMesh) return;
    source = child;
  });

  if (!source) return null;
  const mesh = source as THREE_NS.Mesh;
  return {
    geometry: mesh.geometry,
    material: (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE_NS.Material,
  };
}

/**
 * Character packs ship every weapon and hat in the same file, all visible.
 * Anything not named in the loadout is switched off.
 */
function hideUnusedParts(model: THREE_NS.Object3D, hideParts: readonly string[] | undefined): void {
  if (!Array.isArray(hideParts) || hideParts.length === 0) return;
  const hidden = new Set(hideParts);
  model.traverse((child) => {
    if (hidden.has(child.name)) child.visible = false;
  });
}
