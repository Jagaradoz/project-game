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
import { createGameState, restartGame, updateGame } from '@/engine/core/state';
import { createDrowningPresentation, updateDrowningPresentation } from '@/engine/core/drowning';
import { TRAINING_STAGE_NUMBER, resolveTrainingRules } from '@/engine/core/stage';
import { createInput } from '@/engine/core/input';
import { createJogState, updateJog } from '@/engine/detectors/jog';
import { createJumpState, updateJump } from '@/engine/detectors/jump';
import { createArmsUpState, updateArmsUp } from '@/engine/detectors/armsUp';
import { createHandsOnHipsState, updateHandsOnHips } from '@/engine/detectors/handsOnHips';
import {
  LATERAL,
  createLateralState,
  recalibrateLateral,
  updateLateral,
} from '@/engine/detectors/lateral';
import { describeCameraError, startCamera, stopCamera } from '@/engine/pose/camera';
import { closePose, detect, getDelegate, initPose } from '@/engine/pose/pose';
import type { PoseDelegate } from '@/engine/pose/pose';
import { clearOverlay, drawSkeleton, resizeOverlay } from '@/engine/pose/draw';
import { createExposureSampler } from '@/engine/pose/exposure';
import { ema } from '@/engine/util/smooth';
import { measureBody } from '@/engine/util/landmarks';
import { createScene } from '@/engine/render/scene';
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
  StageRules,
  DeathReason,
  TrailHazard,
} from '@/engine/types';

/**
 * Auto quality. Pose inference and the 3D scene share one machine, and the
 * shadow pass is the cheapest thing to give back, so a device that cannot hold a
 * smooth frame loses shadow resolution before anything else. Sampled once, after
 * a warm-up long enough for shader compilation to settle.
 */
const QUALITY_WARMUP_FRAMES = 40;
const QUALITY_SAMPLE_FRAMES = 120;
const QUALITY_MEDIUM_FPS = 45;
const QUALITY_LOW_FPS = 26;

/** Simulated tail during which the screenshot harness also syncs the view. */
const SIM_SYNC_TAIL_MS = 1500;

/** A HUD does not need 60 Hz. Anything not in FORCE_EMIT_KEYS waits for this. */
const SNAPSHOT_INTERVAL_MS = 100;

/**
 * 'game' is the full runner. 'pose' runs the camera and the detectors and
 * nothing else -- no WebGL context, no reducer, no keyboard.
 *
 * /calibrate and /practice both need pose detection with no game around it, and
 * neither should pay for a renderer. The control-group mode in TOR 3
 * (การประเมินแรงจูงใจ) additionally REQUIRES the absence of game elements, so
 * this is a correctness boundary there, not only an optimisation.
 */
export type RuntimeMode = 'game' | 'pose';

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
  mode?: RuntimeMode;
  onError?: (message: string) => void;
}

export interface HudSnapshot {
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
  bossMaxHp: number;
  bossDefeated: boolean;
  bossWarningLane: number | null;
  score: number;
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
   * detected these -- it is not a calibrated energy figure, and
   * src/types/api.ts keeps that distinction too.
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

/** Changes a player would notice immediately; these bypass the throttle. */
const FORCE_EMIT_KEYS: (keyof HudSnapshot)[] = [
  'score',
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
  'status',
  'error',
];

export interface GameRuntime {
  jump(): void;
  start(): void;
  startCamera(): Promise<void>;
  stopCamera(): void;
  skipCamera(): void;
  recalibrate(): void;
  setDevFire(active: boolean): void;
  restart(): void;
  setCharacter(charId: string): Promise<void>;
  /** What /result submits. Read after the run ends. */
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

  const rules: StageRules = rulesFor(mode);

  let game: GameState = createGameState(options.seed ?? 1, rules);
  let drowning = createDrowningPresentation();
  let previewPaused = false;
  let lateral: LateralState = createLateralState();
  let jog: JogState = createJogState();
  let jump = createJumpState();
  let armsUp = createArmsUpState();
  let handsOnHips = createHandsOnHipsState();
  const input = createInput();

  let sceneRefs: SceneRefs | null = null;
  let stream: MediaStream | null = null;
  let connections: PoseConnection[] = [];

  let isDisposed = false;
  let isPoseRunning = false;
  let isCameraSkipped = false;
  let isCameraStarting = false;
  let cameraRequestId = 0;
  let gameFrameId: number | null = null;
  let poseFrameId: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let detachKeyboard: (() => void) | null = null;
  let onResize: (() => void) | null = null;

  let lastGameMs = 0;
  let lastVideoTime = -1;
  let lastFrameMs = 0;
  let smoothedFps: number | null = null;
  let smoothedInferenceMs: number | null = null;

  let qualityFrames = 0;
  let qualityTotalMs = 0;

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
  let actorsVisible = true;

  /**
   * The config this run steps under. The game plays Training; pose mode has
   * no reducer to feed, so it keeps the goal-less endless config.
   */
  function rulesFor(runMode: RuntimeMode): StageRules {
    if (runMode === 'game') return resolveTrainingRules();
    return { ...CONFIG.game, goalKills: Number.POSITIVE_INFINITY };
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
    return {
      score: game.score,
      jumpCount: jump.jumpCount,
      armRaiseCount: armsUp.raiseCount,
      hipsHoldCount: handsOnHips.holdCount,
      isHandsOnHips: handsOnHips.isActive,
      isShielding: game.isShielding,
      sporeDistance: sporeDistanceAhead(),
      isInSpore: game.isInSpore,
      feetVisible: jump.feetVisible,
      isJumpCalibrated: jump.isCalibrated,
      isAirborne: game.jumpStartedMs !== null,
      obstacleDistance: nearest && !game.isOver ? Math.max(0, rules.playerZ - nearest.z) : null,
      obstacleKind: nearest?.kind ?? null,
      obstacleOpenLane: nearest?.laneCount === 2 ? nearest.startLane === 0 ? 2 : 0 : null,
      deathReason: game.deathReason,
      endPresentationComplete: drowning.complete,
      bossHp: game.enemies.find(e => e.kind === 'boss')?.hp ?? null,
      bossMaxHp: rules.enemyTypes.boss.hp,
      bossDefeated: game.bossDefeated,
      bossWarningLane: game.bossWarningLane,
      hp: game.hp,
      maxHp: rules.maxHp,
      distance: game.distance,
      isOver: game.isOver,

      killCount: game.killCount,
      goalKills: Number.isFinite(rules.goalKills) ? rules.goalKills : null,
      isCleared: game.isCleared,
      elapsedMs: game.elapsedMs,
      movementCount: movementTotal(),
      lateralChangeCount,
      movementMs,

      lateralLabel: lateral.label,
      lateralOffset: lateral.offset,
      isCalibrated: lateral.isCalibrated,
      hasBody: lateral.hasBody,
      isJogging: jog.isJogging,
      cadenceSpm: jog.cadenceSpm,
      stepCount: jog.stepCount,
      kneeDelta: jog.kneeDelta,

      shoulderWidth,
      kneesVisible,
      luma,

      fps: smoothedFps,
      inferenceMs: smoothedInferenceMs,
      delegate,
      poseModel,
      cameraLabel,
      quality: sceneRefs?.quality ?? null,

      isCameraRunning: isPoseRunning,
      isCameraSkipped,
      isSceneReady: sceneRefs !== null,
      status,
      error: errorMessage,
    };
  }

  /**
   * Rebuilds the snapshot only when something actually changed, so
   * getSnapshot() stays referentially stable and React does not loop.
   */
  function publish(nowMs = 0): void {
    if (isDisposed) return;
    const next = buildSnapshot();

    const forced = FORCE_EMIT_KEYS.some((key) => next[key] !== snapshot[key]);
    if (!forced && nowMs - lastEmitMs < SNAPSHOT_INTERVAL_MS) return;

    lastEmitMs = nowMs;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function setStatus(text: string): void {
    status = text;
    publish();
  }

  function setError(message: string | null): void {
    errorMessage = message;
    if (message) options.onError?.(message);
    publish();
  }

  /* ------------------------------------------------------- game loop ------ */

  function gameFrame(nowMs: number): void {
    if (isDisposed) return;

    const dtMs = nowMs - lastGameMs;
    lastGameMs = nowMs;

    // The run waits for pose tracking or the explicit dev bypass. The scene
    // still paints behind the dialog and remains available to tools/shot.mjs.
    const isPlaying = isPoseRunning || isCameraSkipped;
    const stepMs = isPlaying ? dtMs : 0;
    if (isPlaying && !previewPaused) {
      sampleQuality(dtMs);
      game = updateGame(game, input.read(), dtMs, rules);
    }

    drowning = updateDrowningPresentation(drowning, game.deathReason, previewPaused ? 0 : dtMs, rules.obstacle.drowningMs);
    if (sceneRefs) {
      syncScene(sceneRefs, game, previewPaused ? 0 : stepMs, rules, actorsVisible, drowning);
      sceneRefs.render();
    }

    publish(nowMs);
    gameFrameId = requestAnimationFrame(gameFrame);
  }

  function sampleQuality(dtMs: number): void {
    if (qualityFrames > QUALITY_WARMUP_FRAMES + QUALITY_SAMPLE_FRAMES) return;

    qualityFrames += 1;
    if (qualityFrames <= QUALITY_WARMUP_FRAMES) return;

    qualityTotalMs += dtMs;
    if (qualityFrames <= QUALITY_WARMUP_FRAMES + QUALITY_SAMPLE_FRAMES) return;

    const averageFps = 1000 / (qualityTotalMs / QUALITY_SAMPLE_FRAMES);
    if (averageFps >= QUALITY_MEDIUM_FPS) return;

    sceneRefs?.setQuality(averageFps < QUALITY_LOW_FPS ? 'low' : 'medium');
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
    if (!isPoseRunning || isDisposed) return;
    const nowMs = performance.now();

    const hasFrame =
      els.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      els.video.currentTime !== lastVideoTime;

    if (hasFrame) {
      lastVideoTime = els.video.currentTime;
      processFrame(nowMs);
      updateFps(nowMs);
      publish(nowMs);
    }

    schedulePoseFrame();
  }

  function processFrame(nowMs: number): void {
    resizeOverlay(els.overlay, els.video);

    const { landmarks, inferenceMs } = detect(els.video, nowMs);
    smoothedInferenceMs = ema(smoothedInferenceMs, inferenceMs, CONFIG.fps.smoothing);

    lateral = updateLateral(lateral, landmarks, nowMs);
    jog = updateJog(jog, landmarks, nowMs);
    jump = updateJump(jump, landmarks, nowMs);
    armsUp = updateArmsUp(armsUp, landmarks, nowMs);
    handsOnHips = updateHandsOnHips(handsOnHips, landmarks, nowMs);

    trackCalibrationReadouts(landmarks as PoseLandmarks | null, nowMs);
    trackMovement(nowMs);

    // The game reads this snapshot from its own loop; it never runs inference.
    if (!landmarks || !lateral.isCalibrated) {
      input.clearPose();
    } else {
      input.setPose(lateral.label, jog.isJogging, handsOnHips.isActive);
      // Raising both arms is the low-impact jump; the body hop still works.
      if (jump.justJumped || armsUp.justRaised) input.requestJump();
    }

    if (ctx) {
      clearOverlay(ctx);
      drawSkeleton(ctx, landmarks as PoseLandmarks | null, connections);
    }
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
      const refs = await createScene(els.gameCanvas);

      // Disposed while the scene was loading: throw it away rather than
      // attaching a renderer nobody will ever tear down.
      if (isDisposed) {
        refs.dispose();
        return;
      }

      sceneRefs = refs;
      await applyCharacter(pendingCharacter);
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
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => sceneRefs?.resize());
      resizeObserver.observe(els.container);
      return;
    }
    onResize = () => sceneRefs?.resize();
    window.addEventListener('resize', onResize);
  }

  /** Loads a character and re-skins the projectiles to match their weapon. */
  async function applyCharacter(charId: string): Promise<void> {
    pendingCharacter = Object.hasOwn(CONFIG.game.characters, charId) ? charId : CONFIG.game.defaultCharacter;
    if (!sceneRefs) return;
    await sceneRefs.player.loadCharacter(pendingCharacter);
    if (isDisposed) return;
    sceneRefs.bulletPool.setCharacter(charId);
  }

  /* ------------------------------------------------------- test hook ------ */

  /**
   * Dev hook for tools/shot.mjs. The headless harness needs to know when the
   * scene has finished loading, to jump the run forward to photograph a later
   * stretch of trail, and to read renderer.info for the draw-call budget.
   *
   * Development only. `warpTo` and `simulate` drive the real reducer, so in a
   * production build this would be a one-line path to an arbitrary score right
   * before the run is submitted. The harness is documented to run against
   * `npm run dev`, so gating it costs nothing. Note that this is defence in
   * depth, not a control: a determined player can forge the request anyway,
   * which is why src/types/api.ts tells the backend to re-derive the score.
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
      simulate(seconds: number, simOptions: { lane?: number; firing?: boolean; jump?: boolean } = {}) {
        const stepMs = 1000 / 60;
        const steps = Math.max(0, Math.round(((Number(seconds) || 0) * 1000) / stepMs));
        for (let step = 0; step < steps; step += 1) {
          game = updateGame(
            game,
            { lane: simOptions.lane ?? game.lane, isFiring: simOptions.firing !== false, jump: step === 0 && simOptions.jump },
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
          bossWarningLane: game.bossWarningLane,
          hp: game.hp,
          score: game.score,
          calls: info?.calls ?? null,
          tris: info?.triangles ?? null,
          quality: sceneRefs?.quality ?? null,
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

      // Pose mode has no scene and no game: /calibrate and /practice want the
      // detectors alone. startCamera() drives the pose loop from there.
      if (mode === 'pose') {
        setStatus('Ready to start the camera.');
        return;
      }

      if (gameFrameId !== null) return;
      detachKeyboard = input.attachKeyboard();
      void bootScene();
      lastGameMs = performance.now();
      gameFrameId = requestAnimationFrame(gameFrame);
    },

    async startCamera() {
      if (isDisposed || isPoseRunning || isCameraStarting) return;
      isCameraStarting = true;
      const requestId = ++cameraRequestId;
      setError(null);

      try {
        setStatus('Requesting camera...');
        const camera = await startCamera(els.video);
        if (isDisposed || requestId !== cameraRequestId) {
          stopCamera(camera.stream);
          return;
        }
        stream = camera.stream;
        cameraLabel = `${camera.width}x${camera.height}`;

        setStatus(`Loading pose model (${CONFIG.pose.model})...`);
        const pose = await initPose();
        if (isDisposed || requestId !== cameraRequestId) {
          closePose();
          return;
        }

        connections = pose.connections;
        delegate = pose.delegate;
        poseModel = pose.model;

        isPoseRunning = true;
        isCameraSkipped = false;
        setStatus('Running. Stand still with both feet visible to calibrate centre and jumping.');
        schedulePoseFrame();
      } catch (error) {
        if (isDisposed || requestId !== cameraRequestId) return;
        setError(describeCameraError(error));
        setStatus('Stopped.');
        console.error(error);
      } finally {
        isCameraStarting = false;
      }
    },

    stopCamera() {
      resetPoseHolds();
      cameraRequestId += 1;
      isPoseRunning = false;
      cancelPoseFrame();
      stopCamera(stream);
      stream = null;
      input.clearPose();
      lastVideoTime = -1;
      setStatus('Camera stopped.');
    },

    skipCamera() {
      if (process.env.NODE_ENV === 'production' || isDisposed || mode !== 'game') return;
      cameraRequestId += 1;
      isPoseRunning = false;
      cancelPoseFrame();
      stopCamera(stream);
      stream = null;
      input.clearPose();
      isCameraSkipped = true;
      setError(null);
      setStatus('Development mode: keyboard controls, camera off.');
    },

    recalibrate() {
      resetPoseHolds();
      lateral = recalibrateLateral(lateral);
      setStatus('Recalibrating centre and jumping — stand still with both feet visible.');
    },

    setDevFire(active: boolean) {
      if (!isDisposed && mode === 'game') input.setDevFire(active);
    },

    jump() { if (!isDisposed && mode === 'game') input.requestJump(); },

    restart() {
      previewPaused = false;
      game = restartGame(game, rules);
      input.reset();
      resetMovementTallies();
      sceneRefs?.player?.playAnimation('run', 0.1, true);
      publish();
    },

    setCharacter(charId: string) {
      return applyCharacter(charId);
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
      cameraRequestId += 1;
      isPoseRunning = false;

      if (gameFrameId !== null) cancelAnimationFrame(gameFrameId);
      gameFrameId = null;
      cancelPoseFrame();

      stopCamera(stream);
      stream = null;
      closePose();

      detachKeyboard?.();
      detachKeyboard = null;
      input.detach();

      resizeObserver?.disconnect();
      resizeObserver = null;
      if (onResize) window.removeEventListener('resize', onResize);
      onResize = null;

      sceneRefs?.dispose();
      sceneRefs = null;

      exposure.dispose();

      listeners.clear();
      delete (window as unknown as { __lane?: unknown }).__lane;
    },
  };

  /** จำนวนการเคลื่อนไหว: every move the detectors counted this session. */
  function movementTotal(): number {
    return jog.stepCount + lateralChangeCount + jump.jumpCount + armsUp.raiseCount + handsOnHips.holdCount;
  }

  function resetPoseHolds(): void {
    jump = { ...createJumpState(), jumpCount: jump.jumpCount };
    armsUp = { ...createArmsUpState(), raiseCount: armsUp.raiseCount };
    handsOnHips = { ...createHandsOnHipsState(), holdCount: handsOnHips.holdCount };
  }

  function resetMovementTallies(): void {
    drowning = createDrowningPresentation();
    sceneRefs?.riverMask.hide();
    sceneRefs?.drowningSplash.update(false, 0, 0, 0);
    sceneRefs?.enemyPool.reset();
    sceneRefs?.bulletPool.reset();
    if (sceneRefs) sceneRefs.lastEventsMs = -1;
    jump = { ...jump, jumpCount: 0, justJumped: false };
    armsUp = { ...armsUp, raiseCount: 0, justRaised: false };
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
