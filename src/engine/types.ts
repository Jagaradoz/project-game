/**
 * Shared shapes for the engine.
 *
 * The config types are *derived* from the CONFIG literal rather than declared
 * alongside it, so config.ts stays the single source of truth: add a tunable
 * there and it types itself here.
 */

import type { CONFIG } from '@/engine/config';

export type AppConfig = typeof CONFIG;
export type CameraConfig = AppConfig['camera'];
export type PoseConfig = AppConfig['pose'];
export type LateralConfig = AppConfig['lateral'];
export type JogConfig = AppConfig['jog'];
export type DrawConfig = AppConfig['draw'];
export type GameConfig = AppConfig['game'];

export type CharacterId = keyof GameConfig['characters'];
export type PoseModelName = 'lite' | 'full';
export type ShadowQuality = 'high' | 'medium' | 'low';

/* ---------------------------------------------------------------- pose ---- */

/** One MediaPipe landmark in normalised image space (0..1, y grows downward). */
export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type PoseLandmarks = PoseLandmark[];

export interface Point2D {
  x: number;
  y: number;
}

/** A landmark connection pair, as MediaPipe reports it. */
export interface PoseConnection {
  start: number;
  end: number;
}

/**
 * Body geometry normalised by the subject's own proportions, so thresholds hold
 * regardless of how far they stand from the camera. Null when the required
 * landmarks are not confidently visible.
 */
export interface BodyMeasurement {
  shoulderMid: Point2D;
  hipMid: Point2D;
  shoulderWidth: number;
  torsoLength: number;
  kneesVisible: boolean;
  leftKnee: PoseLandmark | null;
  rightKnee: PoseLandmark | null;
}

/* ----------------------------------------------------------- detectors ---- */

export type LateralLabel = 'LEFT' | 'RIGHT' | 'CENTER';

export interface LateralState {
  label: LateralLabel;
  offset: number;
  smoothedX: number | null;
  baseline: number | null;
  calibrationSamples: number[];
  calibrationStartMs: number | null;
  isCalibrated: boolean;
  hasBody: boolean;
}

export type UpKnee = 'LEFT' | 'RIGHT' | null;

export interface JogState {
  isJogging: boolean;
  cadenceSpm: number;
  kneeDelta: number;
  upKnee: UpKnee;
  peakSinceTransition: number;
  stepTimestamps: number[];
  stepCount: number;
  hasKnees: boolean;
}

/* ---------------------------------------------------------------- game ---- */

/** An enemy or a bullet. `previousZ` is what makes collision a swept test. */
export interface GameBody {
  lane: number;
  z: number;
  previousZ: number;
}

/** Where an enemy died this frame, so the view can play a death animation. */
export interface KillMark {
  lane: number;
  z: number;
}

export interface GameState {
  lane: number;
  hp: number;
  score: number;
  distance: number;
  speed: number;
  enemies: GameBody[];
  bullets: GameBody[];
  isFiring: boolean;
  fireCooldownMs: number;
  elapsedMs: number;
  nextSpawnMs: number;
  invulnUntilMs: number;
  justHit: boolean;
  justKilled: KillMark[];
  isOver: boolean;
  seed: number;
}

/** What the reducer needs from the player each frame. */
export interface GameInput {
  lane: number;
  isFiring: boolean;
}

/**
 * The imperative boundary between the pose stream and the game loop: pose
 * updates and key events push into it, the loop pulls a snapshot out.
 */
export interface InputHandle {
  setPose(label: LateralLabel | null, isJogging: boolean): void;
  clearPose(): void;
  attachKeyboard(target?: EventTarget): () => void;
  detach(): void;
  read(): GameInput;
  reset(): void;
  step(delta: number): void;
}

/* -------------------------------------------------------------- render ---- */

/**
 * The render layer receives the Three namespace as its first argument rather
 * than importing it, which is what keeps every world/actor module mockable in a
 * test without touching the module registry. This types that argument.
 */
export type ThreeModule = typeof import('three');

/**
 * The duck-typed contract every scrolling layer conforms to (lane markers, dust
 * motes, scatter). One recycling routine in the sync layer handles them all.
 */
export interface ScrollLayerItem {
  mesh: import('three').Object3D;
  baseZ: number;
}

export interface ScrollLayer {
  items: ScrollLayerItem[];
  span: number;
  startZ: number;
}

/** Wave settings for the trail's wandering edge, shared by the GLSL and its CPU mirror. */
export interface TrailEdgeSettings {
  meander?: number;
  pinch?: number;
  halfWidth?: number;
  falloff?: number;
}

/**
 * One playable character. The roster in CONFIG.game.characters is heterogeneous
 * -- the fallback orb carries no model path or animations -- so this is the
 * common shape the player loader reads.
 */
export interface CharacterDef {
  id: string;
  name: string;
  path: string | null;
  scale?: number;
  rotationY?: number;
  offsetY?: number;
  hideParts?: readonly string[];
  projectilePart?: string;
  animations?: Record<string, string>;
}

export type CharacterRoster = Record<string, CharacterDef>;
