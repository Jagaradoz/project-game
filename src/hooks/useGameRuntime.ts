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
import { createGameRuntime, BIOME_AUTO } from '@/engine/runtime';
import type { GameRuntime, HudSnapshot } from '@/engine/runtime';
import { LATERAL } from '@/engine/detectors/lateral';

/** Stable reference, so a render before the engine exists cannot loop. */
const IDLE_SNAPSHOT: HudSnapshot = {
  score: 0,
  hp: CONFIG.game.maxHp,
  maxHp: CONFIG.game.maxHp,
  distance: 0,
  isOver: false,
  lateralLabel: LATERAL.CENTER,
  lateralOffset: 0,
  isCalibrated: false,
  hasBody: false,
  isJogging: false,
  cadenceSpm: 0,
  stepCount: 0,
  kneeDelta: 0,
  fps: null,
  inferenceMs: null,
  delegate: null,
  poseModel: null,
  cameraLabel: null,
  quality: null,
  isCameraRunning: false,
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
  biome?: string;
}

/** Stable action surface, so components never depend on the runtime existing. */
export interface GameActions {
  startCamera: () => void;
  stopCamera: () => void;
  recalibrate: () => void;
  restart: () => void;
}

export function useGameRuntime(refs: GameRuntimeRefs, options: UseGameRuntimeOptions = {}) {
  const { character, biome } = options;

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

    // Character and biome are deliberately left at their defaults here. The
    // two preference effects below run immediately after this one and apply the
    // player's actual choices, which keeps this effect free of those deps and
    // stops a character change from rebuilding the whole scene.
    const instance = createGameRuntime(
      { gameCanvas, video, overlay, container },
      { seed, biome: BIOME_AUTO },
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
  }, [refs.container, refs.gameCanvas, refs.overlay, refs.video]);

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
    if (biome) runtimeRef.current?.setBiome(biome);
  }, [biome]);

  const actions = useMemo<GameActions>(
    () => ({
      startCamera: () => void runtimeRef.current?.startCamera(),
      stopCamera: () => runtimeRef.current?.stopCamera(),
      recalibrate: () => runtimeRef.current?.recalibrate(),
      restart: () => runtimeRef.current?.restart(),
    }),
    [],
  );

  return { actions, snapshot };
}

export type { HudSnapshot };
