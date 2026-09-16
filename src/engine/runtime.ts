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
import { DEFAULT_DIFFICULTY, resolveStageRules } from '@/engine/core/stage';
import { createInput } from '@/engine/core/input';
import { createJogState, updateJog } from '@/engine/detectors/jog';
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
  StageSelection,
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

export const BIOME_AUTO = 'auto';

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
  biome?: string;
  mode?: RuntimeMode;
  /** Which stage to play. Omitted means an endless run with no goal. */
  stage?: StageSelection;
  onError?: (message: string) => void;
}

export interface HudSnapshot {
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
   * What TOR 3 calls จำนวนการเคลื่อนไหว: jog steps plus lane changes. The system
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
  isSceneReady: boolean;
  status: string;
  error: string | null;
}

/** Changes a player would notice immediately; these bypass the throttle. */
const FORCE_EMIT_KEYS: (keyof HudSnapshot)[] = [
  'score',
  'hp',
  'isOver',
  'isCleared',
  'killCount',
  'isCameraRunning',
  'isSceneReady',
  'status',
  'error',
];

export interface GameRuntime {
  start(): void;
  startCamera(): Promise<void>;
  stopCamera(): void;
  recalibrate(): void;
  restart(): void;
  setCharacter(charId: string): Promise<void>;
  setBiome(choice: string): void;
  /** Retunes the run in place. Restarts it, because difficulty cannot change mid-run. */
  setStage(stage: StageSelection | null): void;
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

  let stage: StageSelection | null = options.stage ?? null;
  let rules: StageRules = rulesFor(stage);

  let game: GameState = createGameState(options.seed ?? 1, rules);
  let lateral: LateralState = createLateralState();
  let jog: JogState = createJogState();
  const input = createInput();

  let sceneRefs: SceneRefs | null = null;
  let stream: MediaStream | null = null;
  let connections: PoseConnection[] = [];

  let isDisposed = false;
  let isPoseRunning = false;
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
  let pendingBiome = options.biome ?? BIOME_AUTO;

  /**
   * The config this run steps under. With no stage selected the goal is absent,
   * which is what keeps the endless runner (and /practice) working unchanged.
   */
  function rulesFor(selection: StageSelection | null): StageRules {
    if (!selection) return { ...CONFIG.game, goalKills: Number.POSITIVE_INFINITY };

    // BIOMES is the unlock order, and src/lib/api/catalog.ts derives from it --
    // reading it here rather than importing the catalogue keeps the engine free
    // of any dependency on the app layer.
    const index = BIOMES.findIndex((entry) => entry.id === selection.biomeId);
    return resolveStageRules(
      Math.max(0, index),
      selection.stageNumber,
      selection.difficulty ?? DEFAULT_DIFFICULTY,
    );
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

  function buildSnapshot(): HudSnapshot {
    return {
      score: game.score,
      hp: game.hp,
      maxHp: rules.maxHp,
      distance: game.distance,
      isOver: game.isOver,

      killCount: game.killCount,
      goalKills: Number.isFinite(rules.goalKills) ? rules.goalKills : null,
      isCleared: game.isCleared,
      elapsedMs: game.elapsedMs,
      movementCount: jog.stepCount + lateralChangeCount,
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

    sampleQuality(dtMs);
    game = updateGame(game, input.read(), dtMs, rules);

    if (sceneRefs) {
      syncScene(sceneRefs, game, dtMs);
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

    trackCalibrationReadouts(landmarks as PoseLandmarks | null, nowMs);
    trackMovement(nowMs);

    // The game reads this snapshot from its own loop; it never runs inference.
    if (!landmarks || !lateral.isCalibrated) {
      input.clearPose();
    } else {
      input.setPose(lateral.label, jog.isJogging);
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
        refs.renderer.dispose();
        return;
      }

      sceneRefs = refs;
      await applyCharacter(pendingCharacter);
      applyBiome(pendingBiome);
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
    pendingCharacter = charId;
    if (!sceneRefs) return;
    await sceneRefs.player.loadCharacter(charId);
    if (isDisposed) return;
    sceneRefs.bulletPool.setProjectile(sceneRefs.player.projectile);
  }

  function applyBiome(choice: string): void {
    pendingBiome = choice;
    const isKnown = BIOMES.some((biome) => biome.id === choice);
    sceneRefs?.setBiomeOverride(choice === BIOME_AUTO || !isKnown ? null : choice);
  }

  /* ------------------------------------------------------- test hook ------ */

  /**
   * Dev hook for tools/shot.mjs. The headless harness needs to know when the
   * scene has finished loading, to jump the run forward to photograph a later
   * biome, and to read renderer.info for the draw-call budget.
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
      setBiome(choice: string) {
        applyBiome(choice);
      },
      restart() {
        game = restartGame(game, rules);
        input.reset();
        resetMovementTallies();
        sceneRefs?.player?.playAnimation('run', 0.1, true);
        publish();
      },
      /**
       * Steps the real reducer at a fixed timestep. Software rendering is far
       * too slow to reach an interesting moment in wall-clock time, and this
       * drives the actual game logic, so what gets photographed is a state the
       * game can really be in.
       */
      simulate(seconds: number, simOptions: { lane?: number; firing?: boolean } = {}) {
        const stepMs = 1000 / 60;
        const steps = Math.max(0, Math.round(((Number(seconds) || 0) * 1000) / stepMs));
        for (let step = 0; step < steps; step += 1) {
          game = updateGame(
            game,
            { lane: simOptions.lane ?? game.lane, isFiring: simOptions.firing !== false },
            stepMs,
          );
          // Sync the view too, or per-frame visuals the reducer only reports
          // once -- deaths, hit bursts -- are stepped straight past. Only for
          // the tail: syncScene walks every scatter instance.
          const remainingMs = (steps - step) * stepMs;
          if (sceneRefs && remainingMs < SIM_SYNC_TAIL_MS) syncScene(sceneRefs, game, stepMs);
        }
      },
      summary() {
        const info = sceneRefs?.renderer?.info?.render;
        const player = sceneRefs?.player;
        return {
          dist: Math.round(game.distance),
          hp: game.hp,
          score: game.score,
          calls: info?.calls ?? null,
          tris: info?.triangles ?? null,
          quality: sceneRefs?.quality ?? null,
          corpses: sceneRefs?.enemyPool?.corpses?.filter((c) => c.group.visible).length ?? 0,
          character: player?.characterId ?? null,
          biome: pendingBiome,
          anim: player?.currentActionName ?? null,
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
      if (isDisposed || isPoseRunning) return;
      setError(null);

      try {
        setStatus('Requesting camera...');
        const camera = await startCamera(els.video);
        if (isDisposed) {
          stopCamera(camera.stream);
          return;
        }
        stream = camera.stream;
        cameraLabel = `${camera.width}x${camera.height}`;

        setStatus(`Loading pose model (${CONFIG.pose.model})...`);
        const pose = await initPose();
        if (isDisposed) return;

        connections = pose.connections;
        delegate = pose.delegate;
        poseModel = pose.model;

        isPoseRunning = true;
        setStatus('Running. Stand still for a second to calibrate center.');
        schedulePoseFrame();
      } catch (error) {
        setError(describeCameraError(error));
        setStatus('Stopped.');
        console.error(error);
      }
    },

    stopCamera() {
      isPoseRunning = false;
      cancelPoseFrame();
      stopCamera(stream);
      stream = null;
      input.clearPose();
      lastVideoTime = -1;
      setStatus('Camera stopped.');
    },

    recalibrate() {
      lateral = recalibrateLateral(lateral);
      setStatus('Recalibrating center -- stand still for a second.');
    },

    restart() {
      game = restartGame(game, rules);
      input.reset();
      resetMovementTallies();
      sceneRefs?.player?.playAnimation('run', 0.1, true);
      publish();
    },

    setCharacter(charId: string) {
      return applyCharacter(charId);
    },

    setBiome(choice: string) {
      applyBiome(choice);
    },

    setStage(next: StageSelection | null) {
      stage = next;
      rules = rulesFor(next);
      // Difficulty changes HP and spawn rate, which cannot be applied to a run
      // already in progress without making the result meaningless.
      game = createGameState(game.seed, rules);
      input.reset();
      resetMovementTallies();
      publish();
    },

    getRunSummary(): RunSummary {
      return {
        biomeId: stage?.biomeId ?? BIOMES[0]!.id,
        stageNumber: stage?.stageNumber ?? 1,
        difficulty: stage?.difficulty ?? DEFAULT_DIFFICULTY,
        score: game.score,
        enemiesKilled: game.killCount,
        durationMs: Math.round(game.elapsedMs),
        distanceM: Math.round(game.distance),
        movementCount: jog.stepCount + lateralChangeCount,
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

      sceneRefs?.renderer.dispose();
      sceneRefs = null;

      exposure.dispose();

      listeners.clear();
      delete (window as unknown as { __lane?: unknown }).__lane;
    },
  };

  function resetMovementTallies(): void {
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
