import type * as Three from 'three';

import { CONFIG } from '@/engine/config';
import { collectResources, disposeSkeletons } from '@/engine/render/resources';

export type CharacterPreviewStatus = 'loading' | 'ready' | 'error';

export interface CharacterPreviewSlot {
  id: string;
  element: HTMLElement;
}

/** Five isolated views share one renderer and one canvas. Runtime owns the loop. */
export async function createCharacterPreviewScene(
  canvas: HTMLCanvasElement,
  slots: readonly CharacterPreviewSlot[],
  onStatus: (id: string, status: CharacterPreviewStatus) => void,
) {
  const [THREE, { GLTFLoader }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
  ]);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  const loader = new GLTFLoader();
  let disposed = false;
  let width = 0;
  let height = 0;
  const views: {
    slot: CharacterPreviewSlot;
    scene: Three.Scene;
    camera: Three.OrthographicCamera;
    mixer: Three.AnimationMixer | null;
    model: Three.Object3D | null;
    span: number;
  }[] = [];

  function release(root: Three.Object3D) {
    const resources = new Set<{ dispose(): void }>();
    collectResources(root, resources);
    disposeSkeletons(root);
    for (const resource of resources) resource.dispose();
  }

  for (const slot of slots) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8d7457, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(3, 5, 4);
    scene.add(key);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.65, 40),
      new THREE.MeshBasicMaterial({ color: 0x9c815e, transparent: true, opacity: 0.16 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.01;
    scene.add(shadow);
    const camera = new THREE.OrthographicCamera(-2, 2, 3, 0, 0.1, 100);
    camera.position.set(0, 1.45, 6);
    camera.lookAt(0, 1.35, 0);
    const view = { slot, scene, camera, mixer: null as Three.AnimationMixer | null, model: null as Three.Object3D | null, span: 3.3 };
    views.push(view);
    onStatus(slot.id, 'loading');
    const character = Object.values(CONFIG.game.characters).find(entry => entry.id === slot.id);
    if (!character) {
      onStatus(slot.id, 'error');
      continue;
    }
    void loader.loadAsync(character.path).then(gltf => {
      if (disposed) {
        release(gltf.scene);
        return;
      }
      const idle = gltf.animations.find(clip => clip.name.toLowerCase() === character.animations.idle.toLowerCase());
      if (!idle) {
        release(gltf.scene);
        onStatus(slot.id, 'error');
        return;
      }
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 2.6 / Math.max(size.y, 0.01);
      model.scale.multiplyScalar(scale);
      const scaled = new THREE.Box3().setFromObject(model);
      const center = scaled.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -scaled.min.y, -center.z);
      // The runner faces down the trail; the chooser faces the player.
      model.rotation.y = 0;
      scene.add(model);
      view.model = model;
      view.span = size.x * scale * 1.2;
      view.mixer = new THREE.AnimationMixer(model);
      view.mixer.clipAction(idle).setLoop(THREE.LoopRepeat, Infinity).play();
      view.mixer.update(0);
      onStatus(slot.id, 'ready');
    }).catch(() => {
      if (!disposed) onStatus(slot.id, 'error');
    });
  }

  return {
    render(dt: number) {
      if (disposed) return;
      const outer = canvas.getBoundingClientRect();
      const nextWidth = Math.round(outer.width);
      const nextHeight = Math.round(outer.height);
      if (!nextWidth || !nextHeight) return;
      if (width !== nextWidth || height !== nextHeight) {
        width = nextWidth;
        height = nextHeight;
        renderer.setSize(width, height, false);
      }
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
      for (const view of views) {
        view.mixer?.update(dt);
        const rect = view.slot.element.getBoundingClientRect();
        if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > window.innerHeight) continue;
        const aspect = rect.width / rect.height;
        const span = Math.max(3.3, view.span / aspect);
        view.camera.left = -span * aspect / 2;
        view.camera.right = span * aspect / 2;
        view.camera.top = span / 2;
        view.camera.bottom = -span / 2;
        view.camera.updateProjectionMatrix();
        const x = rect.left - outer.left;
        const y = outer.bottom - rect.bottom;
        renderer.setViewport(x, y, rect.width, rect.height);
        renderer.setScissor(x, y, rect.width, rect.height);
        renderer.render(view.scene, view.camera);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const view of views) {
        view.mixer?.stopAllAction();
        if (view.model) view.mixer?.uncacheRoot(view.model);
        release(view.scene);
      }
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
