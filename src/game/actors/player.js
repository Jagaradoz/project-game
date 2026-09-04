/**
 * The player character.
 *
 * Handles loading a rigged GLTF, cross-fading its animation clips, hiding the
 * weapons a character pack ships but this loadout does not use, and lending its
 * blade to the projectile pool. Falls back to a procedural orb whenever no
 * loader or no model is available, so the game is never unplayable.
 */

import { laneToX } from '../state.js?v=1.10.0';
import { TRAIL_Y } from '../world/ground.js?v=1.10.0';

export async function addPlayer(THREE, scene, config, palette, loader, curve = null) {
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
  curve?.patchObject(fallbackGroup);

  const playerObj = {
    group,
    body,
    ring,
    material: bodyMat,
    materials: [bodyMat, ringMat],
    mixer: null,
    actions: {},
    currentAction: null,
    currentActionName: null,
    characterId: config.defaultCharacter || 'robot',
    fallbackVisible: true,
    modelContainer,
    fallbackGroup,
  };

  const gltfCache = new Map();
  /**
   * Guards against a slow load landing after a newer one. Switching characters
   * quickly used to leave the player wearing one model and driving another
   * model's animation clips.
   */
  let loadToken = 0;

  playerObj.playAnimation = function playAnimation(name, duration = 0.2, loop = true) {
    if (!playerObj.mixer || playerObj.fallbackVisible) return;
    if (playerObj.currentActionName === name && playerObj.currentAction?.isRunning()) return;

    const targetAction =
      playerObj.actions[name] ||
      playerObj.actions.run ||
      playerObj.actions.idle ||
      Object.values(playerObj.actions)[0];

    if (!targetAction) return;

    if (loop) {
      targetAction.setLoop(THREE.LoopRepeat, Infinity);
      targetAction.clampWhenFinished = false;
    } else {
      targetAction.setLoop(THREE.LoopOnce, 1);
      targetAction.clampWhenFinished = true;
    }

    if (playerObj.currentAction && playerObj.currentAction !== targetAction) {
      targetAction.reset();
      targetAction.fadeIn(duration);
      targetAction.play();
      playerObj.currentAction.fadeOut(duration);
    } else {
      targetAction.reset();
      targetAction.play();
    }

    playerObj.currentAction = targetAction;
    playerObj.currentActionName = name;
  };

  playerObj.loadCharacter = async function loadCharacter(charId) {
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

    const charDef = config.characters?.[charId] || config.characters?.robot;
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
      const materials = [];

      model.traverse((child) => {
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
      curve?.patchObject(model);

      const mixer = new THREE.AnimationMixer(model);
      const actions = {};
      const clipMap = new Map(gltf.animations.map((clip) => [clip.name.toLowerCase(), clip]));

      for (const [logicalName, clipName] of Object.entries(charDef.animations || {})) {
        const clip =
          gltf.animations.find((entry) => entry.name === clipName) ||
          clipMap.get(clipName.toLowerCase());
        if (clip) actions[logicalName] = mixer.clipAction(clip);
      }

      if (Object.keys(actions).length === 0 && gltf.animations.length > 0) {
        gltf.animations.forEach((clip, index) => {
          actions[index === 0 ? 'run' : clip.name.toLowerCase()] = mixer.clipAction(clip);
        });
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
      return false;
    }
  };

  await playerObj.loadCharacter(config.defaultCharacter || 'robot');

  return playerObj;
}

/**
 * The character's own weapon, borrowed as the thrown projectile. Reusing the
 * mesh that is already in the file keeps the projectile in the character's art
 * style for free -- no extra asset, no extra download.
 */
function extractProjectile(model, partName) {
  if (!partName) return null;

  let source = null;
  model.traverse((child) => {
    if (source || child.name !== partName || !child.isMesh) return;
    source = child;
  });

  if (!source) return null;
  return {
    geometry: source.geometry,
    material: Array.isArray(source.material) ? source.material[0] : source.material,
  };
}

/**
 * Character packs ship every weapon and hat in the same file, all visible.
 * Anything not named in the loadout is switched off.
 */
function hideUnusedParts(model, hideParts) {
  if (!Array.isArray(hideParts) || hideParts.length === 0) return;
  const hidden = new Set(hideParts);
  model.traverse((child) => {
    if (hidden.has(child.name)) child.visible = false;
  });
}
