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

/**
 * Lane boundaries are small clusters of half-buried pebbles rather than painted
 * blocks: still a readable dotted line from the runner's camera, but something
 * a forest path could plausibly have.
 */
const PEBBLE = {
  radius: 0.15,
  flatten: 0.42,
  minCount: 2,
  maxCount: 4,
  spreadX: 0.22,
  spreadZ: 0.5,
  /** Distinct cluster shapes, shared across every slot so the line does not repeat visibly. */
  variants: 8,
};
const MARKER_SEED = 0x7a11;
const MARKER_JITTER_X = 0.08;
const MARKER_SKIP_CHANCE = 0.12;

/**
 * The dirt/grass boundary is broken up per fragment. These bound how far it can
 * move from the nominal lip, in world units, and are spliced into the shader so
 * the lane-safety test reads the same numbers the GPU does.
 */
const EDGE_BIAS = 0.08;
const EDGE_WOBBLE_IN = 0.25;
const EDGE_WOBBLE_OUT = 0.3;
const EDGE_CLUMP = 0.12;
/** Width of the band the fragment shader repaints, inside and outside the lip. */
const EDGE_ZONE_IN = 2.2;
const EDGE_ZONE_OUT = 0.65;

/** Furthest the broken-up grass line can creep inward past the nominal lip. */
export const EDGE_BREAKUP_INSET = EDGE_WOBBLE_IN + EDGE_CLUMP - EDGE_BIAS;

/** Noise lattice period. Wrapping it keeps the hash inputs small as distance grows. */
const NOISE_PERIOD = 256;

/**
 * Replaces the flat dark lip with a trampled edge: the grass line wobbles along
 * the path, pushes tongues into the dirt, and the soil darkens just before it
 * meets the grass. Outside the edge zone the vertex colours are left alone, and
 * the zone fades out where the tint already equals them, so there is no seam.
 */
const EDGE_FRAGMENT_PARS = /* glsl */ `
uniform vec3 uGroundTrail;
uniform vec3 uGroundEdge;
uniform vec3 uGroundVerge;
uniform float uGroundDirtHalf;
uniform float uEdgeScroll;
varying vec3 vGroundPos;

float groundHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

float groundNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  vec2 i0 = mod( i, ${glslFloat(NOISE_PERIOD)} );
  vec2 i1 = mod( i + 1.0, ${glslFloat(NOISE_PERIOD)} );
  return mix(
    mix( groundHash( i0 ), groundHash( vec2( i1.x, i0.y ) ), u.x ),
    mix( groundHash( vec2( i0.x, i1.y ) ), groundHash( i1 ), u.x ),
    u.y
  );
}

vec3 groundTint( vec3 base ) {
  float d = abs( vGroundPos.x );
  float side = vGroundPos.x < 0.0 ? 41.0 : 0.0;
  float along = vGroundPos.z - uEdgeScroll;

  float wobble = groundNoise( vec2( along * 0.45, side ) ) * 0.6
    + groundNoise( vec2( along * 1.7, side + 9.0 ) ) * 0.4;
  float boundary = uGroundDirtHalf + ${glslFloat(EDGE_BIAS)}
    + mix( -${glslFloat(EDGE_WOBBLE_IN)}, ${glslFloat(EDGE_WOBBLE_OUT)}, wobble );
  float clump = groundNoise( vec2( d * 3.2 + side, along * 2.4 ) ) * 2.0 - 1.0;
  float edge = d - boundary + clump * ${glslFloat(EDGE_CLUMP)};

  float grass = smoothstep( -0.03, 0.03, edge );
  float rim = smoothstep( -0.85, 0.0, edge ) * 0.6;
  vec3 tinted = mix( mix( uGroundTrail, uGroundEdge, rim ), uGroundVerge, grass );

  float zone = smoothstep( uGroundDirtHalf - ${glslFloat(EDGE_ZONE_IN)}, uGroundDirtHalf - ${glslFloat(EDGE_ZONE_IN - 0.5)}, d )
    * ( 1.0 - smoothstep( uGroundDirtHalf + ${glslFloat(EDGE_ZONE_OUT - 0.1)}, uGroundDirtHalf + ${glslFloat(EDGE_ZONE_OUT)}, d ) );
  vec3 colour = mix( base, tinted, zone );

  // Broad damp and dry patches, so the trail is not one flat brown.
  float mottle = groundNoise( vec2( vGroundPos.x * 0.32, along * 0.22 ) ) * 0.6
    + groundNoise( vec2( vGroundPos.x * 1.1, along * 0.9 ) ) * 0.4;
  float onDirt = ( 1.0 - grass ) * ( 1.0 - step( uGroundDirtHalf + ${glslFloat(EDGE_ZONE_OUT)}, d ) );
  return colour * mix( 1.0, 0.9 + mottle * 0.18, onDirt );
}
`;

/** GLSL wants a float literal; `2` would be an int and fail to compile in a float expression. */
function glslFloat(value: number): string {
  const rounded = Math.round(value * 1e4) / 1e4;
  return Number.isInteger(rounded) ? `${rounded}.0` : String(rounded);
}

/**
 * Where the dirt nominally ends: past the lanes by `TRAIL_MARGIN`, so the edge
 * has room to wander inward. The single source of truth for this number --
 * the shader's falloff and the scatter's innermost band both read it.
 */
export function trailHalfWidth(config: GameConfig): number {
  return (config.laneCount * config.laneWidth) / 2 + TRAIL_MARGIN;
}

/**
 * One point on the ground cross-section. `hard` bands take a flat colour so the
 * trail edge stays crisp. `mix` blends towards a second band colour, so densely
 * sampled curve points keep the broad gradients of the sparse control points.
 */
interface ProfilePoint {
  x: number;
  y: number;
  key: GroundBandKey;
  hard?: boolean;
  mix?: { key: GroundBandKey; t: number };
}

/** The colour half of a profile point. */
type BandColour = Pick<ProfilePoint, 'key' | 'mix'>;

/**
 * The bank beyond the shoulder, as offsets from the trail lip. Heights pass
 * through these exactly; between them the curve is monotone cubic, so the
 * slope changes smoothly instead of creasing at each point.
 */
const BANK_CONTROLS: { offset: number; y: number; key: GroundBandKey }[] = [
  { offset: 0.65, y: 0.24, key: 'verge' },
  // Near-level shoulder: the path sits in a valley floor before the rise.
  { offset: 4.5, y: 0.36, key: 'grass' },
  { offset: 10, y: 0.55, key: 'grass' },
  { offset: 16, y: 0.75, key: 'grassDeep' },
  { offset: 24, y: 1.0, key: 'meadow' },
  { offset: 40, y: 1.4, key: 'grassDeep' },
  { offset: 75, y: 2.1, key: 'meadow' },
  { offset: 200, y: 3.2, key: 'grassDeep' },
];
/** Curve samples per control span. Enough that flat shading reads as a curve. */
const BANK_SAMPLES = 4;

/**
 * Half a cross-section, from the trail centre outward. Mirrored for -x.
 *
 * Nearly flat, with only a gentle rise far out. Flat ground foreshortens away
 * from the low camera, so the far-forest scatter hides it with far fewer props
 * than a tilted bank would need; the faint rise keeps it from reading as a
 * table top. Fog and the horizon ridges hide where the mesh ends.
 */
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
    ...sampleBank(dirtHalf),
  ];
}

/** Fritsch-Carlson tangents: a cubic through the controls that never overshoots. */
function sampleBank(dirtHalf: number): ProfilePoint[] {
  const xs = BANK_CONTROLS.map((point) => point.offset);
  const ys = BANK_CONTROLS.map((point) => point.y);
  const slopes = xs.slice(1).map((x, index) => (ys[index + 1]! - ys[index]!) / (x - xs[index]!));
  const tangents = xs.map((_, index) => {
    if (index === 0) return slopes[0]!;
    if (index === xs.length - 1) return slopes[slopes.length - 1]!;
    const before = slopes[index - 1]!;
    const after = slopes[index]!;
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after);
  });

  const points: ProfilePoint[] = [];
  for (let span = 0; span < xs.length - 1; span += 1) {
    const width = xs[span + 1]! - xs[span]!;
    for (let step = 1; step <= BANK_SAMPLES; step += 1) {
      const t = step / BANK_SAMPLES;
      const t2 = t * t;
      const t3 = t2 * t;
      const y = (2 * t3 - 3 * t2 + 1) * ys[span]!
        + (t3 - 2 * t2 + t) * width * tangents[span]!
        + (-2 * t3 + 3 * t2) * ys[span + 1]!
        + (t3 - t2) * width * tangents[span + 1]!;
      points.push({
        x: dirtHalf + xs[span]! + width * t,
        y,
        key: BANK_CONTROLS[span]!.key,
        mix: { key: BANK_CONTROLS[span + 1]!.key, t },
      });
    }
  }
  return points;
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
  };
}

function addValley(THREE: ThreeModule, scene: THREE_NS.Scene, dirtHalf: number, palette: Palette) {
  const profile = halfProfile(dirtHalf);
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const bandKeys: [BandColour, BandColour][] = [];

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
      // A band is hard when its OUTER point is. On the mirrored left side the
      // outer point is `a`, not `b`; reading `b` there shifted the flat bands one
      // step out and left a hard colour step on the left bank only.
      const outer = Math.abs(a.x) > Math.abs(b.x) ? a : b;
      bandKeys.push(outer.hard ? [{ key: outer.key }, { key: outer.key }] : [a, b]);
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
  const edgeUniforms = {
    uGroundTrail: { value: new THREE.Color(palette.ground.trail) },
    uGroundEdge: { value: new THREE.Color(palette.ground.trailEdge) },
    uGroundVerge: { value: new THREE.Color(palette.ground.verge) },
    uGroundDirtHalf: { value: dirtHalf },
  };

  // The existing edge controller owns travelled distance. Reuse that uniform
  // for both soil colour and relief so surface detail travels with the props.
  material.onBeforeCompile = (shader) => {
    if (!material.userData.trailEdge) {
      shader.uniforms.uEdgeScroll = { value: 0 };
      shader.vertexShader = `uniform float uEdgeScroll;\n${shader.vertexShader}`;
    }
    Object.assign(shader.uniforms, edgeUniforms);
    shader.vertexShader = `varying vec3 vGroundPos;\n${shader.vertexShader}`
      .replace('#include <uv_vertex>', `
      #include <uv_vertex>
      vMapUv.y -= uEdgeScroll / ${SOIL_TILE_SIZE.toFixed(1)};
      vBumpMapUv.y -= uEdgeScroll / ${SOIL_TILE_SIZE.toFixed(1)};
    `)
      // Undisplaced: the bands are laid out in this space, so the edge test
      // below stays aligned with the vertex colours however the lip wanders.
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundPos = position;');
    shader.fragmentShader = `${EDGE_FRAGMENT_PARS}\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= groundTint( vColor );');
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
    const blend = new THREE.Color();
    const resolve = (target: THREE_NS.Color, { key, mix }: BandColour) => {
      target.set(next.ground[key]);
      if (mix) target.lerp(blend.set(next.ground[mix.key]), mix.t);
    };

    bandKeys.forEach(([colourA, colourB], index) => {
      resolve(near, colourA);
      resolve(far, colourB);

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
    edgeUniforms.uGroundTrail.value.set(next.ground.trail);
    edgeUniforms.uGroundEdge.value.set(next.ground.trailEdge);
    edgeUniforms.uGroundVerge.value.set(next.ground.verge);
  }

  paint(palette);
  return { mesh };
}

/**
 * Lane boundaries as clusters of half-buried pebbles. Same recycling contract as
 * every other scrolling layer, so sync.ts treats it identically.
 */
function addLaneMarkers(
  THREE: ThreeModule,
  scene: THREE_NS.Scene,
  config: GameConfig,
  palette: Palette,
) {
  const rng = createRng(MARKER_SEED);
  const variants = Array.from({ length: PEBBLE.variants }, () => buildPebbleCluster(THREE, rng));
  const material = new THREE.MeshStandardMaterial({
    color: palette.ground.pebble,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });

  const period = config.markerLength + config.markerGap;
  const span = config.markerCount * period;
  const items: { mesh: THREE_NS.Mesh; baseZ: number }[] = [];

  for (let lane = 1; lane < config.laneCount; lane += 1) {
    const laneX = (lane - config.laneCount / 2) * config.laneWidth;

    for (let index = 0; index < config.markerCount; index += 1) {
      // A few missing clusters keep the cadence from looking mechanically tiled.
      if (rng() < MARKER_SKIP_CHANCE) continue;

      const baseZ = config.spawnZ + index * period + range(rng, -period * 0.15, period * 0.15);
      const geometry = variants[Math.floor(rng() * variants.length)]!;
      const mesh = new THREE.Mesh(geometry, material);

      mesh.position.set(laneX + range(rng, -MARKER_JITTER_X, MARKER_JITTER_X), TRAIL_Y, baseZ);
      mesh.rotation.y = rng() < 0.5 ? 0 : Math.PI;
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
  };
}

/**
 * A few flattened low-poly stones merged into one geometry, so a cluster is one
 * draw call. Each stone sits about a third out of the ground; the per-vertex
 * shade lets one material carry light and dark pebbles.
 */
function buildPebbleCluster(THREE: ThreeModule, rng: () => number): THREE_NS.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const count = PEBBLE.minCount + Math.floor(rng() * (PEBBLE.maxCount - PEBBLE.minCount + 1));
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const offset = new THREE.Vector3();
  const size = new THREE.Vector3();

  for (let stone = 0; stone < count; stone += 1) {
    const radius = PEBBLE.radius * range(rng, 0.55, 1.3);
    size.set(radius * range(rng, 1, 1.5), radius * PEBBLE.flatten * range(rng, 0.8, 1.25), radius * range(rng, 0.8, 1.2));
    euler.set(range(rng, -0.2, 0.2), rng() * Math.PI * 2, range(rng, -0.2, 0.2));
    rotation.setFromEuler(euler);
    offset.set(range(rng, -PEBBLE.spreadX, PEBBLE.spreadX), size.y * 0.3, range(rng, -PEBBLE.spreadZ, PEBBLE.spreadZ));
    matrix.compose(offset, rotation, size);

    const source = new THREE.DodecahedronGeometry(1, 0).applyMatrix4(matrix);
    const points = source.getAttribute('position');
    const shade = range(rng, 0.78, 1.08);
    for (let index = 0; index < points.count; index += 1) {
      positions.push(points.getX(index), points.getY(index), points.getZ(index));
      colors.push(shade, shade, shade * 0.97);
    }
    source.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
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
