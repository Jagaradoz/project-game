/**
 * The trail's wandering edge.
 *
 * The reducer's lanes are absolute -- a lane is an exact x, and the game would
 * break if that moved. So the path direction never changes: it runs dead
 * straight to the horizon. What wanders is the DIRT'S BOUNDARY, displaced
 * sideways in the vertex shader by a function of world z, weighted so it peaks
 * at the trail lip and falls to nothing at the centre and out in the bank.
 *
 * The dirt is deliberately wider than the play area, so however far the edge
 * pinches in, the lanes are always on it. See `trailEdgeReach` for the number.
 *
 * Two chunks have to agree on the displacement or things come apart:
 *   - project_vertex   what you see
 *   - worldpos_vertex  where a surface looks up its shadow
 * A shadow-casting object would need its depth material patched too, which
 * `patchObject` handles -- though the only thing patched today is the ground,
 * which receives shadows without casting any.
 */

/**
 * Weights on the three meander waves. Incommensurate on purpose: a single sine
 * reads as a regular S-bend, and the point is for the edge not to look designed.
 */
import type * as THREE_NS from 'three';

import type { ThreeModule, TrailEdgeSettings } from '@/engine/types';

const MEANDER_WAVES = [
  { weight: 0.55, frequency: 0.0431, phase: 0 },
  { weight: 0.3, frequency: 0.0177, phase: 2.1 },
  { weight: 0.15, frequency: 0.0916, phase: 4.3 },
];

const PINCH_FREQUENCY = 0.0263;
const PINCH_PHASE = 1.2;

/**
 * GLSL has no implicit int-to-float conversion, so a whole number interpolated
 * into a shader as `0` is an int literal and `float + 0` fails to compile.
 * Everything spliced into the source below goes through here.
 */
function glslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

const VERTEX_PARS = /* glsl */ `
uniform float uEdgeMeander;
uniform float uEdgePinch;
uniform float uEdgeScroll;
uniform float uEdgeHalfWidth;
uniform float uEdgeFalloff;

// Peaks at the lip, nothing at the trail centre, nothing out in the bank.
float trailEdgeWeight( float worldX ) {
  float d = abs( worldX );
  float inner = smoothstep( 0.0, uEdgeHalfWidth, d );
  float outer = 1.0 - smoothstep( uEdgeHalfWidth, uEdgeHalfWidth + uEdgeFalloff, d );
  return inner * outer;
}

float trailEdgeOffset( float worldX, float worldZ ) {
  float phase = worldZ - uEdgeScroll;

  // Same sign on both sides: the whole ribbon wanders.
  float meander = uEdgeMeander * (
      ${MEANDER_WAVES.map(
        (wave) =>
          `${glslFloat(wave.weight)} * sin( phase * ${glslFloat(wave.frequency)} + ${glslFloat(wave.phase)} )`,
      ).join('\n    + ')}
  );

  // Opposite sign per side: the ribbon pinches and widens.
  float pinch = uEdgePinch * sin( phase * ${glslFloat(PINCH_FREQUENCY)} + ${glslFloat(PINCH_PHASE)} );
  float side = worldX < 0.0 ? -1.0 : 1.0;

  return trailEdgeWeight( worldX ) * ( meander + side * pinch );
}
`;

const PROJECT_VERTEX = /* glsl */ `
vec4 lrLocal = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  lrLocal = batchingMatrix * lrLocal;
#endif
#ifdef USE_INSTANCING
  lrLocal = instanceMatrix * lrLocal;
#endif
vec4 lrWorld = modelMatrix * lrLocal;
lrWorld.x += trailEdgeOffset( lrWorld.x, lrWorld.z );
vec4 mvPosition = viewMatrix * lrWorld;
gl_Position = projectionMatrix * mvPosition;
`;

/** Three's own worldpos chunk, with the same displacement applied. */
const WORLDPOS_VERTEX = /* glsl */ `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  vec4 worldPosition = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    worldPosition = batchingMatrix * worldPosition;
  #endif
  #ifdef USE_INSTANCING
    worldPosition = instanceMatrix * worldPosition;
  #endif
  worldPosition = modelMatrix * worldPosition;
  worldPosition.x += trailEdgeOffset( worldPosition.x, worldPosition.z );
#endif
`;

/**
 * The furthest the lip can ever pinch inward, in world units. Callers size the
 * dirt from this so a lane can never end up on grass -- it is a guarantee to be
 * checked, not a look to be eyeballed.
 */
export function trailEdgeReach(settings: TrailEdgeSettings = {}): number {
  return (settings.meander ?? 0.55) + (settings.pinch ?? 0.35);
}

/**
 * The displacement the shader applies, evaluated on the CPU.
 *
 * Exists so the "a lane can never sit on grass" invariant is testable. It reads
 * the same wave table the GLSL above is built from, so the two cannot drift
 * apart -- change a frequency and both move together.
 */
export function trailEdgeOffsetAt(
  worldX: number,
  worldZ: number,
  settings: TrailEdgeSettings = {},
  scroll = 0,
): number {
  const halfWidth = settings.halfWidth ?? 4.9;
  const falloff = settings.falloff ?? 6;

  const distance = Math.abs(worldX);
  const inner = smoothstep(0, halfWidth, distance);
  const outer = 1 - smoothstep(halfWidth, halfWidth + falloff, distance);
  const weight = inner * outer;

  const phase = worldZ - scroll;
  const meander = (settings.meander ?? 0.55) *
    MEANDER_WAVES.reduce(
      (sum, wave) => sum + wave.weight * Math.sin(phase * wave.frequency + wave.phase),
      0,
    );
  const pinch = (settings.pinch ?? 0.35) * Math.sin(phase * PINCH_FREQUENCY + PINCH_PHASE);
  const side = worldX < 0 ? -1 : 1;

  return weight * (meander + side * pinch);
}

/** GLSL's smoothstep, so the CPU mirror matches the shader at the edges too. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function createTrailEdge(THREE: ThreeModule, settings: TrailEdgeSettings = {}) {
  const uniforms = {
    uEdgeMeander: { value: settings.meander ?? 0.55 },
    uEdgePinch: { value: settings.pinch ?? 0.35 },
    uEdgeScroll: { value: 0 },
    uEdgeHalfWidth: { value: settings.halfWidth ?? 4.9 },
    uEdgeFalloff: { value: settings.falloff ?? 6 },
  };

  function patchMaterial<T extends THREE_NS.Material>(material: T): T {
    if (!material || material.userData.trailEdge) return material;
    material.userData.trailEdge = true;

    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader: THREE_NS.WebGLProgramParametersWithUniforms, renderer: THREE_NS.WebGLRenderer) => {
      previous?.(shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `${VERTEX_PARS}\nvoid main() {`)
        .replace('#include <project_vertex>', PROJECT_VERTEX)
        .replace('#include <worldpos_vertex>', WORLDPOS_VERTEX);
    };

    // Patched and unpatched variants of the same material must not share a
    // compiled program.
    material.customProgramCacheKey = () => 'trailEdge';
    material.needsUpdate = true;
    return material;
  }

  /**
   * Patches a mesh's materials, and gives shadow casters a depth material with
   * the same displacement -- without it an object would be drawn displaced but
   * cast its shadow from where it would have been.
   */
  function patchObject<T extends THREE_NS.Object3D>(object: T): T {
    object.traverse((node) => {
      const child = node as THREE_NS.Mesh & { isSkinnedMesh?: boolean; isInstancedMesh?: boolean };
      if (!child.isMesh && !child.isSkinnedMesh && !child.isInstancedMesh) return;

      if (Array.isArray(child.material)) child.material.forEach(patchMaterial);
      else patchMaterial(child.material);

      if (!child.castShadow || child.customDepthMaterial) return;
      child.customDepthMaterial = patchMaterial(
        new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }),
      );
    });
    return object;
  }

  return {
    uniforms,
    patchMaterial,
    patchObject,
    /** Slides the edge shape towards the player as the run advances. */
    update(distance: number) {
      uniforms.uEdgeScroll.value = distance;
    },
  };
}
