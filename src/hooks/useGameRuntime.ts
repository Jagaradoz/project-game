'use client';

/**
 * The single seam between React and the engine.
 *
 * React owns nothing that changes at 60 Hz: the runtime pushes a throttled
 * snapshot, and useSyncExternalStore turns that into renders. The engine's own
 * requestAnimationFrame loops never touch React at all.
 *
 * The runtime lives in a ref, not in state. Creating it is a side effect, and
 * setState inside an effect would cascade a second render on every mount; the
 * store below is stable for the life of the component instead, so `subscribe`
 * and `getSnapshot` never change identity.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useSyncExternalStore } from 'react';

import { CONFIG } from '@/engine/config';
import { createGameRuntime } from '@/engine/runtime';
import type { GameRuntime, HudSnapshot, RuntimeMode } from '@/engine/runtime';
import { LATERAL } from '@/engine/detectors/lateral';
import type { RunSummary, ShadowQuality } from '@/engine/types';

/** Stable reference, so a render before the engine exists cannot loop. */
const IDLE_SNAPSHOT: HudSnapshot = {
  clapCount: 0, speed: 0, difficulty: 1, goalReached: false, hasStarted: false, canBegin: false, pauseReason: null,
  rehearsal: { left: false, right: false, knees: false, hips: false, clap: false }, poseFps: null, renderFps: null, processingMs: null,
  metrics: { latencyMeanMs: null, latencyP95Ms: null, latencyMinMs: null, latencyMaxMs: null, latencySamples: 0,
    fpsMean: null, firstMinuteFps: null, lastMinuteFps: null, fpsDeclinePercent: null, bodyLossIncidents: 0 },
  jumpCount: 0, armRaiseCount: 0, hipsHoldCount: 0, isHandsOnHips: false, isShielding: false,
  sporeDistance: null, isInSpore: false,
  feetVisible: false, isJumpCalibrated: false, isAirborne: false,
  obstacleDistance: null, bossHp: null, enemyHp: null, enemyMaxHp: null, bossMaxHp: CONFIG.game.enemyTypes.boss.hp,
  obstacleKind: null, obstacleOpenLane: null, deathReason: null, endPresentationComplete: true,
  bossDefeated: false,
  score: 0,
  comboHits: 0,
  comboMultiplier: 1,
  hp: CONFIG.game.maxHp,
  maxHp: CONFIG.game.maxHp,
  distance: 0,
  isOver: false,
  killCount: 0,
  goalKills: null,
  isCleared: false,
  elapsedMs: 0,
  movementCount: 0,
  lateralChangeCount: 0,
  movementMs: 0,
  lateralLabel: LATERAL.CENTER,
  lateralOffset: 0,
  isCalibrated: false,
  hasBody: false,
  isJogging: false,
  cadenceSpm: 0,
  stepCount: 0,
  kneeDelta: 0,
  shoulderWidth: null,
  kneesVisible: false,
  luma: null,
  fps: null,
  inferenceMs: null,
  delegate: null,
  poseModel: null,
  cameraLabel: null,
  quality: null,
  isCameraRunning: false,
  isCameraSkipped: false,
  isSceneReady: false,
  status: 'Idle.',
  error: null,
};

export interface GameRuntimeRefs {
  gameCanvas: RefObject<HTMLCanvasElement | null>;
  video: RefObject<HTMLVideoElement | null>;
  overlay: RefObject<HTMLCanvasElement | null>;
  container: RefObject<HTMLElement | null>;
}

export interface UseGameRuntimeOptions {
  character?: string;
  graphicsQuality?: ShadowQuality;
  /** 'pose' skips the renderer and the reducer -- see RuntimeMode. */
  mode?: RuntimeMode;
}

/** Stable action surface, so components never depend on the runtime existing. */
export interface GameActions {
  beginRun: (difficulty?: number) => boolean;
  pause: () => void;
  resume: () => boolean;
  finish: () => void;
  jump: () => void;
  startCamera: () => Promise<boolean>;
  stopCamera: () => void;
  skipCamera: () => void;
  recalibrate: () => void;
  setDevFire: (active: boolean) => void;
  restart: () => void;
  /** Null when the engine is not mounted, so callers must handle its absence. */
  getRunSummary: () => RunSummary | null;
}

export function useGameRuntime(refs: GameRuntimeRefs, options: UseGameRuntimeOptions = {}) {
  const { character, graphicsQuality, mode = 'game' } = options;
  const initialQuality = useRef(graphicsQuality);

  const runtimeRef = useRef<GameRuntime | null>(null);
  const snapshotRef = useRef<HudSnapshot>(IDLE_SNAPSHOT);
  const listenersRef = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    const gameCanvas = refs.gameCanvas.current;
    const video = refs.video.current;
    const overlay = refs.overlay.current;
    const container = refs.container.current;
    if (!gameCanvas || !video || !overlay || !container) return;

    // A fresh seed per mount, read here rather than at module scope: a value
    // baked in during a server render would not match the client's.
    const seed = Math.floor(Math.random() * 2 ** 32) >>> 0;

    // Character is deliberately left at its default here. The preference
    // effect below runs immediately after this one and applies the player's
    // actual choice, which keeps this effect free of those deps and
    // stops a character change from rebuilding the whole scene.
    const instance = createGameRuntime(
      { gameCanvas, video, overlay, container },
      { seed, mode, graphicsQuality: initialQuality.current },
    );

    runtimeRef.current = instance;
    const listeners = listenersRef.current;

    const notify = () => {
      snapshotRef.current = instance.getSnapshot();
      for (const listener of listeners) listener();
    };

    const unsubscribe = instance.subscribe(notify);
    instance.start();
    notify();

    // Strict Mode mounts twice on purpose. This is what makes that survivable:
    // one WebGL context, one camera stream, one loop -- every time.
    return () => {
      unsubscribe();
      instance.dispose();
      runtimeRef.current = null;
      snapshotRef.current = IDLE_SNAPSHOT;
      for (const listener of listeners) listener();
    };
  }, [mode, refs.container, refs.gameCanvas, refs.overlay, refs.video]);

  const subscribe = useCallback((onChange: () => void) => {
    const listeners = listenersRef.current;
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  const getSnapshot = useCallback(() => snapshotRef.current, []);
  const getServerSnapshot = useCallback(() => IDLE_SNAPSHOT, []);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Preference changes reach the live engine without remounting it.
  useEffect(() => {
    if (character) void runtimeRef.current?.setCharacter(character);
  }, [character]);

  useEffect(() => {
    if (graphicsQuality) runtimeRef.current?.setGraphicsQuality(graphicsQuality);
  }, [graphicsQuality]);

  const actions = useMemo<GameActions>(
    () => ({
      beginRun: (difficulty) => runtimeRef.current?.beginRun(difficulty) ?? false,
      pause: () => runtimeRef.current?.pause(),
      resume: () => runtimeRef.current?.resume() ?? false,
      finish: () => runtimeRef.current?.finish(),
      jump: () => runtimeRef.current?.jump(),
      startCamera: () => runtimeRef.current?.startCamera() ?? Promise.resolve(false),
      stopCamera: () => runtimeRef.current?.stopCamera(),
      skipCamera: () => runtimeRef.current?.skipCamera(),
      recalibrate: () => runtimeRef.current?.recalibrate(),
      setDevFire: (active) => runtimeRef.current?.setDevFire(active),
      restart: () => runtimeRef.current?.restart(),
      getRunSummary: () => runtimeRef.current?.getRunSummary() ?? null,
    }),
    [],
  );

  return { actions, snapshot };
}

export type { HudSnapshot };
