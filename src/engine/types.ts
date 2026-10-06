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
export type JumpConfig = AppConfig['jump'];
export type DrawConfig = AppConfig['draw'];
export type GameConfig = AppConfig['game'];
export type StageConfig = AppConfig['stage'];
export type DifficultyPreset = StageConfig['difficulty']['normal'];

/**
 * A stage's tuned rules: the game config it runs under, plus the goal that
 * turns an endless run into a stage that can be passed. `updateGame` already
 * takes a GameConfig, so carrying `goalKills` on the same object is what lets
 * the reducer decide `isCleared` without learning about stages at all.
 */
export type StageRules = GameConfig & { goalKills: number; requireBoss?: boolean };

/**
 * What the reducer runs under. `goalKills` is optional on purpose: without it
 * the runner is endless, which is both the original behaviour and what the
 * control-group mode needs. StageRules satisfies it with the goal filled in.
 */
export type RunConfig = GameConfig & { goalKills?: number; requireBoss?: boolean };

/**
 * Starting difficulty, chosen by the player -- TOR 3
 * (ผู้เล่นสามารถเลือกระดับความยากเริ่มต้นได้ตามตัวเลือกที่ระบบกำหนด).
 *
 * Declared here rather than in src/types/api.ts because it is a gameplay
 * concept first; the API contract imports it, not the other way round.
 */
export type Difficulty = 'easy' | 'normal' | 'hard';

/**
 * What one finished run reports. Deliberately NOT SubmitRunInput: the engine
 * knows nothing about the API contract, and src/types/api.ts already imports
 * from here. The React layer adds the idempotency key and submits it.
 */
export interface RunSummary {
  biomeId: string;
  stageNumber: number;
  difficulty: Difficulty;
  score: number;
  enemiesKilled: number;
  durationMs: number;
  distanceM: number;
  movementCount: number;
  isCleared: boolean;
}

/** Which stage a run is playing. Set by /stages, read by the runtime. */
export interface StageSelection {
  biomeId: string;
  stageNumber: number;
  difficulty: Difficulty;
}

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
export type EnemyKind = 'weak' | 'normal' | 'tank' | 'boss';

export interface JumpState {
  isCalibrated: boolean;
  feetVisible: boolean;
  justJumped: boolean;
  jumpCount: number;
  airborne: boolean;
  baseline: { hip: number; left: number; right: number; torso: number } | null;
  calibrationStartMs: number | null;
  candidateMs: number | null;
  landedMs: number | null;
  lastSeenMs: number | null;
  needsLanding: boolean;
}

export interface RootObstacle { id: number; side: -1 | 1; z: number; previousZ: number; cleared?: boolean }

/** An enemy or a bullet. `previousZ` is what makes collision a swept test. */
export interface GameBody {
  id?: number;
  kind?: EnemyKind;
  hp?: number;
  lastHitMs?: number;
  lane: number;
  z: number;
  previousZ: number;
}

/** Where an enemy died this frame, so the view can play a death animation. */
export interface KillMark {
  kind?: EnemyKind;
  lane: number;
  z: number;
}

export interface GameState {
  nextId: number;
  obstacles: RootObstacle[];
  nextObstacleMs: number;
  jumpStartedMs: number | null;
  jumpHeight: number;
  jumpHeld: boolean;
  jumpCount: number;
  hitAtMs: number;
  justImpacts: KillMark[];
  bossSpawned: boolean;
  bossDefeated: boolean;
  bossWarningLane: number | null;
  bossAttackAtMs: number | null;
  nextBossAttackMs: number;
  justBossAttack: boolean;
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
  justFired: boolean;
  justKilled: KillMark[];
  /** Enemies killed this run. Distinct from `score`, which stages may weight. */
  killCount: number;
  /** The stage goal was met. Always false when the run has no goal. */
  isCleared: boolean;
  isOver: boolean;
  seed: number;
}

/** What the reducer needs from the player each frame. */
export interface GameInput {
  jump?: boolean;
  lane: number;
  isFiring: boolean;
}

/**
 * The imperative boundary between the pose stream and the game loop: pose
 * updates and key events push into it, the loop pulls a snapshot out.
 */
export interface InputHandle {
  requestJump(): void;
  setPose(label: LateralLabel | null, isJogging: boolean): void;
  clearPose(): void;
  attachKeyboard(target?: EventTarget): () => void;
  detach(): void;
  read(): GameInput;
  reset(): void;
  step(delta: number): void;
  setDevFire(active: boolean): void;
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
