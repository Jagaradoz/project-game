/**
 * The winding-trail effect.
 *
 * The reducer's lanes are absolute -- a lane is an exact x, and the game would
 * break if that moved. So the path does not actually bend: every vertex in the
 * scene is displaced sideways in the VERTEX SHADER by a function of its world z,
 * ramped to zero at the player. Gameplay geometry is untouched, the collision
 * model is untouched, and the trail still runs dead straight underfoot while
 * curving away into the distance.
 *
 * Three chunks have to agree on the displacement or things come apart:
 *   - project_vertex   what you see
 *   - worldpos_vertex  where a surface looks up its shadow
 *   - the depth material, which is what casts that shadow in the first place
 */

const VERTEX_PARS = /* glsl */ `
uniform float uCurveAmp;
uniform float uCurveFreq;
uniform float uCurveScroll;
uniform float uCurveRamp;
uniform float uHillAmp;
uniform float uHillFreq;

vec2 laneCurveOffset( float worldZ ) {
  // Zero under the player and easing in with distance, so the near field never
  // slides sideways as the run scrolls.
  float depth = max( 0.0, -worldZ );
  float ramp = clamp( depth * depth / uCurveRamp, 0.0, 1.0 );

  float phase = ( worldZ - uCurveScroll );
  float bend = sin( phase * uCurveFreq ) + 0.45 * sin( phase * uCurveFreq * 2.3 + 1.7 );
  float crest = cos( phase * uHillFreq ) - 1.0;

  return vec2( uCurveAmp * bend, uHillAmp * crest ) * ramp;
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
lrWorld.xy += laneCurveOffset( lrWorld.z );
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
  worldPosition.xy += laneCurveOffset( worldPosition.z );
#endif
`;

export function createCurve(THREE, settings = {}) {
  const uniforms = {
    uCurveAmp: { value: settings.amplitude ?? 6 },
    uCurveFreq: { value: settings.frequency ?? 0.011 },
    uCurveScroll: { value: 0 },
    uCurveRamp: { value: (settings.rampDistance ?? 35) ** 2 },
    uHillAmp: { value: settings.hillAmplitude ?? 2.2 },
    uHillFreq: { value: settings.hillFrequency ?? 0.016 },
  };

  function patchMaterial(material) {
    if (!material || material.userData.laneCurve) return material;
    material.userData.laneCurve = true;

    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previous?.(shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `${VERTEX_PARS}\nvoid main() {`)
        .replace('#include <project_vertex>', PROJECT_VERTEX)
        .replace('#include <worldpos_vertex>', WORLDPOS_VERTEX);
    };

    // Patched and unpatched variants of the same material must not share a
    // compiled program.
    material.customProgramCacheKey = () => 'laneCurve';
    material.needsUpdate = true;
    return material;
  }

  /**
   * Patches a mesh's materials, and gives shadow casters a depth material with
   * the same displacement -- without it an object is drawn bent but casts its
   * shadow from where it would have been.
   */
  function patchObject(object) {
    object.traverse((child) => {
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
    /** Slides the bend towards the player as the run advances. */
    update(distance) {
      uniforms.uCurveScroll.value = distance;
    },
    setStrength(amplitude, hillAmplitude) {
      uniforms.uCurveAmp.value = amplitude;
      uniforms.uHillAmp.value = hillAmplitude;
    },
  };
}
