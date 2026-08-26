/** Wiring: camera -> pose -> detectors -> input, and input -> game -> scene. */

import { CONFIG } from './config.js?v=1.3.2';
import { startCamera, describeCameraError } from './camera.js?v=1.3.2';
import { initPose, detect } from './pose.js?v=1.3.2';
import { resizeOverlay, clearOverlay, drawSkeleton } from './draw.js?v=1.3.2';
import { createLateralState, updateLateral, recalibrateLateral, LATERAL } from './detectors/lateral.js?v=1.3.2';
import { createJogState, updateJog } from './detectors/jog.js?v=1.3.2';
import { ema } from './util/smooth.js?v=1.3.2';
import { createGameState, updateGame, restartGame } from './game/state.js?v=1.3.2';
import { createInput } from './game/input.js?v=1.3.2';
import { createScene } from './game/scene.js?v=1.3.2';
import { syncScene } from './game/render.js?v=1.3.2';

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
};

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

  try {
    sceneRefs = await createScene(el.gameCanvas);
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

  lastGameMs = performance.now();
  requestAnimationFrame(gameFrame);
}

function gameFrame(nowMs) {
  const dtMs = nowMs - lastGameMs;
  lastGameMs = nowMs;

  const wasOver = game.isOver;
  game = updateGame(game, input.read(), dtMs);

  syncScene(sceneRefs, game);
  sceneRefs.render();

  renderGameHud();
  if (game.isOver !== wasOver) toggleGameOver(game.isOver);

  requestAnimationFrame(gameFrame);
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
