/** Wiring: camera -> pose -> detectors -> input, and input -> game -> scene. */

import { CONFIG } from './config.js?v=1.10.0';
import { startCamera, describeCameraError } from './camera.js?v=1.10.0';
import { initPose, detect } from './pose.js?v=1.10.0';
import { resizeOverlay, clearOverlay, drawSkeleton } from './draw.js?v=1.10.0';
import { createLateralState, updateLateral, recalibrateLateral, LATERAL } from './detectors/lateral.js?v=1.10.0';
import { createJogState, updateJog } from './detectors/jog.js?v=1.10.0';
import { ema } from './util/smooth.js?v=1.10.0';
import { createGameState, updateGame, restartGame } from './game/state.js?v=1.10.0';
import { createInput } from './game/input.js?v=1.10.0';
import { createScene } from './game/scene.js?v=1.10.0';
import { BIOMES } from './game/world/biomes.js?v=1.10.0';
import { syncScene } from './game/render.js?v=1.10.0';

const el = {
  video: document.getElementById('video'),
  overlay: document.getElementById('overlay'),
  placeholder: document.getElementById('placeholder'),
  startBtn: document.getElementById('startBtn'),
  calibrateBtn: document.getElementById('calibrateBtn'),
  status: document.getElementById('status'),
  error: document.getElementById('error'),
  lateralValue: document.getElementById('lateralValue'),
  lateralDetail: document.getElementById('lateralDetail'),
  jogValue: document.getElementById('jogValue'),
  jogDetail: document.getElementById('jogDetail'),
  fpsValue: document.getElementById('fpsValue'),
  fpsDetail: document.getElementById('fpsDetail'),
  backendValue: document.getElementById('backendValue'),
  backendDetail: document.getElementById('backendDetail'),
  game: document.getElementById('game'),
  gameCanvas: document.getElementById('gameCanvas'),
  hpBar: document.getElementById('hpBar'),
  scoreValue: document.getElementById('scoreValue'),
  distanceValue: document.getElementById('distanceValue'),
  gameOver: document.getElementById('gameOver'),
  finalScore: document.getElementById('finalScore'),
  restartBtn: document.getElementById('restartBtn'),
  charSelect: document.getElementById('charSelect'),
  biomeSelect: document.getElementById('biomeSelect'),
};

/**
 * Bumped from `lane_runner_char` when the Knight became the default: a stored
 * choice from an older build would otherwise pin returning players to the robot
 * forever.
 */
const CHARACTER_STORAGE_KEY = 'lane_runner_char_v2';
const BIOME_STORAGE_KEY = 'lane_runner_biome';
const BIOME_AUTO = 'auto';
const BIOME_ICONS = {
  forest: '🌲',
  autumn: '🍂',
  highlands: '🪨',
  oasis: '🌵',
};

/**
 * Auto quality. Pose inference and the 3D scene share one machine, and the
 * shadow pass is the most expensive thing we can give back, so a device that
 * cannot hold a smooth frame loses shadow resolution before anything else.
 * Sampled once, after a warm-up long enough for shader compilation to settle.
 */
const QUALITY_WARMUP_FRAMES = 40;
const QUALITY_SAMPLE_FRAMES = 120;
const QUALITY_MEDIUM_FPS = 45;
const QUALITY_LOW_FPS = 26;

/** Simulated tail during which the harness also syncs the view. */
const SIM_SYNC_TAIL_MS = 1500;

const ctx = el.overlay.getContext('2d');

let lateral = createLateralState();
let jog = createJogState();
let connections = [];
let lastVideoTime = -1;
let lastFrameMs = 0;
let smoothedFps = null;
let smoothedInferenceMs = null;
let isRunning = false;

const input = createInput();
let game = createGameState(randomSeed());
let sceneRefs = null;
let lastGameMs = 0;

el.startBtn.addEventListener('click', start);
el.calibrateBtn.addEventListener('click', () => {
  lateral = recalibrateLateral(lateral);
  setStatus('Recalibrating center -- stand still for a second.');
});
el.restartBtn.addEventListener('click', restart);

bootGame();

async function start() {
  el.startBtn.disabled = true;
  hideError();

  try {
    setStatus('Requesting camera...');
    const camera = await startCamera(el.video);

    setStatus(`Loading pose model (${CONFIG.pose.model})...`);
    const pose = await initPose();
    connections = pose.connections;

    el.backendValue.textContent = pose.delegate;
    el.backendDetail.textContent = `${pose.model} model · ${camera.width}×${camera.height}`;
    el.placeholder.hidden = true;
    el.calibrateBtn.disabled = false;

    setStatus('Running. Stand still for a second to calibrate center.');
    isRunning = true;
    scheduleFrame();
  } catch (error) {
    el.startBtn.disabled = false;
    showError(describeCameraError(error));
    setStatus('Stopped.');
    console.error(error);
  }
}

/**
 * requestVideoFrameCallback fires once per decoded camera frame, which avoids
 * re-running inference on identical frames when the display refreshes faster
 * than the camera (a 120 Hz phone against a 30 FPS camera would otherwise burn
 * 4x the inference budget for nothing). rAF is the fallback for Firefox.
 */
function scheduleFrame() {
  if (!isRunning) return;
  if (typeof el.video.requestVideoFrameCallback === 'function') {
    el.video.requestVideoFrameCallback(renderFrame);
  } else {
    requestAnimationFrame(renderFrame);
  }
}

function renderFrame() {
  const nowMs = performance.now();

  if (el.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && el.video.currentTime !== lastVideoTime) {
    lastVideoTime = el.video.currentTime;
    processFrame(nowMs);
    updateFps(nowMs);
  }

  scheduleFrame();
}

function processFrame(nowMs) {
  resizeOverlay(el.overlay, el.video);

  const { landmarks, inferenceMs } = detect(el.video, nowMs);
  smoothedInferenceMs = ema(smoothedInferenceMs, inferenceMs, CONFIG.fps.smoothing);

  lateral = updateLateral(lateral, landmarks, nowMs);
  jog = updateJog(jog, landmarks, nowMs);

  // The game reads this snapshot from its own loop; it never runs inference.
  if (!landmarks || !lateral.isCalibrated) {
    input.clearPose();
  } else {
    input.setPose(lateral.label, jog.isJogging);
  }

  clearOverlay(ctx);
  drawSkeleton(ctx, landmarks, connections);
  renderHud(landmarks);
}

/**
 * The game runs on its own rAF loop rather than inside the pose loop: the camera
 * caps out around 30 FPS, and the road would stutter at that rate on a 60/120 Hz
 * display. It also means the game is playable on the keyboard before -- or
 * without -- the camera ever being granted.
 */
async function bootGame() {
  input.attachKeyboard();
  window.addEventListener('keydown', onGameKey);
  buildHpPips();
  renderGameHud();

  if (el.charSelect) {
    el.charSelect.value = selectedCharacter();
    el.charSelect.addEventListener('change', async (event) => {
      const charId = event.target.value;
      localStorage.setItem(CHARACTER_STORAGE_KEY, charId);
      await applyCharacter(charId);
    });
  }

  buildBiomeOptions();

  try {
    sceneRefs = await createScene(el.gameCanvas);
    await applyCharacter(selectedCharacter());
    applyBiomeChoice(selectedBiome());
  } catch (error) {
    showError('Could not load the 3D renderer. Check the network, then reload.');
    console.error(error);
    return;
  }

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => sceneRefs.resize()).observe(el.game);
  } else {
    window.addEventListener('resize', () => sceneRefs.resize());
  }

  exposeTestHook();

  lastGameMs = performance.now();
  requestAnimationFrame(gameFrame);
}

/**
 * Dev hook for tools/shot.mjs. The headless harness needs to know when the scene
 * has finished loading, needs to jump the run forward to photograph a later
 * biome, and reads renderer.info for the draw-call budget -- none of which is
 * reachable from the outside otherwise.
 */
function exposeTestHook() {
  window.__lane = {
    ready: true,
    warpTo(distance) {
      game = { ...game, distance: Number(distance) || 0 };
    },
    /**
     * Steps the real reducer at a fixed timestep. Software rendering is far too
     * slow to reach an interesting moment in wall-clock time, and a screenshot
     * of an empty road is not worth much -- this drives the actual game logic,
     * so what gets photographed is a state the game can really be in.
     */
    simulate(seconds, options = {}) {
      const stepMs = 1000 / 60;
      const steps = Math.max(0, Math.round((Number(seconds) || 0) * 1000 / stepMs));
      for (let step = 0; step < steps; step += 1) {
        game = updateGame(game, { lane: options.lane ?? game.lane, isFiring: options.firing !== false }, stepMs);
        // Sync the view too, or per-frame visuals that the reducer only reports
        // once -- deaths, hit bursts -- are stepped straight past and never seen.
        // Only for the tail of the run: syncScene walks every scatter instance,
        // and doing that for a whole simulated minute is pointlessly slow.
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
        anim: player?.currentActionName ?? null,
        animRunning: Boolean(player?.currentAction?.isRunning?.()),
        clips: Object.keys(player?.actions ?? {}),
      };
    },
  };
}

function gameFrame(nowMs) {
  const dtMs = nowMs - lastGameMs;
  lastGameMs = nowMs;

  sampleQuality(dtMs);

  const wasOver = game.isOver;
  game = updateGame(game, input.read(), dtMs);

  syncScene(sceneRefs, game, dtMs);
  sceneRefs.render();

  renderGameHud();
  if (game.isOver !== wasOver) toggleGameOver(game.isOver);

  requestAnimationFrame(gameFrame);
}

/**
 * The biome list is the single source of truth for these options, so adding a
 * biome does not also mean remembering to edit the markup.
 */
function buildBiomeOptions() {
  if (!el.biomeSelect) return;

  for (const biome of BIOMES) {
    const option = document.createElement('option');
    option.value = biome.id;
    option.textContent = `${BIOME_ICONS[biome.id] ?? '•'} ${biome.name}`;
    el.biomeSelect.append(option);
  }

  el.biomeSelect.value = selectedBiome();
  el.biomeSelect.addEventListener('change', (event) => {
    localStorage.setItem(BIOME_STORAGE_KEY, event.target.value);
    applyBiomeChoice(event.target.value);
  });
}

function selectedBiome() {
  const saved = localStorage.getItem(BIOME_STORAGE_KEY);
  if (saved === BIOME_AUTO) return saved;
  return BIOMES.some((biome) => biome.id === saved) ? saved : BIOME_AUTO;
}

function applyBiomeChoice(choice) {
  sceneRefs?.setBiomeOverride?.(choice === BIOME_AUTO ? null : choice);
}

function selectedCharacter() {
  const saved = localStorage.getItem(CHARACTER_STORAGE_KEY);
  if (saved && CONFIG.game.characters[saved]) return saved;
  return CONFIG.game.defaultCharacter;
}

/** Loads a character and re-skins the projectiles to match their weapon. */
async function applyCharacter(charId) {
  if (!sceneRefs?.player?.loadCharacter) return;
  await sceneRefs.player.loadCharacter(charId);
  sceneRefs.bulletPool?.setProjectile(sceneRefs.player.projectile);
}

let qualityFrames = 0;
let qualityTotalMs = 0;

function sampleQuality(dtMs) {
  if (qualityFrames > QUALITY_WARMUP_FRAMES + QUALITY_SAMPLE_FRAMES) return;

  qualityFrames += 1;
  if (qualityFrames <= QUALITY_WARMUP_FRAMES) return;

  qualityTotalMs += dtMs;
  if (qualityFrames <= QUALITY_WARMUP_FRAMES + QUALITY_SAMPLE_FRAMES) return;

  const averageFps = 1000 / (qualityTotalMs / QUALITY_SAMPLE_FRAMES);
  if (averageFps >= QUALITY_MEDIUM_FPS) return;

  sceneRefs?.setQuality?.(averageFps < QUALITY_LOW_FPS ? 'low' : 'medium');
}

function onGameKey(event) {
  if (!game.isOver) return;
  if (event.key === 'r' || event.key === 'R' || event.key === ' ') {
    event.preventDefault();
    restart();
  }
}

function restart() {
  game = restartGame(game);
  input.reset();
  toggleGameOver(false);
  renderGameHud();
  if (sceneRefs?.player?.playAnimation) {
    sceneRefs.player.playAnimation('run', 0.1, true);
  }
}

function toggleGameOver(isOver) {
  el.gameOver.hidden = !isOver;
  if (isOver) {
    el.finalScore.textContent = `Score ${game.score} · ${Math.round(game.distance)} m`;
  }
}

function buildHpPips() {
  el.hpBar.replaceChildren();
  for (let index = 0; index < CONFIG.game.maxHp; index += 1) {
    const pip = document.createElement('span');
    pip.className = 'pip';
    el.hpBar.append(pip);
  }
}

function renderGameHud() {
  el.hpBar.childNodes.forEach((pip, index) => {
    pip.classList.toggle('empty', index >= game.hp);
  });
  el.scoreValue.textContent = String(game.score);
  el.distanceValue.textContent = `${Math.round(game.distance)} m`;
}

function renderHud(landmarks) {
  if (!landmarks) {
    el.lateralValue.textContent = 'NO BODY';
    el.lateralValue.classList.remove('active');
  } else if (!lateral.isCalibrated) {
    el.lateralValue.textContent = 'CALIBRATING';
    el.lateralValue.classList.remove('active');
  } else {
    el.lateralValue.textContent = lateral.label;
    el.lateralValue.classList.toggle('active', lateral.label !== LATERAL.CENTER);
  }
  el.lateralDetail.textContent = `offset ${lateral.offset.toFixed(2)} sw`;

  el.jogValue.textContent = jog.isJogging ? 'JOGGING' : 'NO';
  el.jogValue.classList.toggle('active', jog.isJogging);
  el.jogDetail.textContent =
    `${Math.round(jog.cadenceSpm)} spm · ${jog.stepCount} steps · Δ ${jog.kneeDelta.toFixed(2)}`;
}

function updateFps(nowMs) {
  if (lastFrameMs > 0) {
    const deltaMs = nowMs - lastFrameMs;
    if (deltaMs > 0) smoothedFps = ema(smoothedFps, 1000 / deltaMs, CONFIG.fps.smoothing);
  }
  lastFrameMs = nowMs;

  el.fpsValue.textContent = smoothedFps === null ? '--' : smoothedFps.toFixed(0);
  el.fpsDetail.textContent =
    smoothedInferenceMs === null ? 'inference -- ms' : `inference ${smoothedInferenceMs.toFixed(1)} ms`;
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

function setStatus(text) {
  el.status.textContent = text;
}

function showError(message) {
  el.error.textContent = message;
  el.error.hidden = false;
}

function hideError() {
  el.error.hidden = true;
}
