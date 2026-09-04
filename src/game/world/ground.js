/**
 * Terrain, trail, lane markers and horizon ridges.
 *
 * The ground has a CONSTANT cross-section along z. That is the whole trick: a
 * corridor that never varies front-to-back is impossible to distinguish from an
 * infinite one while it scrolls, so it needs no recycling, no tiling and can
 * never show a seam -- the sense of movement comes entirely from the props and
 * markers travelling past it. It replaces the old stack of box strips, which
 * ended in mid-air about 25 units out and left the visible hard edge.
 */

import { createRng, range } from './rng.js?v=1.10.0';

const GROUND_NEAR_Z = 60;
/** Slices along z. A two-slice strip cannot show the curve; it would just shear. */
const GROUND_Z_SLICES = 74;
const GROUND_FAR_Z = -520;
const TRAIL_Y = 0;

const RIDGE_LAYERS = [
  { z: -300, height: 46, spread: 300, seed: 0x51ed, key: 'near' },
  { z: -400, height: 68, spread: 380, seed: 0x9e37, key: 'mid' },
  { z: -500, height: 92, spread: 460, seed: 0xc2b2, key: 'far' },
];

const MARKER_STONE = { radius: 0.3, height: 0.07, sides: 6 };
const MARKER_SEED = 0x7a11;
const MARKER_JITTER_X = 0.22;
const MARKER_SKIP_CHANCE = 0.22;

/**
 * Half a cross-section, from the trail centre outward. Mirrored for -x.
 *
 * The banks climb steeply on purpose: a shallow profile reads as open meadow
 * with a path across it, and the trail has to feel enclosed by the forest.
 */
function halfProfile(halfWidth) {
  return [
    { x: 0, y: TRAIL_Y, key: 'trail' },
    // A near-vertical lip, not a ramp. The old shallow slope blended dirt into
    // grass over four units, which read as an airbrushed gradient rather than a
    // path with an edge. `hard` bands take a single flat colour so the edge
    // stays crisp; the rest blend, because flat bands that far out turn into
    // visible stripes running alongside the trail.
    { x: halfWidth - 0.35, y: TRAIL_Y, key: 'trail', hard: true },
    { x: halfWidth, y: 0.17, key: 'trailEdge', hard: true },
    { x: halfWidth + 0.65, y: 0.24, key: 'verge', hard: true },
    { x: halfWidth + 3, y: 0.6, key: 'grass' },
    { x: halfWidth + 7, y: 1.2, key: 'grass' },
    { x: halfWidth + 13, y: 2.3, key: 'grassDeep' },
    { x: halfWidth + 22, y: 4.4, key: 'meadow' },
    { x: halfWidth + 40, y: 8.5, key: 'grassDeep' },
    { x: halfWidth + 75, y: 14, key: 'meadow' },
    { x: halfWidth + 200, y: 24, key: 'grassDeep' },
  ];
}

/**
 * Ground height at a given x, from the same profile the mesh is built from.
 * Scatter samples this so props sit on the banks instead of floating at y = 0 --
 * sharing one source means the two can never drift apart.
 */
export function createHeightSampler(config) {
  const halfWidth = (config.laneCount * config.laneWidth) / 2;
  const profile = halfProfile(halfWidth);

  return function heightAt(x) {
    const distance = Math.abs(x);
    for (let index = 1; index < profile.length; index += 1) {
      const inner = profile[index - 1];
      const outer = profile[index];
      if (distance > outer.x) continue;
      const span = outer.x - inner.x;
      const t = span <= 0 ? 0 : (distance - inner.x) / span;
      return inner.y + (outer.y - inner.y) * t;
    }
    return profile[profile.length - 1].y;
  };
}

export function addGround(THREE, scene, config, palette) {
  const halfWidth = (config.laneCount * config.laneWidth) / 2;
  const valley = addValley(THREE, scene, halfWidth, palette);
  const markers = addLaneMarkers(THREE, scene, config, palette);
  const ridges = addRidges(THREE, scene, palette);

  return {
    valley,
    markers,
    ridges,
    applyPalette(next) {
      valley.applyPalette(next);
      markers.applyPalette(next);
      ridges.applyPalette(next);
    },
  };
}

function addValley(THREE, scene, halfWidth, palette) {
  const profile = halfProfile(halfWidth);
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const bandKeys = [];

  // Mirror the half-profile into a full one so the two sides share vertices at x = 0.
  const full = [
    ...profile.slice(1).reverse().map((point) => ({ ...point, x: -point.x })),
    ...profile,
  ];

  const sliceDepth = (GROUND_NEAR_Z - GROUND_FAR_Z) / GROUND_Z_SLICES;

  for (let index = 0; index < full.length - 1; index += 1) {
    const a = full[index];
    const b = full[index + 1];

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
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);

  /**
   * Hard bands get one flat colour so the trail edge stays a real edge. Softer
   * bands further out interpolate, otherwise the bank reads as a set of stripes
   * running parallel to the path.
   */
  function paint(next) {
    const colors = geometry.attributes.color.array;
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
 * Lane boundaries as sunken trail stones. Same recycling contract as every other
 * scrolling layer, so render.js treats it identically.
 */
function addLaneMarkers(THREE, scene, config, palette) {
  const geometry = new THREE.CylinderGeometry(
    MARKER_STONE.radius,
    MARKER_STONE.radius * 0.85,
    MARKER_STONE.height,
    MARKER_STONE.sides,
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
  const items = [];

  for (let lane = 1; lane < config.laneCount; lane += 1) {
    const laneX = (lane - config.laneCount / 2) * config.laneWidth;

    for (let index = 0; index < config.markerCount; index += 1) {
      // Gaps in the run. A stone at every single interval is what made these
      // read as road markings rather than something the trail wore in.
      if (rng() < MARKER_SKIP_CHANCE) continue;

      const baseZ = config.spawnZ + index * period + range(rng, -period * 0.3, period * 0.3);
      const mesh = new THREE.Mesh(geometry, material);
      const scale = range(rng, 0.62, 1.35);

      mesh.position.set(
        laneX + range(rng, -MARKER_JITTER_X, MARKER_JITTER_X),
        TRAIL_Y + (MARKER_STONE.height * scale) / 4,
        baseZ,
      );
      mesh.scale.set(scale, range(rng, 0.7, 1.2), scale * range(rng, 0.8, 1.25));
      mesh.rotation.set(range(rng, -0.12, 0.12), rng() * Math.PI * 2, range(rng, -0.1, 0.1));
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
    applyPalette(next) {
      material.color.set(next.accents.marker);
    },
  };
}

/**
 * Layered horizon silhouettes. Unlit and unfogged on purpose: they are painted
 * at the haze colours directly, which is cheaper and more controllable than
 * pushing real geometry far enough away to fog out to the same values.
 */
function addRidges(THREE, scene, palette) {
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
    applyPalette(next) {
      for (const layer of layers) layer.material.color.set(next.ridge[layer.key]);
    },
  };
}

function buildRidgeGeometry(THREE, { height, spread, seed }) {
  const rng = createRng(seed);
  const steps = 30;
  const baseY = -12;
  const peaks = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = -spread + t * spread * 2;
    const wave = 0.45 + 0.55 * Math.abs(Math.sin(index * 0.83 + seed));
    peaks.push({ x, y: height * wave * range(rng, 0.72, 1.18) });
  }

  // One smoothing pass, otherwise the jitter reads as noise rather than terrain.
  const smoothed = peaks.map((peak, index) => {
    const previous = peaks[Math.max(0, index - 1)];
    const next = peaks[Math.min(peaks.length - 1, index + 1)];
    return { x: peak.x, y: (previous.y + peak.y * 2 + next.y) / 4 };
  });

  const positions = [];
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
