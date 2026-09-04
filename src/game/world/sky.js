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

export function addSky(THREE, scene, palette) {
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
    /** Repaints the gradient in place when a biome changes. */
    applyPalette(next) {
      const repainted = buildGradientColors(THREE, geometry, next.sky);
      geometry.attributes.color.copyArray(repainted);
      geometry.attributes.color.needsUpdate = true;
      scene.background.set(next.sky.haze);
      scene.fog.color.set(next.fog.color);
      scene.fog.near = next.fog.near;
      scene.fog.far = next.fog.far;
    },
  };
}

function buildGradientColors(THREE, geometry, sky) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const stops = STOPS.map((stop) => ({ at: stop.at, color: new THREE.Color(sky[stop.key]) }));
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

function sampleGradient(out, stops, height) {
  for (let index = 1; index < stops.length; index += 1) {
    const lower = stops[index - 1];
    const upper = stops[index];
    if (height > upper.at && index < stops.length - 1) continue;

    const span = upper.at - lower.at;
    const t = span <= 0 ? 0 : Math.min(1, Math.max(0, (height - lower.at) / span));
    return out.copy(lower.color).lerp(upper.color, t);
  }
  return out.copy(stops[0].color);
}
