/**
 * "+1", "+2" labels that pop up around the character as each score orb lands,
 * float upwards and fade -- in the world, not on the HUD, so the reward shows
 * where the eye already is.
 *
 * Each label is a Sprite, so it always faces the camera. Sprites come from a
 * small pool claimed round-robin, like effects.ts; each keeps its own material
 * because opacity fades per label. The "+N" textures are drawn once per value
 * and colour on a canvas and shared: a chunky cartoon face (Luckiest Guy, loaded
 * by app/layout.tsx), filled with a white-to-neon gradient in the orb's colour,
 * a thick dark outline and a glow. Without a DOM (headless tests) the texture is
 * left blank, so the animation still runs.
 */

import type * as THREE_NS from 'three';

import type { ThreeModule } from '@/engine/types';

const POOL_SIZE = 24;
const LIFE_SEC = 0.9;
/** How far a label climbs over its life. */
const RISE = 1.4;
/** Scatter around the landing point, so a stream of pickups doesn't stack. */
const SPREAD_X = 1.6;
const SPREAD_Y = 0.8;
/** Nudged towards the camera, so the character never hides a label. */
const TOWARDS_CAMERA = 0.6;
/** World height of a label; the width follows the text's aspect. */
const HEIGHT = 0.7;
const POP_SEC = 0.12;
const POP_OVERSHOOT = 1.35;
/** The last share of a label's life is spent fading out. */
const FADE_SHARE = 0.45;
/** Labels draw over the scene, after everything else. */
const RENDER_ORDER = 1000;

const TEXTURE_HEIGHT = 96;
const FONT_SIZE = TEXTURE_HEIGHT * 0.66;
/** Set by next/font in app/layout.tsx; the fallback keeps labels legible without it. */
const FONT_VARIABLE = '--font-score-popup';
const FALLBACK_FAMILY = '"Arial Black", system-ui, sans-serif';
const OUTLINE = TEXTURE_HEIGHT * 0.13;
const OUTLINE_COLOR = '#2a0d3d';
/** Room around the text for the outline and the glow. */
const PADDING = TEXTURE_HEIGHT * 0.22;
const GLOW_BLUR = TEXTURE_HEIGHT * 0.18;

interface Popup {
  sprite: THREE_NS.Sprite;
  material: THREE_NS.SpriteMaterial;
  life: number;
  /** Read every frame: a repaint once the font arrives can change the width. */
  label: Label | null;
  baseY: number;
}

export interface ScorePopupRefs {
  group: THREE_NS.Group;
  spawn(value: number, at: { x: number; y: number; z: number }, color: THREE_NS.ColorRepresentation, seed: number): void;
  update(dtSec: number): void;
  hide(): void;
  /** Sprites are not meshes, so the scene's own teardown misses them. */
  dispose(): void;
  readonly liveCount: number;
}

interface Label {
  texture: THREE_NS.Texture;
  aspect: number;
  canvas: HTMLCanvasElement | null;
  text: string;
  color: string;
}

function fontFamily(): string {
  const family = getComputedStyle(document.documentElement).getPropertyValue(FONT_VARIABLE).trim();
  return family ? `${family}, ${FALLBACK_FAMILY}` : FALLBACK_FAMILY;
}

/** Paints `label.text` onto its canvas: neon gradient fill, dark outline, coloured glow. */
function paint(label: Label): void {
  const canvas = label.canvas;
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;

  const font = `${FONT_SIZE}px ${fontFamily()}`;
  context.font = font;
  const width = Math.ceil(context.measureText(label.text).width + PADDING * 2);
  canvas.width = width;
  canvas.height = TEXTURE_HEIGHT;
  // Resizing a canvas resets its state.
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  const x = width / 2;
  const y = TEXTURE_HEIGHT / 2;

  context.shadowColor = label.color;
  context.shadowBlur = GLOW_BLUR;
  context.lineWidth = OUTLINE;
  context.strokeStyle = OUTLINE_COLOR;
  context.strokeText(label.text, x, y);
  context.shadowBlur = 0;

  const gradient = context.createLinearGradient(0, y - FONT_SIZE / 2, 0, y + FONT_SIZE / 2);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.45, label.color);
  gradient.addColorStop(1, label.color);
  context.fillStyle = gradient;
  context.fillText(label.text, x, y);

  label.aspect = width / TEXTURE_HEIGHT;
  label.texture.needsUpdate = true;
}

function drawLabel(THREE: ThreeModule, text: string, color: string): Label {
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
  const texture = canvas ? new THREE.CanvasTexture(canvas) : new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  const label: Label = { texture, aspect: 1, canvas, text, color };
  paint(label);
  return label;
}

export function createScorePopups(THREE: ThreeModule, scene: THREE_NS.Scene): ScorePopupRefs {
  const group = new THREE.Group();
  scene.add(group);
  const labels = new Map<string, Label>();
  const tint = new THREE.Color();

  // Nothing on the page uses the label face, so the browser has not fetched it
  // yet: ask for it, and repaint whatever was drawn with the fallback meanwhile.
  if (typeof document !== 'undefined' && document.fonts) {
    document.fonts.load(`${FONT_SIZE}px ${fontFamily()}`, '+0123456789')
      .then(() => labels.forEach(paint))
      .catch((error: unknown) => console.warn('[scorePopups] label font failed to load; using the fallback', error));
  }

  const popups: Popup[] = Array.from({ length: POOL_SIZE }, () => {
    const material = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    sprite.renderOrder = RENDER_ORDER;
    group.add(sprite);
    return { sprite, material, life: 0, label: null, baseY: 0 };
  });
  let next = 0;
  let liveCount = 0;

  function labelFor(value: number, color: THREE_NS.ColorRepresentation): Label {
    const hex = `#${tint.set(color).getHexString()}`;
    const key = `${value}${hex}`;
    let label = labels.get(key);
    if (!label) {
      label = drawLabel(THREE, `+${value}`, hex);
      labels.set(key, label);
    }
    return label;
  }

  function retire(popup: Popup): void {
    popup.life = 0;
    popup.sprite.visible = false;
    liveCount -= 1;
  }

  return {
    group,

    spawn(value, at, color, seed) {
      if (value <= 0) return;
      const popup = popups[next]!;
      next = (next + 1) % POOL_SIZE;
      if (popup.life <= 0) liveCount += 1;

      const label = labelFor(value, color);
      popup.material.map = label.texture;
      popup.material.opacity = 1;
      popup.material.needsUpdate = true;
      popup.label = label;
      popup.life = LIFE_SEC;

      // Knuth's hash of the orb id: a stable, scattered spot on either side.
      const hash = Math.imul(seed, 2654435761) >>> 0;
      const offsetX = ((hash % 1000) / 1000 - 0.5) * SPREAD_X * 2;
      const offsetY = (((hash >>> 10) % 1000) / 1000) * SPREAD_Y;
      popup.baseY = at.y + offsetY;
      popup.sprite.position.set(at.x + offsetX, popup.baseY, at.z + TOWARDS_CAMERA);
      popup.sprite.scale.set(0, 0, 1);
      popup.sprite.visible = true;
    },

    update(dtSec) {
      if (liveCount === 0) return;
      for (const popup of popups) {
        if (popup.life <= 0) continue;
        popup.life -= dtSec;
        if (popup.life <= 0) {
          retire(popup);
          continue;
        }
        const age = LIFE_SEC - popup.life;
        const progress = age / LIFE_SEC;
        // Overshoot then settle: grows past full size, eases back.
        const pop = age < POP_SEC
          ? (age / POP_SEC) * POP_OVERSHOOT
          : 1 + (POP_OVERSHOOT - 1) * Math.exp(-(age - POP_SEC) * 18);
        const size = HEIGHT * pop;
        popup.sprite.scale.set(size * (popup.label?.aspect ?? 1), size, 1);
        popup.sprite.position.y = popup.baseY + RISE * (1 - (1 - progress) ** 2);
        popup.material.opacity = Math.min(1, (1 - progress) / FADE_SHARE);
      }
    },

    hide() {
      for (const popup of popups) if (popup.life > 0) retire(popup);
    },

    dispose() {
      for (const popup of popups) popup.material.dispose();
      for (const label of labels.values()) label.texture.dispose();
      labels.clear();
    },

    get liveCount() {
      return liveCount;
    },
  };
}
