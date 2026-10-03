/**
 * Vertical-gradient sky dome.
 *
 * Built from vertex colours on a MeshBasicMaterial rather than a ShaderMaterial
 * so it goes through the standard pipeline and picks up tone mapping like
 * everything else -- a raw shader would need the ACES chunk inlined by hand to
 * avoid drifting away from the rest of the scene.
 *
 * The four stops run haze -> warm glow -> mid blue -> zenith. The lowest stop is
 * the same colour as the fog, so the fogged-out end of the ground meets the sky
 * with no visible seam at the horizon.
 */

import type * as THREE_NS from 'three';

import type { Palette } from '@/engine/render/world/palette';
import type { ThreeModule } from '@/engine/types';

const DOME_RADIUS = 480;
const WIDTH_SEGMENTS = 24;
const HEIGHT_SEGMENTS = 20;

/** Normalised heights (0 = horizon, 1 = straight up) for each palette stop. */
const STOPS = [
  { at: 0.0, key: 'haze' },
  { at: 0.1, key: 'glow' },
  { at: 0.42, key: 'mid' },
  { at: 1.0, key: 'zenith' },
];

export interface SkyRefs {
  dome: THREE_NS.Mesh;
}

export function addSky(THREE: ThreeModule, scene: THREE_NS.Scene, palette: Palette): SkyRefs {
  const geometry = new THREE.SphereGeometry(DOME_RADIUS, WIDTH_SEGMENTS, HEIGHT_SEGMENTS);
  const colors = buildGradientColors(THREE, geometry, palette.sky);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });

  const dome = new THREE.Mesh(geometry, material);
  // Behind everything: the dome must never win a depth fight with distant ridges.
  dome.renderOrder = -1;
  scene.add(dome);

  scene.background = new THREE.Color(palette.sky.haze);
  scene.fog = new THREE.Fog(palette.fog.color, palette.fog.near, palette.fog.far);

  return {
    dome,
  };
}

function buildGradientColors(
  THREE: ThreeModule,
  geometry: THREE_NS.BufferGeometry,
  sky: Palette['sky'],
): Float32Array {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const stops: GradientStop[] = STOPS.map((stop) => ({
    at: stop.at,
    color: new THREE.Color(sky[stop.key as keyof Palette['sky']]),
  }));
  const scratch = new THREE.Color();

  for (let index = 0; index < position.count; index += 1) {
    const height = Math.max(0, position.getY(index) / DOME_RADIUS);
    sampleGradient(scratch, stops, height);
    colors[index * 3] = scratch.r;
    colors[index * 3 + 1] = scratch.g;
    colors[index * 3 + 2] = scratch.b;
  }

  return colors;
}

interface GradientStop {
  at: number;
  color: THREE_NS.Color;
}

function sampleGradient(out: THREE_NS.Color, stops: GradientStop[], height: number): THREE_NS.Color {
  for (let index = 1; index < stops.length; index += 1) {
    const lower = stops[index - 1]!;
    const upper = stops[index]!;
    if (height > upper.at && index < stops.length - 1) continue;

    const span = upper.at - lower.at;
    const t = span <= 0 ? 0 : Math.min(1, Math.max(0, (height - lower.at) / span));
    return out.copy(lower.color).lerp(upper.color, t);
  }
  return out.copy(stops[0]!.color);
}
