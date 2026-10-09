/** Local browser acceptance for character selection and camera-image privacy. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchBrowser, openPage, sleep } from './cdp.mjs';

const output = 'docs/shots/character-selection';
mkdirSync(output, { recursive: true });
const browser = await launchBrowser({ width: 1280, height: 900, port: 9347 });
const page = await openPage(browser.port);
const roster = ['mage', 'druid', 'skeletonMage', 'witch', 'magicalGirl'];
async function go(path) {
  const previousOrigin = await page.evaluate('performance.timeOrigin');
  await page.goto(`http://localhost:3000${path}`);
  await page.waitFor(`performance.timeOrigin !== ${previousOrigin} && location.pathname === '${path}'`);
}
try {
  await go('/');
  await page.waitFor("document.querySelector('a[href=\"/characters\"]')");
  await page.evaluate("document.querySelector('a[href=\"/characters\"]').click()");
  await page.waitFor("location.pathname === '/characters'");
  await page.waitFor("document.querySelectorAll('[data-preview-status=\"ready\"]').length === 5", { timeoutMs: 60000, label: 'five loaded Idle previews' });
  const loaded = await page.evaluate("Array.from(document.querySelectorAll('[data-character-preview]'), el => el.dataset.characterPreview)");
  assert.deepEqual(loaded, roster);
  assert.equal(await page.evaluate("document.querySelectorAll('canvas').length"), 1, 'one shared preview renderer');
  writeFileSync(`${output}/desktop.png`, await page.screenshot());
  await sleep(800);
  writeFileSync(`${output}/desktop-idle.png`, await page.screenshot());

  // Every character selection must be handed to the runner unchanged.
  for (const id of roster) {
    if (await page.evaluate('location.pathname') !== '/characters') {
      await go('/characters');
      await page.waitFor("document.querySelectorAll('[data-preview-status=\"ready\"]').length === 5", { timeoutMs: 60000 });
    }
    await page.evaluate(`document.querySelector('[data-character-preview="${id}"]').closest('button').click()`);
    await page.waitFor("location.pathname === '/play' && document.querySelector('#cameraPermissionModal')");
    await page.waitFor(`window.__lane?.summary().character === '${id}'`, { timeoutMs: 60000, label: `${id} runtime selection` });
    const persisted = await page.evaluate("JSON.parse(localStorage.getItem('trail_runner_settings_v3')).state.character");
    assert.equal(persisted, id);
    console.log(`Selected ${id}: persisted and applied to runner`);
  }
  await page.evaluate("Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Hide camera image')).click()");
  await page.waitFor("document.querySelector('button[aria-pressed=\"true\"]')");
  assert.equal(await page.evaluate("JSON.parse(localStorage.getItem('trail_runner_settings_v3')).state.hideCamera"), true);
  writeFileSync(`${output}/camera-setup.png`, await page.screenshot());
  await go('/play');
  await page.waitFor("document.querySelector('button[aria-pressed=\"true\"]')");

  // The installed, version-matched WASM avoids CDN throughput affecting this UI check.
  const visionVersion = JSON.parse(readFileSync(new URL('../node_modules/@mediapipe/tasks-vision/package.json', import.meta.url), 'utf8')).version;
  const wasm = readFileSync(new URL('../node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm', import.meta.url)).toString('base64');
  const cachedModelPath = process.env.POSE_MODEL_PATH || join(tmpdir(), 'project-game-pose-landmarker-lite.task');
  const model = existsSync(cachedModelPath) ? readFileSync(cachedModelPath).toString('base64') : null;
  await page.evaluate(`(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${visionVersion}/wasm/vision_wasm_internal.wasm') {
        return originalFetch('data:application/wasm;base64,${wasm}');
      }
      if (${Boolean(model)} && url === 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task') {
        return originalFetch('data:application/octet-stream;base64,${model ?? ''}');
      }
      return originalFetch(input, options);
    };
  })()`);

  // Use synthetic video: this test never requests the user's physical webcam.
  await page.evaluate(`(() => {
    window.__privacyOverlayFrames = 0;
    const clearRect = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function(...args) {
      if (this.canvas === document.querySelector('video')?.parentElement.querySelector('canvas')) window.__privacyOverlayFrames++;
      return clearRect.apply(this, args);
    };
    window.__privacyTestCanvas = document.createElement('canvas');
    const source = window.__privacyTestCanvas;
    source.width = 640; source.height = 480;
    const context = source.getContext('2d');
    window.__privacyTestTimer = setInterval(() => {
      context.fillStyle = '#e900ff'; context.fillRect(0, 0, 640, 480);
      context.fillStyle = '#ffff00'; context.fillRect((performance.now() / 5) % 500, 100, 100, 100);
    }, 33);
    window.__privacyTestStream = source.captureStream(30);
    navigator.mediaDevices.getUserMedia = async () => window.__privacyTestStream;
    Array.from(document.querySelectorAll('#cameraPermissionModal button')).find(el => /Allow camera|Turn on camera|Try again/.test(el.textContent)).click();
  })()`);
  await page.waitFor("!document.querySelector('#cameraPermissionModal') && document.querySelector('video')?.currentTime > 0", { timeoutMs: 180000, label: 'synthetic camera and pose pipeline started' });
  await page.waitFor("getComputedStyle(document.querySelector('video').parentElement.querySelector('canvas')).opacity === '1'", { label: 'detector canvas ready' });
  const privacy = await page.evaluate(`(() => {
    const video = document.querySelector('video');
    const overlay = video.parentElement.querySelector('canvas');
    return {
      videoOpacity: getComputedStyle(video).opacity,
      overlayOpacity: getComputedStyle(overlay).opacity,
      background: getComputedStyle(video.parentElement).backgroundColor,
      paused: video.paused,
      sameStream: video.srcObject === window.__privacyTestStream,
      trackState: video.srcObject.getVideoTracks()[0].readyState,
      overlayWidth: overlay.width,
      overlayHeight: overlay.height,
      mirroredTogether: getComputedStyle(video).transform === getComputedStyle(overlay).transform,
      time: video.currentTime,
      detectorFrames: window.__privacyOverlayFrames,
    };
  })()`);
  assert.equal(privacy.videoOpacity, '0');
  assert.equal(privacy.overlayOpacity, '1');
  assert.equal(privacy.background, 'rgb(0, 0, 0)');
  assert.equal(privacy.paused, false);
  assert.equal(privacy.sameStream, true);
  assert.equal(privacy.trackState, 'live');
  assert.ok(privacy.overlayWidth > 1 && privacy.overlayHeight > 1);
  assert.equal(privacy.mirroredTogether, true);
  await sleep(500);
  assert.ok(await page.evaluate('document.querySelector("video").currentTime') > privacy.time);
  await page.waitFor(`window.__privacyOverlayFrames > ${privacy.detectorFrames} + 2`, { label: 'pose inference keeps updating the overlay behind hidden video' });
  privacy.detectorFramesAfter = await page.evaluate('window.__privacyOverlayFrames');
  writeFileSync(`${output}/hidden-camera.png`, await page.screenshot());
  console.log('Privacy: black background, live hidden video, visible aligned detector canvas', JSON.stringify(privacy));

  await go('/characters');
  await page.waitFor("document.querySelectorAll('[data-preview-status=\"ready\"]').length === 5", { timeoutMs: 60000 });
  // Resizing the viewport also exercises the preview scissor regions.
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(400);
  assert.equal(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'no mobile overflow');
  writeFileSync(`${output}/mobile.png`, await page.screenshot());
  await page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)');
  await sleep(200);
  writeFileSync(`${output}/mobile-bottom.png`, await page.screenshot());
  const errors = page.logs.filter(log => log.level === 'error' || log.level === 'pageerror');
  assert.deepEqual(errors, [], 'Browser console errors');
  writeFileSync(`${output}/validation.json`, JSON.stringify({ roster, privacy, wasmSource: `installed @mediapipe/tasks-vision ${visionVersion}`, modelSource: model ? 'cached official pose_landmarker_lite/float16/1 model' : 'Google Storage', mobileOverflow: false, errors }, null, 2));
  console.log('Character selection and synthetic-camera privacy acceptance passed.');
} catch (error) {
  writeFileSync(`${output}/failure.png`, await page.screenshot());
  writeFileSync(`${output}/failure.json`, JSON.stringify({ message: error.message, logs: page.logs }, null, 2));
  throw error;
} finally {
  await page.close();
  await browser.close();
}
process.exit(0);
