/**
 * Lighting rig and renderer setup.
 *
 * Two things here were simply missing before and account for most of the flat,
 * pasted-on look: the renderer never enabled its shadow map (so the castShadow
 * flags set all over the scene did nothing at all), and it ran at NoToneMapping,
 * which crushes a warm palette into mud.
 *
 * The world scrolls past a player who never leaves the origin, so the shadow
 * camera can be a fixed box around it -- no per-frame refitting needed.
 */

import type * as THREE_NS from 'three';

import type { Palette } from '@/engine/render/world/palette';
import type { ShadowQuality, ThreeModule } from '@/engine/types';

const SHADOW_EXTENT_X = 42;
const SHADOW_EXTENT_Z = 58;
const SHADOW_NEAR = 1;
const SHADOW_FAR = 160;

/** Low and off to one side, for long golden-hour shadows that read across the trail. */
const SUN_POSITION = { x: -34, y: 20, z: -30 };
const RIM_POSITION = { x: 26, y: 14, z: 34 };

export const SHADOW_QUALITY: Record<ShadowQuality, number> = {
  high: 2048,
  medium: 1024,
  low: 0,
};

export function configureRenderer(
  THREE: ThreeModule,
  renderer: THREE_NS.WebGLRenderer,
  palette: Palette,
  quality: ShadowQuality = 'high',
): number {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = palette.light.exposure;

  const mapSize = SHADOW_QUALITY[quality] ?? SHADOW_QUALITY.high;
  renderer.shadowMap.enabled = mapSize > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return mapSize;
}

export interface LightingRefs {
  sun: THREE_NS.DirectionalLight;
  hemi: THREE_NS.HemisphereLight;
  rim: THREE_NS.DirectionalLight;
  applyPalette(next: Palette, renderer?: THREE_NS.WebGLRenderer): void;
}

export function addLighting(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  palette: Palette,
  mapSize: number = SHADOW_QUALITY.high,
): LightingRefs {
  const sun = new THREE.DirectionalLight(palette.light.sun, palette.light.sunIntensity);
  sun.position.set(SUN_POSITION.x, SUN_POSITION.y, SUN_POSITION.z);
  sun.target.position.set(0, 0, -12);
  scene.add(sun);
  scene.add(sun.target);

  if (mapSize > 0) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(mapSize, mapSize);
    sun.shadow.camera.left = -SHADOW_EXTENT_X;
    sun.shadow.camera.right = SHADOW_EXTENT_X;
    sun.shadow.camera.top = SHADOW_EXTENT_Z;
    sun.shadow.camera.bottom = -SHADOW_EXTENT_Z;
    sun.shadow.camera.near = SHADOW_NEAR;
    sun.shadow.camera.far = SHADOW_FAR;
    // Slope-scaled offset beats a flat bias here: the trail is nearly parallel
    // to the light, which is exactly where constant bias causes peter-panning.
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    sun.shadow.camera.updateProjectionMatrix();
  }

  const hemi = new THREE.HemisphereLight(
    palette.light.hemiSky,
    palette.light.hemiGround,
    palette.light.hemiIntensity,
  );
  scene.add(hemi);

  // Cool counter-light from behind the camera, so the character never
  // silhouettes into the canopy when the sun is on the far side of them.
  const rim = new THREE.DirectionalLight(palette.light.rim, palette.light.rimIntensity);
  rim.position.set(RIM_POSITION.x, RIM_POSITION.y, RIM_POSITION.z);
  scene.add(rim);

  return {
    sun,
    hemi,
    rim,
    applyPalette(next: Palette, renderer?: THREE_NS.WebGLRenderer) {
      sun.color.set(next.light.sun);
      sun.intensity = next.light.sunIntensity;
      hemi.color.set(next.light.hemiSky);
      hemi.groundColor.set(next.light.hemiGround);
      hemi.intensity = next.light.hemiIntensity;
      rim.color.set(next.light.rim);
      rim.intensity = next.light.rimIntensity;
      if (renderer) renderer.toneMappingExposure = next.light.exposure;
    },
  };
}
