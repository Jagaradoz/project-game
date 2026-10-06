import type * as T from 'three';
import type { GameConfig, ThreeModule, TrailHazard } from '@/engine/types';

/** A bounded uniform array cuts the moving channels out of the existing terrain. */
export function createRiverMask(_THREE: ThreeModule, mesh: T.Mesh, config: GameConfig) {
  const centres = new Float32Array(config.obstacle.poolSize).fill(10000);
  const material = mesh.material as T.Material;
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  const uniforms = {
    uRiverCentres: { value: centres },
    uRiverHalfDepth: { value: config.obstacle.riverRadius },
  };
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    const positionShader = shader.vertexShader.includes('vec4 lrWorld =')
      ? shader.vertexShader.replace('gl_Position = projectionMatrix * mvPosition;',
        'vRiverPosition = lrWorld.xyz;\ngl_Position = projectionMatrix * mvPosition;')
      : shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nvRiverPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.vertexShader = `varying vec3 vRiverPosition;\n${positionShader}`;
    shader.fragmentShader = `
      varying vec3 vRiverPosition;
      uniform float uRiverCentres[${config.obstacle.poolSize}];
      uniform float uRiverHalfDepth;
      ${shader.fragmentShader}`.replace('#include <clipping_planes_fragment>', `
      #include <clipping_planes_fragment>
      for (int river = 0; river < ${config.obstacle.poolSize}; river++) {
        if (abs(vRiverPosition.z - uRiverCentres[river]) < uRiverHalfDepth) discard;
      }
    `);
  };
  material.customProgramCacheKey = () => `${previousKey()}:rivers-${config.obstacle.poolSize}`;
  material.needsUpdate = true;
  return {
    sync(hazards: TrailHazard[]) {
      centres.fill(10000);
      hazards.filter(h => h.kind === 'river').forEach((h, i) => { if (i < centres.length) centres[i] = h.z; });
    },
    hide() { centres.fill(10000); },
    uniforms,
  };
}
