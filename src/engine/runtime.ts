/**
 * The engine's lifecycle, in one framework-free handle.
 *
 * This is the piece the vanilla prototype never had. `main.js` wired the camera,
 * the pose pipeline, the scene and two requestAnimationFrame loops directly to
 * `document`, at module scope, and never tore any of it down -- `stopCamera`,
 * `closePose` and `input.detach()` were exported and never called. Mounted twice
 * (which React Strict Mode does on purpose) that leaks a second WebGL context, a
 * second camera stream and a second rAF loop.
 *
 * So: everything is owned by an instance, nothing touches `document`, and
 * `dispose()` genuinely releases it all. The view layer reads state through
 * `subscribe`/`getSnapshot` -- deliberately throttled, because a HUD does not
 * need to re-render at 60 Hz.
 */

import { CONFIG } from '@/engine/config';
import { createGameState, restartGame, updateGame, difficultyAt } from '@/engine/core/state';
import { advanceDemo } from '@/engine/core/demo';
import { createMetrics, type MetricsSnapshot } from '@/engine/core/metrics';
import { createTrialState, startTrial, stopTrial, updateTrial } from '@/engine/core/trial';
import { createPracticeState, practiceCommand, updatePractice, tickPractice } from '@/engine/core/practice';
import type { PracticeCommand, PracticeState } from '@/engine/core/practice';
import { createDiagnosticLog } from '@/engine/core/diagnostics';
import type { DiagnosticSnapshot, DiagnosticReport } from '@/engine/core/diagnostics';
import type { PoseEvent, PoseId, TrialState } from '@/engine/core/trial';
import { createClapState, updateClap } from '@/engine/detectors/clap';
import { classifyDistance, classifyLighting } from '@/engine/util/luma';
import { createTestScene } from '@/engine/render/testScene';
import { activeMultiplier } from '@/engine/core/scoring';
import { createDrowningPresentation, updateDrowningPresentation } from '@/engine/core/drowning';
import { TRAINING_STAGE_NUMBER, resolveTrainingRules } from '@/engine/core/stage';
import { createInput } from '@/engine/core/input';
import { createJogState, updateJog } from '@/engine/detectors/jog';
import { createHandsOnHipsState, updateHandsOnHips } from '@/engine/detectors/handsOnHips';
import {
  LATERAL,
  createLateralState,
  laneGuide,
  recalibrateLateral,
  updateLateral,
} from '@/engine/detectors/lateral';
import { describeCameraError, startCamera, stopCamera } from '@/engine/pose/camera';
import { closePose, detect, getDelegate, initPose } from '@/engine/pose/pose';
import type { PoseDelegate } from '@/engine/pose/pose';
import { clearOverlay, drawLaneGuide, drawSkeleton, overlayCssScale, resizeOverlay } from '@/engine/pose/draw';
import { createExposureSampler } from '@/engine/pose/exposure';
import { ema } from '@/engine/util/smooth';
import { measureBody } from '@/engine/util/landmarks';
import { createScene } from '@/engine/render/scene';
import { createFrameBudget, createQualityMonitor, GRAPHICS_PRESETS } from '@/engine/render/quality';
import { syncScene } from '@/engine/render/sync';
import type { SceneRefs } from '@/engine/render/sync';
import { BIOMES } from '@/engine/render/world/biomes';
import type {
  GameState,
  JogState,
  LateralLabel,
  LateralState,
  PoseConnection,
  PoseLandmarks,
  RunSummary,
  ShadowQuality,
  RunConfig,
  DeathReason,
  TrailHazard,
} from '@/engine/types';

/** Simulated tail during which the screenshot harness also syncs the view. */
const SIM_SYNC_TAIL_MS = 1500;

/** A HUD does not need 60 Hz. Anything not in FORCE_EMIT_KEYS waits for this. */
const SNAPSHOT_INTERVAL_MS = 100;

/** Selection previews have no camera or game state; this owner releases their loop. */
export function createCharacterPreviewRuntime(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  onStatus: (id: string, status: import('@/engine/render/characterPreview').CharacterPreviewStatus) => void,
) {
  let disposed = false;
  let started = false;
  let frameId: number | null = null;
  let preview: Awaited<ReturnType<typeof import('@/engine/render/characterPreview').createCharacterPreviewScene>> | null = null;
  let previousTime: number | null = null;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const slots = Array.from(container.querySelectorAll<HTMLElement>('[data-character-preview]'))
    .map(element => ({ id: element.dataset.characterPreview!, element }));

  function frame(time: number) {
    if (disposed) return;
    const dt = previousTime === null || motion.matches || document.hidden ? 0 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    if (!document.hidden) preview?.render(dt);
    frameId = requestAnimationFrame(frame);
  }

  return {
    async start() {
      if (disposed || started) return;
      started = true;
      try {
        const { createCharacterPreviewScene } = await import('@/engine/render/characterPreview');
        if (disposed) return;
        const loaded = await createCharacterPreviewScene(canvas, slots, (id, status) => {
          if (!disposed) onStatus(id, status);
        });
        if (disposed) {
          loaded.dispose();
          return;
        }
        preview = loaded;
        frameId = requestAnimationFrame(frame);
      } catch {
        if (!disposed) for (const slot of slots) onStatus(slot.id, 'error');
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      preview?.dispose();
      preview = null;
    },
  };
}

/**
 * 'game' is the calibrated runner, 'test' demonstrates the same four controls
 * with one character, and 'pose' runs calibration without a renderer or reducer.
 */
export type RuntimeMode = 'game' | 'pose' | 'test';
export type PauseReason = 'body' | 'camera' | 'hidden' | 'manual' | null;

export interface RuntimeElements {
  gameCanvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  overlay: HTMLCanvasElement;
  container: HTMLElement;
}

export interface RuntimeOptions {
  /** Passed in rather than generated here, so a server render and a client render agree. */
  seed?: number;
  character?: string;
  graphicsQuality?: ShadowQuality;
  mode?: RuntimeMode;
  onError?: (message: string) => void;
}

export interface HudSnapshot {
  clapCount: number;
  speed: number;
  difficulty: number;
  goalReached: boolean;
  hasStarted: boolean;
  canBegin: boolean;
  pauseReason: PauseReason;
  rehearsal: { left: boolean; right: boolean; knees: boolean; hips: boolean; clap: boolean };
  poseFps: number | null;
  processingMs: number | null;
  renderFps: number | null;
  metrics: MetricsSnapshot;
  /** Test Mode's guided error-rate trial. */
  trial: TrialState;
  practice: PracticeState;
  diagnostics: DiagnosticSnapshot;
  canPractice: boolean;
  jumpCount: number;
  /** Both-arms-overhead raises, each one a jump. */
  armRaiseCount: number;
  /** Times the hands-on-hips pose was taken up. */
  hipsHoldCount: number;
  /** The hands-on-hips pose is held right now (pose read, not the reducer's shield). */
  isHandsOnHips: boolean;
  /** The reducer's shield, which keyboard play can also raise. */
  isShielding: boolean;
  /** Distance to the next spore cloud's front edge, once inside warning range. */
  sporeDistance: number | null;
  isInSpore: boolean;
  feetVisible: boolean;
  isJumpCalibrated: boolean;
  isAirborne: boolean;
  obstacleDistance: number | null;
  obstacleKind: TrailHazard['kind'] | null;
  obstacleOpenLane: number | null;
  deathReason: DeathReason | null;
  endPresentationComplete: boolean;
  bossHp: number | null;
  enemyHp: number | null;
  enemyMaxHp: number | null;
  bossMaxHp: number;
  bossDefeated: boolean;
  score: number;
  /** Successful hits in the current chain, independent of the score combo. */
  comboHits: number;
  /** What the next kill would be multiplied by; 1 when no combo is running. */
  comboMultiplier: number;
  hp: number;
  maxHp: number;
  distance: number;
  isOver: boolean;

  /** Stage progress. `goalKills` is null for an endless run. */
  killCount: number;
  goalKills: number | null;
  isCleared: boolean;
  elapsedMs: number;

  /**
   * What TOR 3 calls จำนวนการเคลื่อนไหว: jog steps, lane changes, jumps, arm
   * raises and hands-on-hips holds. The system
   * detected these -- it is not a calibrated energy figure.
   */
  movementCount: number;
  /** Lane changes so far. Monotonic, so a view can latch on it without state. */
  lateralChangeCount: number;
  /** Time spent actually jogging, for ความต่อเนื่องในการเคลื่อนไหว. */
  movementMs: number;

  lateralLabel: LateralLabel;
  lateralOffset: number;
  isCalibrated: boolean;
  hasBody: boolean;
  isJogging: boolean;
  cadenceSpm: number;
  stepCount: number;
  kneeDelta: number;

  /** Calibration readouts. Null until the body is confidently visible. */
  shoulderWidth: number | null;
  kneesVisible: boolean;
  luma: number | null;

  fps: number | null;
  inferenceMs: number | null;
  delegate: PoseDelegate | null;
  poseModel: string | null;
  cameraLabel: string | null;
  quality: ShadowQuality | null;

  isCameraRunning: boolean;
  isCameraSkipped: boolean;
  isSceneReady: boolean;
  status: string;
  error: string | null;
}

/**
 * Changes a player would notice immediately; these bypass the throttle.
 * `score` moves only when an orb is picked up, so the HUD can react the moment
 * an orb lands without publishing every frame.
 */
const FORCE_EMIT_KEYS: (keyof HudSnapshot)[] = [
  'hasStarted', 'pauseReason', 'canBegin', 'hasBody', 'goalReached', 'trial', 'practice', 'canPractice',
  'score',
  'comboHits',
  'comboMultiplier',
  'hp',
  'isShielding',
  'isHandsOnHips',
  'isInSpore',
  'isOver',
  'isCleared',
  'endPresentationComplete',
  'killCount',
  'isCameraRunning',
  'isSceneReady',
  'quality',
  'status',
  'error',
];

export interface GameRuntime {
  beginRun(startingDifficulty?: number): boolean;
  pause(): void;
  resume(): boolean;
  finish(): void;
  jump(): void;
  start(): void;
  startCamera(): Promise<boolean>;
  stopCamera(): void;
  skipCamera(): void;
  recalibrate(): void;
  setDevFire(active: boolean): void;
  restart(): void;
  /** Test Mode only: prompt one pose `CONFIG.trial.attempts` times and score each prompt. */
  startTrial(pose: PoseId): void;
  stopTrial(): void;
  practiceCommand(command: PracticeCommand): void;
  clearDiagnostics(): void;
  getDiagnosticReport(appVersion: string): DiagnosticReport;
  setCharacter(charId: string): Promise<void>;
  setGraphicsQuality(quality: ShadowQuality): void;
  /** What /result shows. Read after the run ends. */
  getRunSummary(): RunSummary;
  /** Stable between changes, so it is safe for useSyncExternalStore. */
  getSnapshot(): HudSnapshot;
  subscribe(onChange: () => void): () => void;
  dispose(): void;
}

export function createGameRuntime(els: RuntimeElements, options: RuntimeOptions = {}): GameRuntime {
  const ctx = els.overlay.getContext('2d');

  /* ------------------------------------------------------------- state ---- */

  const mode: RuntimeMode = options.mode ?? 'game';
  const exposure = createExposureSampler();

  const rules: RunConfig = rulesFor(mode);

  let game: GameState = createGameState(options.seed ?? 1, rules);
  if (mode === 'test') game = { ...game, speed: 0 };
  let drowning = createDrowningPresentation();
  let previewPaused = false;
  let hasStarted = false;
  let pauseReason: PauseReason = null;
  let startingDifficulty = 1;
  let rehearsal = { left: false, right: false, knees: false, hips: false, clap: false };
  let runSteps = 0, runMovements = 0;
  let lastValidPoseMs: number | null = null;
  let lastPoseReceivedMs: number | null = null;
  /** Pose-frame time of each pose's first unrendered detection. */
  let pendingResponse: Partial<Record<PoseId, number>> = {};
  let trial = createTrialState();
  let practice = createPracticeState();
  let lastPracticeClockMs = performance.now();
  const diagnostics = createDiagnosticLog();
  let lastPerformanceLogMs = performance.now();
  let lastTrackingStatus = 'waiting';
  let lastRenderMs: number | null = null;
  let smoothedRenderFps: number | null = null;
  let smoothedProcessingMs: number | null = null;
  const metrics = createMetrics();
  let lateral: LateralState = createLateralState();
  let laneChangedMs = -Infinity;
  let jog: JogState = createJogState();
  let clap = createClapState();
  let handsOnHips = createHandsOnHipsState();
  const input = createInput();

  let sceneRefs: SceneRefs | null = null;
  let testScene: Awaited<ReturnType<typeof createTestScene>> | null = null;
  let renderedGame: GameState | null = null;
  let renderedActorsVisible = true;
  let renderedDrowningMs = -1;
  let needsRender = true;
  let stream: MediaStream | null = null;
  let connections: PoseConnection[] = [];

  let isDisposed = false;
  let isPoseRunning = false;
  let isCameraSkipped = false;
  let isCameraStarting = false;
  let cameraRequestId = 0;
  let cameraAbortController: AbortController | null = null;
  let gameFrameId: number | null = null;
  let poseFrameId: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let detachKeyboard: (() => void) | null = null;
  let onResize: (() => void) | null = null;

  let lastGameMs = 0;
  let lastQualityMs = 0;
  let lastVideoTime = -1;
  let lastFrameMs = 0;
  let smoothedFps: number | null = null;
  let smoothedInferenceMs: number | null = null;

  const qualityMonitor = createQualityMonitor();
  const frameBudget = createFrameBudget();
  let pendingQuality = options.graphicsQuality ?? CONFIG.game.quality;

  /**
   * Movement tallies. Counted here rather than in the detectors because they
   * are a property of the SESSION, not of the current pose -- a detector is
   * stateless about how many times it has fired.
   */
  let lateralChangeCount = 0;
  let lastCountedLateral: LateralLabel = LATERAL.CENTER;
  let movementMs = 0;
  let lastPoseMs: number | null = null;
  let shoulderWidth: number | null = null;
  let kneesVisible = false;
  let luma: number | null = null;

  let pendingCharacter = options.character ?? CONFIG.game.defaultCharacter;
  let characterRequestId = 0;
  let actorsVisible = true;

  /** The config this run steps under: endless Training. Pose mode never reads it. */
  function rulesFor(runMode: RuntimeMode): RunConfig {
    return runMode === 'game' ? resolveTrainingRules() : { ...CONFIG.game };
  }

  /* ---------------------------------------------------------- snapshot ---- */

  const listeners = new Set<() => void>();
  let status = 'Idle.';
  let errorMessage: string | null = null;
  let delegate: PoseDelegate | null = null;
  let poseModel: string | null = null;
  let cameraLabel: string | null = null;
  let lastEmitMs = 0;

  let snapshot: HudSnapshot = buildSnapshot();

  function sporeDistanceAhead(): number | null {
    if (game.isOver) return null;
    const next = game.spores.find((cloud) => cloud.status === 'approaching');
    const distance = next ? rules.playerZ - next.z : null;
    return distance !== null && distance <= rules.spore.warnDistance ? Math.max(0, distance) : null;
  }

  function buildSnapshot(): HudSnapshot {
    const nearest = game.obstacles.filter(o => o.status !== 'cleared').reduce<TrailHazard | null>(
      (near, o) => !near || o.z > near.z ? o : near, null);
    const nearestEnemy = game.enemies.reduce<(typeof game.enemies)[number] | null>((near, e) => !near || e.z > near.z ? e : near, null);
    return {
      clapCount: clap.clapCount,
      speed: pauseReason !== null || !isPoseRunning && !isCameraSkipped ? 0 : game.speed,
      difficulty: difficultyAt(game.elapsedMs, startingDifficulty),
      goalReached: game.elapsedMs >= CONFIG.game.goalMs,
      hasStarted,
      canBegin: canBegin(),
      pauseReason,
      rehearsal,
      poseFps: smoothedFps,
      processingMs: smoothedProcessingMs,
      renderFps: smoothedRenderFps,
      metrics: metrics.snapshot(),
      trial,
      practice,
      diagnostics: diagnostics.snapshot(),
      canPractice: hasPracticeTracking() && testScene !== null,
      score: game.score,
      comboHits: game.comboHits,
      comboMultiplier: activeMultiplier(game, game.elapsedMs, rules),
      jumpCount: clap.clapCount,
      armRaiseCount: clap.clapCount,
      hipsHoldCount: handsOnHips.holdCount,
      isHandsOnHips: handsOnHips.isActive,
      isShielding: game.isShielding,
      sporeDistance: sporeDistanceAhead(),
      isInSpore: game.isInSpore,
      feetVisible: false,
      isJumpCalibrated: lateral.isCalibrated,
      isAirborne: game.jumpStartedMs !== null,
      obstacleDistance: nearest && !game.isOver ? Math.max(0, rules.playerZ - nearest.z) : null,
      obstacleKind: nearest?.kind ?? null,
      obstacleOpenLane: nearest?.laneCount === 2 ? nearest.startLane === 0 ? 2 : 0 : null,
      deathReason: game.deathReason,
      endPresentationComplete: drowning.complete,
      bossHp: game.enemies.find(e => e.kind === 'boss')?.hp ?? null,
      enemyHp: nearestEnemy ? nearestEnemy.hp ?? 1 : null,
      enemyMaxHp: nearestEnemy ? rules.enemyTypes[nearestEnemy.kind ?? 'normal'].hp : null,
      bossMaxHp: rules.enemyTypes.boss.hp,
      bossDefeated: game.bossDefeated,
      hp: game.hp,
      maxHp: rules.maxHp,
      distance: game.distance,
      isOver: game.isOver,

      killCount: game.killCount,
      goalKills: rules.goalKills !== undefined && Number.isFinite(rules.goalKills) ? rules.goalKills : null,
      isCleared: game.isCleared,
      elapsedMs: game.elapsedMs,
      movementCount: movementTotal(),
      lateralChangeCount,
      movementMs: hasStarted || mode === 'test' ? game.movementMs : movementMs,

      lateralLabel: lateral.label,
      lateralOffset: lateral.offset,
      isCalibrated: lateral.isCalibrated,
      hasBody: lateral.hasBody && lastPoseReceivedMs !== null && performance.now() - lastPoseReceivedMs <= 1000,
      isJogging: jog.isJogging,
      cadenceSpm: jog.cadenceSpm,
      stepCount: hasStarted ? runSteps : jog.stepCount,
      kneeDelta: jog.kneeDelta,

      shoulderWidth,
      kneesVisible,
      luma,

      fps: smoothedFps,
      inferenceMs: smoothedInferenceMs,
      delegate,
      poseModel,
      cameraLabel,
      quality: sceneRefs?.quality ?? testScene?.quality ?? null,

      isCameraRunning: isPoseRunning,
      isCameraSkipped,
      isSceneReady: sceneRefs !== null || testScene !== null,
      status,
      error: errorMessage,
    };
  }

  /**
   * Rebuilds the snapshot only when something actually changed, so
   * getSnapshot() stays referentially stable and React does not loop.
   */
  function publish(nowMs = performance.now()): void {
    if (isDisposed) return;
    const next = buildSnapshot();

    const forced = FORCE_EMIT_KEYS.some((key) => next[key] !== snapshot[key]);
    if (!forced && nowMs - lastEmitMs < SNAPSHOT_INTERVAL_MS) return;
    if ((Object.keys(next) as (keyof HudSnapshot)[]).every(key => next[key] === snapshot[key])) return;

    lastEmitMs = nowMs;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function setStatus(text: string): void {
    status = text;
    if (mode === 'test') diagnostics.append('lifecycle', 'status', { message: text });
    publish();
  }

  function setError(message: string | null): void {
    errorMessage = message;
    if (mode === 'test' && message) diagnostics.append('error', 'runtime-error', { message });
    if (message) options.onError?.(message);
    publish();
  }

  /* ------------------------------------------------------- game loop ------ */

  function onVisibilityChange(): void {
    lastGameMs = performance.now();
    lastQualityMs = lastGameMs;
    frameBudget.reset();
    lastRenderMs = null;
    if (document.hidden) pauseRun('hidden');
    if (mode === 'test' && document.hidden) pausePractice('Tab hidden');
    lastPracticeClockMs = performance.now();
    if (!document.hidden) needsRender = true;
    publish();
  }

  function gameFrame(nowMs: number): void {
    if (isDisposed) return;
    if (mode === 'test') {
      const tracking = hasPracticeTracking() ? 'ready' : document.hidden ? 'hidden' : !isPoseRunning ? 'camera' : !lateral.hasBody || !kneesVisible ? 'body' : !lateral.isCalibrated ? 'calibrating' : 'stale';
      if (tracking !== lastTrackingStatus) {
        diagnostics.append('tracking', tracking, { previous: lastTrackingStatus });
        lastTrackingStatus = tracking;
      }
      if (tracking !== 'ready') pausePractice(tracking === 'hidden' ? 'Tab hidden' : tracking === 'camera' ? 'Camera stopped' : 'Tracking unavailable');
      advancePracticeClock(nowMs);
      if (nowMs - lastPerformanceLogMs >= 5000) {
        diagnostics.append('performance', 'sample', { poseFps: smoothedFps, renderFps: smoothedRenderFps, processingMs: smoothedProcessingMs, inferenceMs: smoothedInferenceMs, latency: metrics.snapshot().latencyByPose, model: poseModel, delegate });
        lastPerformanceLogMs = nowMs;
      }
    }

    if (document.hidden) {
      pauseRun('hidden');
      lastGameMs = lastQualityMs = nowMs;
      frameBudget.reset();
      qualityMonitor.reset();
      gameFrameId = requestAnimationFrame(gameFrame);
      return;
    }

    // The run waits for pose tracking or the explicit dev bypass. The scene
    // still paints behind the dialog and remains available to tools/shot.mjs.
    if (mode === 'game' && hasStarted && !isCameraSkipped && !game.isOver
      && (lastValidPoseMs === null || nowMs - lastValidPoseMs > 1000)) pauseRun('body');
    const isPlaying = mode === 'test' ? isPoseRunning : hasStarted && pauseReason === null && (isPoseRunning || isCameraSkipped);
    const hasTestTracking = isPoseRunning && lateral.hasBody && lateral.isCalibrated && kneesVisible
      && lastValidPoseMs !== null && nowMs - lastValidPoseMs <= 1000;
    if (mode === 'test' && !hasTestTracking) input.clearPose();
    // Measure display callbacks, not the intentional 30/45fps cap. Otherwise
    // Medium would mistake its own budget for a slow device and downgrade.
    sampleQuality(nowMs - lastQualityMs, !isPlaying || previewPaused || game.isOver);
    lastQualityMs = nowMs;
    if (sceneRefs && !frameBudget.consume(nowMs, sceneRefs.quality) && !needsRender) {
      gameFrameId = requestAnimationFrame(gameFrame);
      return;
    }

    // Step and sync together so one-frame combat events are never skipped.
    // Accumulate the real elapsed time across skipped callbacks.
    const elapsedMs = nowMs - lastGameMs;
    const dtMs = elapsedMs > 1000 ? 0 : Math.max(0, elapsedMs);
    lastGameMs = nowMs;
    const stepMs = isPlaying ? dtMs : 0;
    if (isPlaying && !previewPaused && dtMs > 0) {
      const controls = input.read();
      game = mode === 'test' ? advanceDemo(game, controls, dtMs)
        : updateGame(game, { ...controls, ...(isCameraSkipped ? {} : { startingDifficulty }) }, dtMs, rules);
      if (mode === 'test' && !hasTestTracking) {
        game = { ...game, speed: 0, justFired: false, isFiring: false, isShielding: false, jumpStartedMs: null, jumpHeight: 0 };
      }
    }

    drowning = updateDrowningPresentation(drowning, game.deathReason, previewPaused ? 0 : dtMs, rules.obstacle.drowningMs);
    // The permission dialog and paused previews contain a static world. Paint
    // on state/character/size changes instead of uploading it every display tick.
    const hasVisualChange = needsRender || renderedGame !== game || renderedActorsVisible !== actorsVisible || renderedDrowningMs !== drowning.elapsedMs;
    if (sceneRefs && (hasVisualChange || (isPlaying && !previewPaused))) {
      syncScene(sceneRefs, game, previewPaused ? 0 : stepMs, rules, actorsVisible, drowning);
      sceneRefs.render();
      renderedGame = game;
      renderedActorsVisible = actorsVisible;
      renderedDrowningMs = drowning.elapsedMs;
      needsRender = false;
      recordRender(nowMs, isPlaying && !previewPaused && !game.isOver);
    }
    if (testScene) {
      // Test Mode keeps the idle clip moving even without a detected body.
      testScene.render(game, dtMs, hasTestTracking);
      needsRender = false;
      recordRender(nowMs, isPlaying);
    }

    publish(nowMs);
    gameFrameId = requestAnimationFrame(gameFrame);
  }

  function recordRender(nowMs: number, active: boolean) {
    if (!active) { lastRenderMs = null; return; }
    if (lastRenderMs !== null && nowMs > lastRenderMs) {
      const dt = nowMs - lastRenderMs;
      smoothedRenderFps = ema(smoothedRenderFps, 1000 / dt, CONFIG.fps.smoothing);
      metrics.render(game.elapsedMs, dt);
    }
    lastRenderMs = nowMs;
    const renderedMs = performance.now();
    for (const [pose, startMs] of Object.entries(pendingResponse) as [PoseId, number][]) {
      metrics.response(pose, Math.max(0, renderedMs - startMs));
    }
    pendingResponse = {};
  }

  function canBegin() {
    return isPoseRunning && lateral.hasBody && lateral.isCalibrated && kneesVisible
      && classifyDistance(shoulderWidth) === 'ok' && classifyLighting(luma) === 'ok'
      && Object.values(rehearsal).every(Boolean) && lastValidPoseMs !== null
      && performance.now() - lastValidPoseMs <= 1000 && !document.hidden;
  }

  function hasPracticeTracking() {
    return isPoseRunning && lateral.hasBody && lateral.isCalibrated && kneesVisible
      && lastValidPoseMs !== null && performance.now() - lastValidPoseMs <= 1000 && !document.hidden;
  }

  function setPractice(next: PracticeState, event: string) {
    if (next === practice) return;
    const previous = practice;
    practice = next;
    if (next.pose !== previous.pose && next.phase === 'ready') resetPracticeDetector(next);
    if (event !== 'tick' || next.phase !== previous.phase || next.pose !== previous.pose || next.round !== previous.round) {
      const name = next.phase === 'summary' ? 'session-finished' : event === 'tick'
        ? next.phase === 'rest' ? 'rest-started' : next.round !== previous.round ? 'round-started' : 'pose-started' : event;
      diagnostics.append('practice', name, { pose: next.pose, phase: next.phase, expected: next.prompt,
        count: next.count, goal: next.goal, round: next.round, elapsedMs: next.elapsedMs, reason: next.pauseReason ?? next.finishReason });
    }
    if (next.count > previous.count) diagnostics.append('practice', 'counted', { pose: next.pose, count: next.count, goal: next.goal, expected: previous.prompt, detected: next.pose });
    if (next.phase === 'complete' && next.count > previous.count) diagnostics.append('practice', 'completed', { pose: next.pose, count: next.count });
  }

  function advancePracticeClock(nowMs: number) {
    // RAF and video callbacks can arrive with slightly different timestamp order.
    const clockMs = Math.max(nowMs, lastPracticeClockMs);
    const deltaMs = clockMs - lastPracticeClockMs;
    lastPracticeClockMs = clockMs;
    if (hasPracticeTracking() && !trial.active) setPractice(tickPractice(practice, deltaMs), 'tick');
  }

  function resetPracticeDetector(next: PracticeState) {
    // A new pose must observe a fresh arming / starting position, even after auto-advance.
    if (next.pose === 'clap') clap = { ...createClapState(), clapCount: clap.clapCount };
    if (next.pose === 'knees') jog = { ...createJogState(), stepCount: jog.stepCount };
  }

  function pausePractice(reason: string) {
    if (mode === 'test') setPractice(practiceCommand(practice, { type: 'pause', reason }), 'paused');
  }

  function pauseRun(reason: Exclude<PauseReason, null>) {
    if (mode !== 'game' || !hasStarted || game.isOver || pauseReason !== null) return;
    pauseReason = reason;
    if (reason === 'body') metrics.bodyLoss();
    input.clearPose(); pendingResponse = {}; lastRenderMs = null;
    needsRender = true; publish();
  }

  function sampleQuality(dtMs: number, suspended: boolean): void {
    if (!sceneRefs) return;
    const next = qualityMonitor.sample(dtMs, sceneRefs.quality, suspended);
    if (next) {
      sceneRefs.setQuality(next);
      frameBudget.reset();
      needsRender = true;
    }
  }

  /* ------------------------------------------------------- pose loop ------ */

  /**
   * requestVideoFrameCallback fires once per decoded camera frame, which avoids
   * re-running inference on identical frames when the display refreshes faster
   * than the camera. rAF is the fallback for Firefox.
   */
  function schedulePoseFrame(): void {
    if (!isPoseRunning || isDisposed) return;
    if (typeof els.video.requestVideoFrameCallback === 'function') {
      poseFrameId = els.video.requestVideoFrameCallback(() => poseFrame());
    } else {
      poseFrameId = requestAnimationFrame(() => poseFrame());
    }
  }

  function poseFrame(): void {
    poseFrameId = null;
    if (!isPoseRunning || isDisposed) return;
    if (document.hidden) {
      lastPoseMs = null;
      lastFrameMs = 0;
      schedulePoseFrame();
      return;
    }
    const nowMs = performance.now();

    const hasFrame =
      els.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      els.video.currentTime !== lastVideoTime;

    if (hasFrame) {
      lastVideoTime = els.video.currentTime;
      try {
        processFrame(nowMs);
      } catch (error) {
        pauseRun('camera');
        releaseCamera();
        setError(describeCameraError(error));
        setStatus('Stopped.');
        console.error(error);
        return;
      }
      updateFps(nowMs);
      publish(nowMs);
    }

    schedulePoseFrame();
  }

  function processFrame(nowMs: number): void {
    resizeOverlay(els.overlay, els.video);

    const { landmarks, inferenceMs } = detect(els.video, nowMs);
    smoothedInferenceMs = ema(smoothedInferenceMs, inferenceMs, CONFIG.fps.smoothing);

    const previousSteps = jog.stepCount, previousClaps = clap.clapCount, previousHolds = handsOnHips.holdCount;
    const previousClapArmed = clap.armed;
    const previousLane = lateral.label;
    lateral = updateLateral(lateral, landmarks, nowMs);
    if (lateral.label !== previousLane) laneChangedMs = nowMs;
    jog = updateJog(jog, landmarks, nowMs);
    clap = updateClap(clap, landmarks, nowMs);
    handsOnHips = updateHandsOnHips(handsOnHips, landmarks, nowMs);

    trackCalibrationReadouts(landmarks as PoseLandmarks | null, nowMs);
    trackMovement(nowMs);
    if (lateral.hasBody && kneesVisible) lastValidPoseMs = nowMs;
    else pauseRun('body');
    if (!hasStarted) {
      const next = { left: rehearsal.left || lateral.isCalibrated && lateral.label === LATERAL.LEFT,
        right: rehearsal.right || lateral.isCalibrated && lateral.label === LATERAL.RIGHT,
        knees: rehearsal.knees || jog.stepCount > 0, hips: rehearsal.hips || handsOnHips.holdCount > 0,
        clap: rehearsal.clap || clap.clapCount > 0 };
      if (Object.keys(next).some(key => next[key as keyof typeof next] !== rehearsal[key as keyof typeof next])) rehearsal = next;
    } else if (pauseReason === null && !game.isOver) {
      runSteps += jog.stepCount - previousSteps;
      runMovements += jog.stepCount - previousSteps + clap.clapCount - previousClaps + handsOnHips.holdCount - previousHolds
        + Number(lateral.isCalibrated && lateral.label !== previousLane);
    }

    // The game reads this snapshot from its own loop; it never runs inference.
    let events: PoseEvent[] = [];
    if (!landmarks || !lateral.hasBody || !lateral.isCalibrated) {
      input.clearPose();
    } else {
      input.setPose(lateral.label, jog.isJogging, handsOnHips.isActive, jog.cadenceSpm, jog.stepCount);
      if (mode === 'game' && (!hasStarted || pauseReason !== null || game.isOver)) input.clearPose();
      else {
        if (clap.justClapped) input.requestJump();
        events = poseEvents(previousLane, previousSteps, previousHolds, previousClaps);
        for (const event of events) pendingResponse[event.pose] ??= nowMs;
      }
    }
    if (mode === 'test') {
      const readout = { lane: lateral.label, upKnee: jog.upKnee, isHandsOnHips: handsOnHips.isActive, clapArmed: previousClapArmed || clap.armed };
      for (const event of events) diagnostics.append('detection', 'movement', { ...event, expected: practice.mode === 'guided' ? practice.prompt : null, trialTarget: trial.active?.target ?? trial.active?.pose ?? null });
      const wasCounting = practice.phase === 'ready' || practice.phase === 'active';
      advancePracticeClock(nowMs);
      if (hasPracticeTracking() && wasCounting) setPractice(updatePractice(practice, events, readout), 'prompt');
      else if (!hasPracticeTracking()) pausePractice('Tracking unavailable');
      const previousTrial = trial;
      trial = updateTrial(trial, kneesVisible ? events : [], readout, nowMs);
      if (trial !== previousTrial) {
        const pose = previousTrial.active?.pose;
        diagnostics.append('trial', trial.active ? 'updated' : 'completed', { pose, expected: previousTrial.active?.target ?? pose, detected: events, phase: trial.active?.phase ?? 'complete', tally: pose ? trial.results[pose] : null });
      }
    }

    if (ctx) {
      clearOverlay(ctx);
      const flash = Math.max(0, 1 - (nowMs - laneChangedMs) / CONFIG.draw.laneFlashMs);
      drawLaneGuide(ctx, laneGuide(lateral, measureBody(landmarks), nowMs), flash, overlayCssScale(els.overlay));
      drawSkeleton(ctx, landmarks as PoseLandmarks | null, connections);
    }
    smoothedProcessingMs = ema(smoothedProcessingMs, performance.now() - nowMs, CONFIG.fps.smoothing);
    lastPoseReceivedMs = performance.now();
  }

  /** This frame's detections, in a fixed order. */
  function poseEvents(previousLane: LateralLabel, previousSteps: number, previousHolds: number, previousClaps: number): PoseEvent[] {
    const events: PoseEvent[] = [];
    if (lateral.label !== previousLane) events.push({ pose: 'lateral', lane: lateral.label });
    if (jog.stepCount > previousSteps) events.push({ pose: 'knees', knee: jog.upKnee });
    if (handsOnHips.holdCount > previousHolds) events.push({ pose: 'hips' });
    if (clap.clapCount > previousClaps) events.push({ pose: 'clap' });
    return events;
  }

  /** Framing and lighting, for /calibrate. Held across frames the body is lost. */
  function trackCalibrationReadouts(landmarks: PoseLandmarks | null, nowMs: number): void {
    const body = measureBody(landmarks);
    shoulderWidth = body?.shoulderWidth ?? null;
    kneesVisible = body?.kneesVisible ?? false;
    luma = exposure.sample(els.video, nowMs);
  }

  /**
   * The session tallies TOR 3 reports: one movement per jog step (counted by the
   * detector) plus one per lane change. A lane change only counts once the
   * baseline is established, or the calibration wobble would inflate it.
   */
  function trackMovement(nowMs: number): void {
    if (lateral.isCalibrated && lateral.label !== lastCountedLateral) {
      lastCountedLateral = lateral.label;
      lateralChangeCount += 1;
    }

    if (lastPoseMs !== null && jog.isJogging) {
      movementMs += Math.min(nowMs - lastPoseMs, CONFIG.game.maxFrameMs);
    }
    lastPoseMs = nowMs;
  }

  function updateFps(nowMs: number): void {
    if (lastFrameMs > 0) {
      const deltaMs = nowMs - lastFrameMs;
      if (deltaMs > 0) smoothedFps = ema(smoothedFps, 1000 / deltaMs, CONFIG.fps.smoothing);
    }
    lastFrameMs = nowMs;
  }

  /* ---------------------------------------------------------- scene ------- */

  async function bootScene(): Promise<void> {
    try {
      if (mode === 'test') {
        const demo = await createTestScene(els.gameCanvas, () => isDisposed);
        if (isDisposed) { demo.dispose(); return; }
        testScene = demo;
        demo.setQuality(pendingQuality);
        await applyCharacter(pendingCharacter);
        if (isDisposed) return;
        diagnostics.append('lifecycle', 'character-ready', { character: pendingCharacter });
        observeResize(); publish(); return;
      }
      const refs = await createScene(els.gameCanvas, { ...CONFIG.game, quality: pendingQuality });

      // Disposed while the scene was loading: throw it away rather than
      // attaching a renderer nobody will ever tear down.
      if (isDisposed) {
        refs.dispose();
        return;
      }

      sceneRefs = refs;
      // Preferences may have changed while the assets were loading.
      refs.setQuality(pendingQuality);
      await applyCharacter(pendingCharacter);
      if (isDisposed) return;
      observeResize();
      exposeTestHook();
      publish();
    } catch (error) {
      if (isDisposed) return;
      setError('Could not load the 3D renderer. Check the network, then reload.');
      console.error(error);
    }
  }

  function observeResize(): void {
    const resize = () => {
      sceneRefs?.resize();
      testScene?.resize();
      needsRender = true;
    };
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(els.container);
      return;
    }
    onResize = resize;
    window.addEventListener('resize', onResize);
  }

  /** Loads a character and re-skins the projectiles to match their weapon. */
  async function applyCharacter(charId: string): Promise<void> {
    pendingCharacter = Object.hasOwn(CONFIG.game.characters, charId) ? charId : CONFIG.game.defaultCharacter;
    if (!sceneRefs && !testScene) return;
    const refs = sceneRefs ?? testScene!;
    const character = pendingCharacter;
    const requestId = ++characterRequestId;
    await refs.player.loadCharacter(character);
    if (isDisposed || refs !== (sceneRefs ?? testScene) || requestId !== characterRequestId) return;
    refs.bulletPool.setCharacter(character);
    needsRender = true;
  }

  /* ------------------------------------------------------- test hook ------ */

  /**
   * Dev hook for tools/shot.mjs. The headless harness needs to know when the
   * scene has finished loading, to jump the run forward to photograph a later
   * stretch of trail, and to read renderer.info for the draw-call budget.
   *
   * Development only. `warpTo` and `simulate` drive the real reducer, so in a
   * production build this would be a one-line path to an arbitrary score. The
   * harness is documented to run against `npm run dev`, so gating it costs
   * nothing.
   */
  function exposeTestHook(): void {
    if (process.env.NODE_ENV === 'production') return;

    (window as unknown as { __lane?: unknown }).__lane = {
      ready: true,
      warpTo(distance: number) {
        game = { ...game, distance: Number(distance) || 0 };
      },
      /** Brings the next spore cloud forward to now, instead of waiting for its timer. */
      spawnSpore() {
        game = { ...game, nextSporeMs: game.elapsedMs };
      },
      restart() {
        previewPaused = false;
        game = restartGame(game, rules);
        input.reset();
        resetMovementTallies();
        sceneRefs?.player?.playAnimation('run', 0.1, true);
        if (!actorsVisible && sceneRefs?.player) {
          sceneRefs.player.group.visible = false;
        }
        publish();
      },
      /** Deterministic fixture for visual regression, gated to development. */
      previewHazard(kind: TrailHazard['kind'], startLane: 0 | 1 = 0, laneCount: 2 | 3 = 3, z = -12, id = 70) {
        if (!['log', 'stones', 'river'].includes(kind)) return;
        const body = { id: Math.floor(Number(id)) || 0, kind, z, previousZ: z, status: 'approaching' as const };
        const obstacle: TrailHazard = kind === 'river' || laneCount === 3
          ? { ...body, startLane: 0, laneCount: 3 }
          : { ...body, kind, startLane, laneCount: 2 };
        game = { ...createGameState(game.seed, rules), speed: rules.walkSpeed, obstacles: [obstacle], nextSpawnMs: Infinity, nextObstacleMs: Infinity };
        input.reset();
        resetMovementTallies();
        previewPaused = true;
        actorsVisible = true;
        if (sceneRefs) syncScene(sceneRefs, game, 0, rules, actorsVisible, drowning);
        publish();
      },
      setActorsVisible(visible: boolean) {
        actorsVisible = Boolean(visible);
        if (!actorsVisible) {
          game = { ...game, enemies: [], bullets: [] };
          if (sceneRefs?.player) sceneRefs.player.group.visible = false;
          if (sceneRefs?.enemyPool) {
            for (const item of sceneRefs.enemyPool.items) item.group.visible = false;
            for (const corpse of sceneRefs.enemyPool.corpses) corpse.group.visible = false;
          }
          if (sceneRefs?.bulletPool) {
            for (const b of sceneRefs.bulletPool.items) b.mesh.visible = false;
          }
        } else {
          if (sceneRefs?.player) sceneRefs.player.group.visible = true;
        }
      },
      /**
       * Steps the real reducer at a fixed timestep. Software rendering is far
       * too slow to reach an interesting moment in wall-clock time, and this
       * drives the actual game logic, so what gets photographed is a state the
       * game can really be in.
       */
      simulate(seconds: number, simOptions: { lane?: number; firing?: boolean; jump?: boolean; shield?: boolean } = {}) {
        const stepMs = 1000 / 60;
        const steps = Math.max(0, Math.round(((Number(seconds) || 0) * 1000) / stepMs));
        for (let step = 0; step < steps; step += 1) {
          game = updateGame(
            game,
            {
              lane: simOptions.lane ?? game.lane,
              isFiring: simOptions.firing !== false,
              jump: step === 0 && simOptions.jump,
              isShielding: simOptions.shield,
            },
              stepMs,
              rules,
            );
          drowning = updateDrowningPresentation(drowning, game.deathReason, stepMs, rules.obstacle.drowningMs);
          // Sync the view too, or per-frame visuals the reducer only reports
          // once -- deaths, hit bursts -- are stepped straight past. Only for
          // the tail: syncScene walks every scatter instance.
          const remainingMs = (steps - step) * stepMs;
          if (sceneRefs && remainingMs < SIM_SYNC_TAIL_MS) syncScene(sceneRefs, game, stepMs, rules, actorsVisible, drowning);
        }
        publish();
      },
      summary() {
        const info = sceneRefs?.renderer?.info?.render;
        const player = sceneRefs?.player;
        return {
          dist: Math.round(game.distance),
          elapsedMs: game.elapsedMs,
          isOver: game.isOver,
          isCleared: game.isCleared,
          enemies: game.enemies.map(e => ({ id: e.id, kind: e.kind, hp: e.hp, z: e.z, lane: e.lane })),
          hazards: game.obstacles.map(o => ({ id: o.id, kind: o.kind, startLane: o.startLane, laneCount: o.laneCount, z: o.z, status: o.status })),
          spores: game.spores.map(s => ({ id: s.id, z: s.z, length: s.length, status: s.status })),
          deathReason: game.deathReason,
          endPresentationComplete: drowning.complete,
          drowningElapsedMs: drowning.elapsedMs,
          splashVisible: sceneRefs?.drowningSplash?.group.visible ?? false,
          playerVisible: player?.group.visible ?? false,
          playerY: player?.group.position.y ?? null,
          jumpHeight: game.jumpHeight,
          jumpStartedMs: game.jumpStartedMs,
          jumpCount: game.jumpCount,
          bossDefeated: game.bossDefeated,
          hp: game.hp,
          score: game.score,
          comboHits: game.comboHits,
          calls: info?.calls ?? null,
          tris: info?.triangles ?? null,
          quality: sceneRefs?.quality ?? null,
          graphics: sceneRefs ? {
            sceneryInstances: sceneRefs.scatter.meshes.reduce((sum, entry) => sum + entry.mesh.count, 0),
            detailInstances: sceneRefs.scatter.meshes.filter(entry => entry.detail).reduce((sum, entry) => sum + entry.mesh.count, 0),
            motes: sceneRefs.motes.items.filter(item => item.mesh.visible).length,
            cloudsVisible: sceneRefs.clouds.mesh.visible,
            shadows: sceneRefs.renderer.shadowMap.enabled,
            shadowMapSize: sceneRefs.lighting.sun.shadow.mapSize.x,
            shadowCameraLeft: sceneRefs.lighting.sun.shadow.camera.left,
            pixelRatio: sceneRefs.renderer.getPixelRatio(),
            maxFps: GRAPHICS_PRESETS[sceneRefs.quality].maxFps,
          } : null,
          corpses: sceneRefs?.enemyPool?.corpses?.filter((c) => c.group.visible).length ?? 0,
          enemyAnims: (sceneRefs?.enemyPool?.items ?? []).filter(s => s.group.visible).map(s => ({
            kind: s.kind, clip: s.current, time: s.action?.time ?? null, z: s.group.position.z, height: s.model?.scale.y ?? null,
          })),
          corpseAnims: (sceneRefs?.enemyPool?.corpses ?? []).filter(s => s.group.visible).map(s => ({
            kind: s.kind, clip: s.current, time: s.action?.time ?? null, weight: s.action?.getEffectiveWeight() ?? null,
            x: s.group.position.x, y: s.group.position.y, z: s.group.position.z, elapsed: s.elapsed ?? null,
          })),
          character: player?.characterId ?? null,
          anim: player?.currentActionName ?? null,
          animTime: player?.currentAction?.time ?? null,
          animDuration: player?.currentAction?.getClip().duration ?? null,
          animRunning: Boolean(player?.currentAction?.isRunning?.()),
          clips: Object.keys(player?.actions ?? {}),
        };
      },
    };
  }

  /* ------------------------------------------------------------ api ------- */

  return {
    start() {
      if (isDisposed) return;

      // Calibration has no scene or game. startCamera() owns its pose loop.
      if (mode === 'pose') {
        setStatus('Ready to start the camera.');
        return;
      }

      if (gameFrameId !== null) return;
      if (process.env.NODE_ENV !== 'production' && mode === 'game') detachKeyboard = input.attachKeyboard();
      void bootScene();
      lastGameMs = performance.now();
      lastQualityMs = lastGameMs;
      document.addEventListener('visibilitychange', onVisibilityChange);
      gameFrameId = requestAnimationFrame(gameFrame);
    },

    async startCamera() {
      if (isDisposed || isCameraStarting) return false;
      if (isPoseRunning) return true;
      isCameraStarting = true;
      const requestId = ++cameraRequestId;
      const abortController = new AbortController();
      cameraAbortController = abortController;
      setError(null);

      try {
        setStatus('Requesting camera...');
        const camera = await startCamera(els.video, undefined, abortController.signal);
        if (isDisposed || requestId !== cameraRequestId) {
          stopCamera(camera.stream);
          return false;
        }
        stream = camera.stream;
        const acquiredStream = stream;
        for (const track of stream.getTracks()) track.addEventListener?.('ended', () => {
          if (stream !== acquiredStream || isDisposed || !isPoseRunning) return;
          pauseRun('camera'); releaseCamera(); setError('The camera disconnected. Start it again, then resume.');
        }, { once: true });
        cameraLabel = `${camera.width}x${camera.height}`;
        if (mode === 'test') diagnostics.append('lifecycle', 'camera-acquired', { dimensions: cameraLabel });

        setStatus(`Loading pose model (${CONFIG.pose.model})...`);
        if (isDisposed || requestId !== cameraRequestId) return false;
        const pose = await initPose();
        if (isDisposed || requestId !== cameraRequestId) {
          return false;
        }

        connections = pose.connections;
        delegate = pose.delegate;
        poseModel = pose.model;
        if (mode === 'test') diagnostics.append('lifecycle', 'model-ready', { model: poseModel, delegate });

        isPoseRunning = true;
        isCameraSkipped = false;
        setStatus('Camera ready. Stand still to set your centre, then try all four movements.');
        schedulePoseFrame();
        return true;
      } catch (error) {
        if (isDisposed || requestId !== cameraRequestId) return false;
        releaseCamera();
        setError(describeCameraError(error));
        setStatus('Stopped.');
        console.error(error);
        return false;
      } finally {
        if (requestId === cameraRequestId) {
          isCameraStarting = false;
          cameraAbortController = null;
        }
      }
    },

    stopCamera() {
      pauseRun('camera');
      releaseCamera();
      setStatus('Camera stopped.');
    },

    skipCamera() {
      if (process.env.NODE_ENV === 'production' || isDisposed || mode !== 'game') return;
      releaseCamera();
      isCameraSkipped = true;
      hasStarted = true; pauseReason = null;
      setError(null);
      setStatus('Development mode: keyboard controls, camera off.');
    },

    recalibrate() {
      resetPoseHolds();
      lateral = recalibrateLateral(lateral);
      pauseRun('manual');
      setStatus('Recalibrating centre — stand still with your knees visible.');
    },

    setDevFire(active: boolean) {
      if (!isDisposed && mode === 'game') input.setDevFire(active);
    },

    jump() { if (!isDisposed && mode === 'game') input.requestJump(); },

    startTrial(pose: PoseId) {
      if (isDisposed || mode !== 'test' || !hasPracticeTracking()) return;
      pausePractice('Timed evaluation running');
      trial = startTrial(trial, pose, performance.now());
      diagnostics.append('trial', 'started', { pose, attempts: CONFIG.trial.attempts });
      publish();
    },

    stopTrial() {
      if (mode === 'test' && trial.active) diagnostics.append('trial', 'stopped', { pose: trial.active.pose });
      trial = stopTrial(trial);
      publish();
    },

    practiceCommand(command: PracticeCommand) {
      if (isDisposed || mode !== 'test') return;
      if ((command.type === 'start' || command.type === 'resume' || command.type === 'continue') && (!hasPracticeTracking() || !testScene)) return;
      lastPracticeClockMs = performance.now();
      if (trial.active) {
        diagnostics.append('trial', 'stopped', { pose: trial.active.pose, reason: 'Practice control' });
        trial = stopTrial(trial);
      }
      const next = practiceCommand(practice, command);
      if (next !== practice && (command.type === 'start' || command.type === 'resume')) {
        // Starting positions must be observed after Start/Resume, not inherited
        // from movements made while the guide was idle or paused.
        resetPracticeDetector(next);
      }
      setPractice(next, command.type);
      publish();
    },

    clearDiagnostics() { diagnostics.clear(); lastEmitMs = -Infinity; publish(); },
    getDiagnosticReport(appVersion: string) { return diagnostics.report(appVersion, practice, trial, metrics.snapshot()); },

    restart() {
      previewPaused = false;
      game = restartGame(game, rules);
      input.reset();
      resetMovementTallies();
      hasStarted = false; pauseReason = null; isCameraSkipped = false;
      rehearsal = { left: false, right: false, knees: false, hips: false, clap: false };
      lateral = recalibrateLateral(lateral);
      metrics.reset(); lastRenderMs = null; pendingResponse = {};
      sceneRefs?.player?.playAnimation('idle', 0.1, true);
      needsRender = true;
      publish();
    },

    beginRun(difficulty = 1) {
      if (mode !== 'game' || hasStarted || !sceneRefs || !canBegin()) return false;
      startingDifficulty = Number.isFinite(difficulty) ? Math.min(5, Math.max(1, Math.round(difficulty))) : 1;
      game = restartGame(game, rules); resetMovementTallies(); input.reset();
      hasStarted = true; pauseReason = null; runSteps = runMovements = 0;
      metrics.reset(); lastRenderMs = null; pendingResponse = {};
      lastGameMs = performance.now(); needsRender = true; setStatus('Playing. Move at a comfortable pace.'); publish();
      return true;
    },

    pause() { pauseRun('manual'); },

    resume() {
      if (mode !== 'game' || !hasStarted || game.isOver || pauseReason === null || document.hidden) return false;
      if (!isCameraSkipped && (!isPoseRunning || !lateral.hasBody || !lateral.isCalibrated || !kneesVisible
        || lastValidPoseMs === null || performance.now() - lastValidPoseMs > 1000)) return false;
      pauseReason = null; input.clearPose();
      if (!isCameraSkipped) { input.setPose(lateral.label, jog.isJogging, handsOnHips.isActive, jog.cadenceSpm, jog.stepCount); input.read(); }
      lastGameMs = performance.now(); lastRenderMs = null; needsRender = true; publish(); return true;
    },

    finish() {
      if (mode !== 'game' || !hasStarted || game.isOver) return;
      game = { ...game, isOver: true, isFiring: false, speed: 0, deathReason: null,
        isCleared: game.elapsedMs >= CONFIG.game.goalMs };
      pauseReason = null; input.clearPose(); pendingResponse = {}; needsRender = true; publish();
    },

    setCharacter(charId: string) {
      return applyCharacter(charId);
    },

    setGraphicsQuality(quality: ShadowQuality) {
      if (isDisposed) return;
      pendingQuality = quality;
      qualityMonitor.reset();
      frameBudget.reset();
      sceneRefs?.setQuality(quality);
      testScene?.setQuality(quality);
      needsRender = true;
      publish();
    },

    getRunSummary(): RunSummary {
      return {
        biomeId: BIOMES[0]!.id,
        stageNumber: TRAINING_STAGE_NUMBER,
        score: game.score,
        enemiesKilled: game.killCount,
        durationMs: Math.round(game.elapsedMs),
        distanceM: Math.round(game.distance),
        movementCount: movementTotal(),
        isCleared: game.isCleared,
        stepCount: runSteps,
        movementMs: Math.round(game.movementMs),
        goalReached: game.elapsedMs >= CONFIG.game.goalMs,
        metrics: metrics.snapshot(),
      };
    },

    getSnapshot() {
      return snapshot;
    },

    subscribe(onChange: () => void) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },

    /**
     * Everything the prototype leaked. Called from a React effect cleanup, so it
     * has to be safe to call twice and safe to call mid-load.
     */
    dispose() {
      if (isDisposed) return;
      isDisposed = true;
      releaseCamera();

      if (gameFrameId !== null) {
        cancelAnimationFrame(gameFrameId);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      gameFrameId = null;
      detachKeyboard?.();
      detachKeyboard = null;
      input.detach();

      resizeObserver?.disconnect();
      resizeObserver = null;
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;

      sceneRefs?.dispose();
      sceneRefs = null;
      testScene?.dispose(); testScene = null;

      exposure.dispose();

      listeners.clear();
      delete (window as unknown as { __lane?: unknown }).__lane;
    },
  };

  /** จำนวนการเคลื่อนไหว: every move the detectors counted this session. */
  function movementTotal(): number {
    return hasStarted ? runMovements : jog.stepCount + lateralChangeCount + clap.clapCount + handsOnHips.holdCount;
  }

  function resetPoseHolds(): void {
    clap = { ...createClapState(), clapCount: clap.clapCount };
    handsOnHips = { ...createHandsOnHipsState(), holdCount: handsOnHips.holdCount };
  }

  function releaseCamera(): void {
    pausePractice('Camera stopped');
    if (mode === 'test') diagnostics.append('lifecycle', 'camera-released');
    cameraRequestId += 1;
    cameraAbortController?.abort();
    cameraAbortController = null;
    isCameraStarting = false;
    isPoseRunning = false;
    lastValidPoseMs = null;
    lastPoseReceivedMs = null;
    if (mode === 'test') {
      game = { ...game, speed: 0, isFiring: false, isShielding: false, jumpStartedMs: null, jumpHeight: 0, bullets: [] };
      needsRender = true;
    }
    lateral = createLateralState(); jog = { ...createJogState(), stepCount: jog.stepCount };
    cancelPoseFrame();
    stopCamera(stream);
    if (stream && els.video.srcObject === stream) {
      els.video.pause();
      els.video.srcObject = null;
    }
    stream = null;
    closePose();
    input.clearPose();
    resetPoseHolds();
    lastVideoTime = -1;
    lastPoseMs = null;
    lastFrameMs = 0;
    smoothedFps = null;
    smoothedInferenceMs = null;
    delegate = null;
    poseModel = null;
    cameraLabel = null;
    shoulderWidth = null;
    kneesVisible = false;
    luma = null;
    if (ctx) clearOverlay(ctx);
  }

  function resetMovementTallies(): void {
    drowning = createDrowningPresentation();
    sceneRefs?.riverMask.hide();
    sceneRefs?.drowningSplash.update(false, 0, 0, 0);
    sceneRefs?.enemyPool.reset();
    sceneRefs?.bulletPool.reset();
    if (sceneRefs) sceneRefs.lastEventsMs = -1;
    clap = createClapState(); jog = createJogState();
    runSteps = runMovements = 0;
    handsOnHips = { ...handsOnHips, holdCount: 0 };
    lateralChangeCount = 0;
    lastCountedLateral = LATERAL.CENTER;
    movementMs = 0;
    lastPoseMs = null;
  }

  function cancelPoseFrame(): void {
    if (poseFrameId === null) return;
    // requestVideoFrameCallback hands back its own handle namespace.
    if (typeof els.video.cancelVideoFrameCallback === 'function') {
      els.video.cancelVideoFrameCallback(poseFrameId);
    } else {
      cancelAnimationFrame(poseFrameId);
    }
    poseFrameId = null;
  }
}

export { LATERAL, getDelegate };
