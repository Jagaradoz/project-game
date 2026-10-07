/** Pooled forest actors; the reducer owns identities, health and attacks. */
import type * as T from 'three';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { EnemyKind, GameBody, GameConfig, ThreeModule } from '@/engine/types';
import type { Palette } from '@/engine/render/world/palette';
import { laneToX } from '@/engine/core/state';
import { TRAIL_Y } from '@/engine/render/world/ground';

export interface EnemySlot {
  group: T.Group; mixer: T.AnimationMixer | null; action: T.AnimationAction | null;
  actions: Record<string, T.AnimationAction>; current: string; kind?: EnemyKind;
  /** Hit/Attack ride on top of the locomotion loop so the legs never freeze. */
  overlays: Record<string, T.AnimationAction>; attacked?: boolean;
  id?: number; lastHitMs?: number; aura: T.Mesh; health: T.Mesh; model?: T.Object3D; elapsed?: number;
}
const OVERLAYS = ['Hit', 'Attack'];

export async function addEnemyPool(THREE: ThreeModule, scene: T.Scene, config: GameConfig,
  _palette: Palette, loader: GLTFLoader | null) {
  const templates = new Map<EnemyKind, GLTF>();
  await Promise.all((Object.keys(config.enemyTypes) as EnemyKind[]).map(async kind => {
    if (!loader) return;
    try { templates.set(kind, await loader.loadAsync(config.enemyTypes[kind].path)); }
    catch (error) { console.warn('Enemy asset unavailable:', kind, error); }
  }));
  const ringGeo = new THREE.RingGeometry(.65, .85, 20), barGeo = new THREE.PlaneGeometry(1, .1);
  const fallbackGeo = new THREE.IcosahedronGeometry(.7, 1);
  const resources = new Set<{ dispose(): void }>([ringGeo, barGeo, fallbackGeo]);
  const materials = new Map<EnemyKind, T.MeshBasicMaterial>();
  for (const kind of Object.keys(config.enemyTypes) as EnemyKind[]) {
    const material = new THREE.MeshBasicMaterial({ color: config.enemyTypes[kind].color,
      side: THREE.DoubleSide, transparent: true, opacity: .8, depthWrite: false });
    materials.set(kind, material); resources.add(material);
  }
  const makeSlot = (): EnemySlot => {
    const group = new THREE.Group();
    const aura = new THREE.Mesh(ringGeo, materials.get('normal'));
    aura.rotation.x = -Math.PI / 2; aura.position.y = .045;
    const health = new THREE.Mesh(barGeo, materials.get('normal'));
    group.add(aura, health); group.position.y = TRAIL_Y; group.visible = false; scene.add(group);
    return { group, aura, health, mixer: null, action: null, actions: {}, overlays: {}, current: '' };
  };
  const items = Array.from({ length: config.enemyPoolSize }, makeSlot);
  const corpses = Array.from({ length: config.enemy.corpseCount }, makeSlot);
  let corpseIndex = 0;
  function loadKind(slot: EnemySlot, kind: EnemyKind) {
    if (slot.kind === kind) return;
    slot.mixer?.stopAllAction();
    if (slot.model) { slot.mixer?.uncacheRoot(slot.model); slot.group.remove(slot.model); }
    const template = templates.get(kind), def = config.enemyTypes[kind];
    const model = template ? clone(template.scene) : new THREE.Mesh(fallbackGeo, materials.get(kind));
    const bounds = new THREE.Box3().setFromObject(model);
    const scale = def.height / Math.max(.01, bounds.getSize(new THREE.Vector3()).y);
    model.scale.setScalar(scale); model.position.y = -bounds.min.y * scale;
    model.traverse(o => { const mesh = o as T.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.frustumCulled = false; } });
    slot.group.add(model); slot.model = model; slot.kind = kind;
    slot.aura.material = materials.get(kind)!; slot.health.material = materials.get(kind)!;
    slot.aura.scale.setScalar(def.radius * 1.65); slot.health.position.set(0, def.height + .25, 0);
    slot.mixer = template ? new THREE.AnimationMixer(model) : null; slot.actions = {}; slot.overlays = {};
    for (const clip of template?.animations ?? []) {
      if (!OVERLAYS.includes(clip.name)) { slot.actions[clip.name] = slot.mixer!.clipAction(clip); continue; }
      // Upper-body reactions: additive, so they bend the pose instead of replacing the legs.
      const additive = clip.clone();
      THREE.AnimationUtils.makeClipAdditive(additive, 0, clip);
      const action = slot.mixer!.clipAction(additive);
      action.blendMode = THREE.AdditiveAnimationBlendMode;
      action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = false;
      slot.overlays[clip.name] = action;
    }
    slot.current = ''; slot.action = null;
  }
  function play(slot: EnemySlot, name: string, once = false, restart = false) {
    const target = slot.actions[name] ?? slot.actions.Run ?? slot.actions.Walk;
    if (!target || (!restart && slot.action === target)) return;
    // A fresh slot has no pose to blend from: start at full weight so it never shows the bind pose.
    const blend = slot.action ? .12 : 0;
    slot.action?.fadeOut(blend);
    target.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    target.clampWhenFinished = once; target.fadeIn(blend).play();
    slot.action = target; slot.current = name;
    if (!blend) slot.mixer?.update(0);
  }
  function overlay(slot: EnemySlot, name: string, timeScale = 1) {
    const action = slot.overlays[name];
    if (!action) return;
    action.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).play();
  }
  function sync(enemies: GameBody[], elapsedMs: number, dtSec: number, bossAttacking: boolean) {
    const wanted = new Set(enemies.map((e, i) => e.id ?? -i - 1));
    for (const slot of items) if (slot.id === undefined || !wanted.has(slot.id)) { slot.group.visible = false; slot.id = undefined; }
    let animated = 0;
    for (const enemy of [...enemies].sort((a, b) => b.z - a.z)) {
      const id = enemy.id ?? -enemies.indexOf(enemy) - 1;
      const slot = items.find(s => s.id === id) ?? items.find(s => s.id === undefined);
      if (!slot) break;
      const fresh = slot.id !== id;
      loadKind(slot, enemy.kind ?? 'normal');
      if (fresh) {
        slot.current = ''; slot.action?.stop(); slot.action = null; slot.id = id; slot.lastHitMs = -Infinity; slot.attacked = false;
        for (const action of Object.values(slot.overlays)) action.stop();
      }
      slot.group.visible = true; slot.group.position.set(laneToX(enemy.lane, config), TRAIL_Y, enemy.z);
      const def = config.enemyTypes[slot.kind!], health = Math.max(0, (enemy.hp ?? 1) / def.hp);
      slot.health.visible = health < 1 || slot.kind === 'boss';
      slot.health.scale.x = health * def.radius * 2;
      const swinging = slot.kind === 'boss' ? bossAttacking : enemy.z > -5;
      if (swinging && !slot.attacked) overlay(slot, 'Attack');
      slot.attacked = swinging;
      if (enemy.lastHitMs !== undefined && enemy.lastHitMs !== slot.lastHitMs) { slot.lastHitMs = enemy.lastHitMs; overlay(slot, 'Hit', 2.5); }
      play(slot, slot.kind === 'tank' ? 'Walk' : slot.kind === 'boss' && enemy.z >= config.boss.holdZ ? 'Idle' : 'Run');
      if (slot.mixer && animated < config.enemy.animatedCount && enemy.z > config.enemy.animateBeyondZ) { slot.mixer.update(dtSec); animated++; }
      slot.aura.rotation.z = Math.sin(elapsedMs * .005 + id) * .08;
    }
  }
  function spawnDeath(x: number, z: number, kind: EnemyKind = 'normal') {
    const slot = corpses[corpseIndex++ % corpses.length]!;
    loadKind(slot, kind); slot.mixer?.stopAllAction(); slot.current = ''; slot.action = null;
    slot.group.position.set(x, TRAIL_Y, z); slot.group.visible = true;
    slot.aura.visible = false; slot.health.visible = false; slot.elapsed = 0; play(slot, 'Death', true, true);
  }
  function updateCorpses(dtSec: number, speed: number) {
    for (const slot of corpses) if (slot.group.visible) {
      slot.elapsed = (slot.elapsed ?? 0) + dtSec; slot.group.position.z += speed * dtSec; slot.mixer?.update(dtSec);
      if (slot.elapsed > 2) slot.group.position.y = TRAIL_Y - (slot.elapsed - 2) * 2;
      if (slot.elapsed > 3.2 || slot.group.position.z > 26) slot.group.visible = false;
    }
  }
  return { items, corpses, sync, spawnDeath, updateCorpses, reset() {
    for (const slot of [...items, ...corpses]) {
      slot.group.visible = false; slot.id = undefined; slot.action?.stop(); slot.action = null; slot.current = '';
    }
  }, dispose() {
    for (const slot of [...items, ...corpses]) { slot.mixer?.stopAllAction(); if (slot.model) slot.mixer?.uncacheRoot(slot.model); }
    for (const template of templates.values()) template.scene.traverse(o => {
      const mesh = o as T.Mesh; if (!mesh.isMesh) return; resources.add(mesh.geometry);
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        resources.add(mat); for (const v of Object.values(mat)) if (v instanceof THREE.Texture) resources.add(v);
      }
    });
    resources.forEach(r => r.dispose());
  } };
}
