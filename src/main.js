/** Wiring: camera -> pose -> detectors -> overlay + HUD. */

import { CONFIG } from './config.js';
import { startCamera, describeCameraError } from './camera.js';
import { initPose, detect } from './pose.js';
import { resizeOverlay, clearOverlay, drawSkeleton } from './draw.js';
import { createLateralState, updateLateral, recalibrateLateral, LATERAL } from './detectors/lateral.js';
import { createJogState, updateJog } from './detectors/jog.js';
import { ema } from './util/smooth.js';

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

el.startBtn.addEventListener('click', start);
el.calibrateBtn.addEventListener('click', () => {
  lateral = recalibrateLateral(lateral);
  setStatus('Recalibrating center -- stand still for a second.');
});

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

  clearOverlay(ctx);
  drawSkeleton(ctx, landmarks, connections);
  renderHud(landmarks);
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
