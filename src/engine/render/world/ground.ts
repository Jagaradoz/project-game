/**
 * Terrain, trail, lane markers and horizon ridges.
 *
 * The ground has a CONSTANT cross-section along z. That is the whole trick: a
 * corridor that never varies front-to-back is impossible to distinguish from an
 * infinite one while it scrolls, so the mesh needs no recycling and can
 * never show a seam. Repeating soil detail scrolls with the props and
 * markers. It replaces the old stack of box strips, which
 * ended in mid-air about 25 units out and left the visible hard edge.
 *
 * The wander in the trail's edge is not in this geometry: it is a vertex-shader
 * displacement applied on top, from trailEdge.js.
 */

import type * as THREE_NS from 'three';

import type { Palette } from '@/engine/render/world/palette';
import type { GameConfig, ThreeModule } from '@/engine/types';

/** Colour band names on a palette's `ground` table. */
type GroundBandKey = keyof Palette['ground'];
type RidgeLayerKey = keyof Palette['ridge'];

import { createRng, range } from '@/engine/render/world/rng';

const GROUND_NEAR_Z = 60;
/**
 * Slices along z. The edge displacement varies with z, so a coarse strip turns
 * a wandering edge into a zigzag -- this is the resolution of that wander.
 */
const GROUND_Z_SLICES = 120;
const GROUND_FAR_Z = -520;
const TRAIL_Y = 0;
const SOIL_TILE_SIZE = 12;

/** Low-contrast printed grain, generated once without a canvas or network request. */
function createSoilTexture(THREE: ThreeModule): THREE_NS.DataTexture {
  const size = 256;
  const rng = createRng(0x5011);
  const layers = [8, 24].map((cells) => ({
    cells,
    values: Float32Array.from({ length: cells * cells }, () => rng()),
  }));
  const sample = (layer: typeof layers[number], x: number, y: number) => {
    const u = x / size * layer.cells;
    const v = y / size * layer.cells;
    const ix = Math.floor(u);
    const iy = Math.floor(v);
    const fx = u - ix;
    const fy = v - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const at = (a: number, b: number) => layer.values[(b % layer.cells) * layer.cells + a % layer.cells]!;
    const near = at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx;
    const far = at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx;
    return near * (1 - sy) + far * sy;
  };
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = Math.round(226 + sample(layers[0]!, x, y) * 15
        + sample(layers[1]!, x, y) * 5);
      const offset = (y * size + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * How far the dirt reaches beyond the outermost lane. This margin is what lets
 * the edge wander without ever putting a lane on grass: it has to exceed the
 * displacement's worst-case pinch (see `trailEdgeReach`).
 */
const TRAIL_MARGIN = 1.3;

const RIDGE_LAYERS: { z: number; height: number; spread: number; seed: number; key: RidgeLayerKey }[] = [
  { z: -300, height: 46, spread: 300, seed: 0x51ed, key: 'near' },
  { z: -400, height: 68, spread: 380, seed: 0x9e37, key: 'mid' },
  { z: -500, height: 92, spread: 460, seed: 0xc2b2, key: 'far' },
];

const MARKER_BLOCK = { width: 0.55, height: 0.06, length: 0.8 };
const MARKER_SEED = 0x7a11;
const MARKER_JITTER_X = 0.06;
const MARKER_SKIP_CHANCE = 0.08;

/**
 * Where the dirt nominally ends: past the lanes by `TRAIL_MARGIN`, so the edge
 * has room to wander inward. The single source of truth for this number --
 * the shader's falloff and the scatter's innermost band both read it.
 */
export function trailHalfWidth(config: GameConfig): number {
  return (config.laneCount * config.laneWidth) / 2 + TRAIL_MARGIN;
}

/**
 * Half a cross-section, from the trail centre outward. Mirrored for -x.
 *
 * The banks climb steeply on purpose: a shallow profile reads as open meadow
 * with a path across it, and the trail has to feel enclosed by the forest.
 */
/** One point on the ground cross-section. `hard` bands take a flat colour so the trail edge stays crisp. */
interface ProfilePoint {
  x: number;
  y: number;
  key: GroundBandKey;
  hard?: boolean;
}

function halfProfile(dirtHalf: number): ProfilePoint[] {
  return [
    { x: 0, y: TRAIL_Y, key: 'trail' },
    // A near-vertical lip, not a ramp. A shallow slope blends dirt into grass
    // over several units, which reads as an airbrushed gradient rather than a
    // path with an edge. `hard` bands take a single flat colour so the edge
    // stays crisp; the rest blend, because flat bands that far out turn into
    // visible stripes running alongside the trail.
    { x: dirtHalf - 0.35, y: TRAIL_Y, key: 'trail', hard: true },
    { x: dirtHalf, y: 0.17, key: 'trailEdge', hard: true },
    { x: dirtHalf + 0.65, y: 0.24, key: 'verge', hard: true },
    { x: dirtHalf + 3, y: 0.6, key: 'grass' },
    { x: dirtHalf + 7, y: 1.2, key: 'grass' },
    { x: dirtHalf + 13, y: 2.3, key: 'grassDeep' },
    { x: dirtHalf + 22, y: 4.4, key: 'meadow' },
    { x: dirtHalf + 40, y: 8.5, key: 'grassDeep' },
    { x: dirtHalf + 75, y: 14, key: 'meadow' },
    { x: dirtHalf + 200, y: 24, key: 'grassDeep' },
  ];
}

/**
 * Ground height at a given x, from the same profile the mesh is built from.
 * Scatter samples this so props sit on the banks instead of floating at y = 0 --
 * sharing one source means the two can never drift apart.
 */
export function createHeightSampler(config: GameConfig): (x: number) => number {
  const profile = halfProfile(trailHalfWidth(config));

  return function heightAt(x: number): number {
    const distance = Math.abs(x);
    for (let index = 1; index < profile.length; index += 1) {
      const inner = profile[index - 1]!;
      const outer = profile[index]!;
      if (distance > outer.x) continue;
      const span = outer.x - inner.x;
      const t = span <= 0 ? 0 : (distance - inner.x) / span;
      return inner.y + (outer.y - inner.y) * t;
    }
    return profile[profile.length - 1]!.y;
  };
}

export function addGround(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
) {
  const valley = addValley(THREE, scene, trailHalfWidth(config), palette);
  const markers = addLaneMarkers(THREE, scene, config, palette);
  const ridges = addRidges(THREE, scene, palette);

  return {
    valley,
    markers,
    ridges,
    applyPalette(next: Palette) {
      valley.applyPalette(next);
      markers.applyPalette(next);
      ridges.applyPalette(next);
    },
  };
}

function addValley(THREE: ThreeModule, scene: THREE_NS.Scene, dirtHalf: number, palette: Palette) {
  const profile = halfProfile(dirtHalf);
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const bandKeys: [GroundBandKey, GroundBandKey, boolean][] = [];

  // Mirror the half-profile into a full one so the two sides share vertices at x = 0.
  const full = [
    ...profile.slice(1).reverse().map((point) => ({ ...point, x: -point.x })),
    ...profile,
  ];

  const sliceDepth = (GROUND_NEAR_Z - GROUND_FAR_Z) / GROUND_Z_SLICES;

  for (let index = 0; index < full.length - 1; index += 1) {
    const a = full[index]!;
    const b = full[index + 1]!;

    for (let slice = 0; slice < GROUND_Z_SLICES; slice += 1) {
      const nearZ = GROUND_NEAR_Z - slice * sliceDepth;
      const farZ = nearZ - sliceDepth;
      positions.push(
        a.x, a.y, nearZ, b.x, b.y, nearZ, b.x, b.y, farZ,
        a.x, a.y, nearZ, b.x, b.y, farZ, a.x, a.y, farZ,
      );
      bandKeys.push([a.key, b.key, Boolean(b.hard)]);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uvs: number[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    uvs.push(positions[index]! / SOIL_TILE_SIZE, positions[index + 2]! / SOIL_TILE_SIZE);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.computeVertexNormals();

  const soilTexture = createSoilTexture(THREE);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: soilTexture,
    bumpMap: soilTexture,
    bumpScale: 0.018,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  // The existing edge controller owns travelled distance. Reuse that uniform
  // for both soil colour and relief so surface detail travels with the props.
  material.onBeforeCompile = (shader) => {
    if (!material.userData.trailEdge) {
      shader.uniforms.uEdgeScroll = { value: 0 };
      shader.vertexShader = `uniform float uEdgeScroll;\n${shader.vertexShader}`;
    }
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `
      #include <uv_vertex>
      vMapUv.y -= uEdgeScroll / ${SOIL_TILE_SIZE.toFixed(1)};
      vBumpMapUv.y -= uEdgeScroll / ${SOIL_TILE_SIZE.toFixed(1)};
    `);
  };
  material.customProgramCacheKey = () => 'soil-detail';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);

  /**
   * Hard bands get one flat colour so the trail edge stays a real edge. Softer
   * bands further out interpolate, otherwise the bank reads as a set of stripes
   * running parallel to the path.
   */
  function paint(next: Palette) {
    const colors = (geometry.attributes.color as THREE_NS.BufferAttribute).array as Float32Array;
    const near = new THREE.Color();
    const far = new THREE.Color();

    bandKeys.forEach(([keyA, keyB, isHard], index) => {
      far.set(next.ground[keyB]);
      near.copy(isHard ? far : new THREE.Color(next.ground[keyA]));

      // Vertex order per band: a, b, b, a, b, a.
      const order = [near, far, far, near, far, near];
      order.forEach((color, corner) => {
        const offset = (index * 6 + corner) * 3;
        colors[offset] = color.r;
        colors[offset + 1] = color.g;
        colors[offset + 2] = color.b;
      });
    });

    geometry.attributes.color.needsUpdate = true;
  }

  paint(palette);
  return { mesh, applyPalette: paint };
}

/**
 * Lane boundaries as bold printed blocks. Same recycling contract as every other
 * scrolling layer, so render.js treats it identically.
 */
function addLaneMarkers(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
) {
  const geometry = new THREE.BoxGeometry(
    MARKER_BLOCK.width,
    MARKER_BLOCK.height,
    MARKER_BLOCK.length,
  );
  const material = new THREE.MeshStandardMaterial({
    color: palette.accents.marker,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });

  const period = config.markerLength + config.markerGap;
  const span = config.markerCount * period;
  const rng = createRng(MARKER_SEED);
  const items: { mesh: THREE_NS.Mesh; baseZ: number }[] = [];

  for (let lane = 1; lane < config.laneCount; lane += 1) {
    const laneX = (lane - config.laneCount / 2) * config.laneWidth;

    for (let index = 0; index < config.markerCount; index += 1) {
      // A few missing blocks keep the cadence from looking mechanically tiled.
      if (rng() < MARKER_SKIP_CHANCE) continue;

      const baseZ = config.spawnZ + index * period + range(rng, -period * 0.08, period * 0.08);
      const mesh = new THREE.Mesh(geometry, material);
      const scale = range(rng, 0.88, 1.12);

      mesh.position.set(
        laneX + range(rng, -MARKER_JITTER_X, MARKER_JITTER_X),
        TRAIL_Y + (MARKER_BLOCK.height * scale) / 2,
        baseZ,
      );
      mesh.scale.set(scale, 1, scale);
      mesh.receiveShadow = true;
      scene.add(mesh);
      items.push({ mesh, baseZ });
    }
  }

  return {
    items,
    period,
    span,
    startZ: config.spawnZ,
    applyPalette(next: Palette) {
      material.color.set(next.accents.marker);
    },
  };
}

/**
 * Layered horizon silhouettes. Unlit and unfogged on purpose: they are painted
 * at the haze colours directly, which is cheaper and more controllable than
 * pushing real geometry far enough away to fog out to the same values.
 */
function addRidges(THREE: ThreeModule, scene: THREE_NS.Scene, palette: Palette) {
  const layers = RIDGE_LAYERS.map((layer) => {
    const geometry = buildRidgeGeometry(THREE, layer);
    const material = new THREE.MeshBasicMaterial({
      color: palette.ridge[layer.key],
      fog: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = layer.z;
    scene.add(mesh);
    return { mesh, material, key: layer.key };
  });

  return {
    layers,
    applyPalette(next: Palette) {
      for (const layer of layers) layer.material.color.set(next.ridge[layer.key]);
    },
  };
}

function buildRidgeGeometry(
  THREE: ThreeModule,
  { height, spread, seed }: { height: number; spread: number; seed: number },
): THREE_NS.BufferGeometry {
  const rng = createRng(seed);
  const steps = 30;
  const baseY = -12;
  const peaks: { x: number; y: number }[] = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = -spread + t * spread * 2;
    const wave = 0.45 + 0.55 * Math.abs(Math.sin(index * 0.83 + seed));
    peaks.push({ x, y: height * wave * range(rng, 0.72, 1.18) });
  }

  // One smoothing pass, otherwise the jitter reads as noise rather than terrain.
  const smoothed = peaks.map((peak, index) => {
    const previous = peaks[Math.max(0, index - 1)]!;
    const next = peaks[Math.min(peaks.length - 1, index + 1)]!;
    return { x: peak.x, y: (previous.y + peak.y * 2 + next.y) / 4 };
  });

  const positions: number[] = [];
  for (let index = 0; index < smoothed.length - 1; index += 1) {
    const a = smoothed[index];
    const b = smoothed[index + 1];
    positions.push(
      a.x, baseY, 0, b.x, baseY, 0, b.x, b.y, 0,
      a.x, baseY, 0, b.x, b.y, 0, a.x, a.y, 0,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export { TRAIL_Y };
