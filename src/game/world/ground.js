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

import { createRng, range } from './rng.js?v=1.9.0';

const GROUND_NEAR_Z = 60;
const GROUND_FAR_Z = -520;
const TRAIL_Y = 0;

const RIDGE_LAYERS = [
  { z: -300, height: 46, spread: 300, seed: 0x51ed, key: 'near' },
  { z: -400, height: 68, spread: 380, seed: 0x9e37, key: 'mid' },
  { z: -500, height: 92, spread: 460, seed: 0xc2b2, key: 'far' },
];

const MARKER_STONE = { radius: 0.3, height: 0.07, sides: 6 };

/**
 * Half a cross-section, from the trail centre outward. Mirrored for -x.
 *
 * The banks climb steeply on purpose: a shallow profile reads as open meadow
 * with a path across it, and the trail has to feel enclosed by the forest.
 */
function halfProfile(halfWidth) {
  return [
    { x: 0, y: TRAIL_Y, key: 'trail' },
    { x: halfWidth, y: TRAIL_Y, key: 'trail' },
    { x: halfWidth + 0.45, y: 0.08, key: 'trailEdge' },
    { x: halfWidth + 1.4, y: 0.36, key: 'verge' },
    { x: halfWidth + 4, y: 0.72, key: 'grass' },
    { x: halfWidth + 9, y: 1.5, key: 'grass' },
    { x: halfWidth + 16, y: 3.2, key: 'grassDeep' },
    { x: halfWidth + 28, y: 6.4, key: 'meadow' },
    { x: halfWidth + 48, y: 11, key: 'grassDeep' },
    { x: halfWidth + 90, y: 17, key: 'meadow' },
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

  for (let index = 0; index < full.length - 1; index += 1) {
    const a = full[index];
    const b = full[index + 1];
    positions.push(
      a.x, a.y, GROUND_NEAR_Z, b.x, b.y, GROUND_NEAR_Z, b.x, b.y, GROUND_FAR_Z,
      a.x, a.y, GROUND_NEAR_Z, b.x, b.y, GROUND_FAR_Z, a.x, a.y, GROUND_FAR_Z,
    );
    bandKeys.push([a.key, b.key]);
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

  function paint(next) {
    const colors = geometry.attributes.color.array;
    const near = new THREE.Color();
    const far = new THREE.Color();

    bandKeys.forEach(([keyA, keyB], band) => {
      near.set(next.ground[keyA]);
      far.set(next.ground[keyB]);
      // Vertex order per band: a, b, b, a, b, a.
      const order = [near, far, far, near, far, near];
      order.forEach((color, corner) => {
        const offset = (band * 6 + corner) * 3;
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
  const items = [];

  for (let lane = 1; lane < config.laneCount; lane += 1) {
    const x = (lane - config.laneCount / 2) * config.laneWidth;
    for (let index = 0; index < config.markerCount; index += 1) {
      const baseZ = config.spawnZ + index * period;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, TRAIL_Y + MARKER_STONE.height / 4, baseZ);
      // Each stone turned differently so a row of them does not read as a
      // painted road marking.
      mesh.rotation.y = index * 1.11 + lane;
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
