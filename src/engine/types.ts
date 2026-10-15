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
export type ArmsUpConfig = AppConfig['armsUp'];
export type HandsOnHipsConfig = AppConfig['handsOnHips'];
export type TrialConfig = AppConfig['trial'];
export type DrawConfig = AppConfig['draw'];
export type GameConfig = AppConfig['game'];

/**
 * What the reducer runs under. `goalKills` is optional on purpose: without it
 * the runner is endless, which is what Training plays. With it (and
 * `requireBoss`), the reducer can still end a run as cleared.
 */
export type RunConfig = GameConfig & { goalKills?: number; requireBoss?: boolean };

/**
 * What one finished run reports. The React layer holds the latest one in memory
 * for /result and keeps nothing else.
 */
export interface RunSummary {
  biomeId: string;
  stageNumber: number;
  score: number;
  enemiesKilled: number;
  durationMs: number;
  distanceM: number;
  movementCount: number;
  isCleared: boolean;
  stepCount: number;
  movementMs: number;
  goalReached: boolean;
  metrics?: import('@/engine/core/metrics').MetricsSnapshot;
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
  /** Furthest offset (shoulder-widths, unsigned) of the first step out to each side; null until learned. */
  reach: { left: number | null; right: number | null };
  /** Furthest offset reached so far in the current LEFT/RIGHT excursion. */
  excursionPeak: number;
  /** Last measured shoulder width (normalised), held while the body is lost so the lane guide can stay up. */
  shoulderWidth: number | null;
}

export interface LaneThreshold { enter: number; exit: number }

/**
 * Where the lane boundaries sit in the camera frame, for the overlay. All x/y are
 * normalised RAW landmark coordinates (the canvas carries the CSS mirror).
 */
export interface LaneGuide {
  /** Calibrated centre; null while calibrating or before a shoulder width is known. */
  baselineX: number | null;
  /** x where the label commits to each side (enter) and where it releases back (exit). */
  lanes: { left: { enterX: number; exitX: number }; right: { enterX: number; exitX: number } } | null;
  label: LateralLabel;
  isTracking: boolean;
  /** The measured lateral centre, drawn from shoulder to hip height; null when the body is lost. */
  marker: { x: number; topY: number; bottomY: number } | null;
  /** 0..1 through centre calibration; 1 once calibrated. */
  calibrationProgress: number;
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

export interface ArmsUpState {
  /** True for the single frame the raise is confirmed. */
  justRaised: boolean;
  raiseCount: number;
  isRaised: boolean;
  /** Must lower both arms before the next raise counts. */
  needsLower: boolean;
  candidateMs: number | null;
  loweredMs: number | null;
  hasArms: boolean;
}

export interface ClapState {
  justClapped: boolean;
  clapCount: number;
  armed: boolean;
  candidateMs: number | null;
  separatedMs: number | null;
  hasHands: boolean;
}

export interface HandsOnHipsState {
  isActive: boolean;
  holdCount: number;
  candidateMs: number | null;
  releaseMs: number | null;
  /** Hips seen before the hands covered them, reused for `occlusionHoldMs`. */
  lastHips: { left: Point2D; right: Point2D; atMs: number } | null;
  hasArms: boolean;
}

interface HazardBody {
  id: number;
  z: number;
  previousZ: number;
  status: 'approaching' | 'crossing' | 'cleared';
  /** A solid hazard can charge contact only once, including during grace. */
  hit?: boolean;
  /** When the hazard's centre passed the player; the verdict waits `jump.leniency.takeoffGraceMs` past it. */
  centredMs?: number;
  /** When a river's far bank passed the player; rivers must be jumped clear of it. */
  farBankMs?: number;
  /** The player jumped (or stood clear of its lanes) at some point in the crossing window. */
  covered?: boolean;
}
export type TrailHazard = HazardBody & (
  | { kind: 'log' | 'stones'; startLane: 0 | 1; laneCount: 2 }
  | { kind: 'log' | 'stones' | 'river'; startLane: 0; laneCount: 3 }
);
export type DeathReason = 'damage' | 'drowned' | 'poisoned';

/**
 * A poison spore cloud spanning every lane. `z` is the front edge (nearest the
 * player); the cloud trails `length` units behind it.
 */
export interface SporeCloud {
  id: number;
  z: number;
  length: number;
  status: 'approaching' | 'inside' | 'cleared';
}

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

/** A kill's points lying on the trail, waiting for the player's lane; see core/orbs.ts. */
export interface ScoreOrb {
  id: number;
  lane: number;
  z: number;
  previousZ: number;
  value: number;
}

/** Where an enemy died this frame, so the view can play a death animation. */
export interface KillMark {
  kind?: EnemyKind;
  lane: number;
  z: number;
}

export interface GameState {
  nextId: number;
  obstacles: TrailHazard[];
  nextObstacleMs: number;
  spores: SporeCloud[];
  nextSporeMs: number;
  nextSporeTickMs: number;
  /** When holding the shield inside a cloud next earns a point; see core/spores.ts. */
  nextShieldPointMs: number;
  /** Points earned this frame outside of orbs (the spore shield), so the view can show a "+N". */
  justBonus: number;
  isInSpore: boolean;
  /** The hands-on-hips shield is up this frame. Blocks spores, stops firing. */
  isShielding: boolean;
  jumpStartedMs: number | null;
  /** The most recent takeoff, kept after landing so a just-landed jump still clears a hazard. */
  lastTakeoffMs: number | null;
  jumpHeight: number;
  jumpHeld: boolean;
  jumpCount: number;
  hitAtMs: number;
  justImpacts: KillMark[];
  /** Successful projectile hits in the current chain, including non-lethal hits. */
  comboHits: number;
  lastEnemyHitMs: number;
  bossSpawned: boolean;
  bossDefeated: boolean;
  /** Kill count at which the next boss walks in. */
  nextBossKills: number;
  lane: number;
  hp: number;
  score: number;
  /** Kills in the running combo chain; see core/scoring.ts. */
  combo: number;
  lastKillMs: number;
  orbs: ScoreOrb[];
  /** Orbs picked up this frame, so the view can fly them to the player. */
  justCollected: number[];
  distance: number;
  speed: number;
  enemies: GameBody[];
  bullets: GameBody[];
  isFiring: boolean;
  fireCooldownMs: number;
  elapsedMs: number;
  movementMs: number;
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
  deathReason: DeathReason | null;
  seed: number;
}

/** What the reducer needs from the player each frame. */
export interface GameInput {
  jump?: boolean;
  lane: number;
  isFiring: boolean;
  /** Level signal: the shield is up for as long as this is true. Never consumed. */
  isShielding?: boolean;
  /** Present for pose control; omitted only by legacy headless/dev input. */
  cadenceSpm?: number;
  /** Number of new knee steps since the last read. Consumed exactly once. */
  stepEvents?: number;
  startingDifficulty?: number;
}

/**
 * The imperative boundary between the pose stream and the game loop: pose
 * updates and key events push into it, the loop pulls a snapshot out.
 */
export interface InputHandle {
  requestJump(): void;
  setPose(label: LateralLabel | null, isJogging: boolean, isShielding?: boolean, cadenceSpm?: number, stepCount?: number): void;
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
