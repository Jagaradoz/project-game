/** Software-browser acceptance; these measurements are not device GPU benchmarks. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage } from './cdp.mjs';

const output = 'docs/shots/graphics';
mkdirSync(output, { recursive: true });
const browser = await launchBrowser({ width: 1280, height: 900, port: 9349 });
const page = await openPage(browser.port);
const results = {};
async function go(path) {
  const previous = await page.evaluate('performance.timeOrigin');
  await page.goto(`http://127.0.0.1:3000${path}`);
  await page.waitFor(`performance.timeOrigin !== ${previous} && location.pathname === '${path}'`, { timeoutMs: 60000 });
}
async function choose(quality, scope) {
  await page.evaluate(`document.querySelector('${scope} input[value="${quality}"]').click()`);
  await page.waitFor(`JSON.parse(localStorage.getItem('trail_runner_settings_v3')).state.graphicsQuality === '${quality}'`);
}
try {
  await go('/characters');
  await page.waitFor('document.querySelector("[data-preview-status=ready]")', { timeoutMs: 120000, label: 'hydrated character selection' });
  await choose('low', 'fieldset');
  writeFileSync(`${output}/selection-desktop.png`, await page.screenshot());
  await go('/play');
  await page.waitFor("window.__lane?.ready && window.__lane.summary().quality === 'low'", { timeoutMs: 120000 });
  const cold = await page.evaluate('window.__lane.summary().graphics');
  assert.equal(cold.shadows, false);
  assert.equal(cold.motes, 0);
  assert.equal(cold.cloudsVisible, false);
  assert.equal(cold.detailInstances, 0);
  writeFileSync(`${output}/camera-setup-desktop.png`, await page.screenshot());

  for (const quality of ['high', 'medium', 'low']) {
    await choose(quality, '#cameraPermissionModal');
    await page.waitFor(`window.__lane.summary().quality === '${quality}'`);
    // Park on the same scene behind the camera dialog: inference has not started.
    results[quality] = await page.evaluate('window.__lane.summary().graphics');
    if (quality === 'high') assert.ok(results.high.shadowCameraLeft < -20, 'usable shadows after cold Low startup');
  }
  assert.ok(results.low.sceneryInstances < results.medium.sceneryInstances);
  assert.ok(results.medium.sceneryInstances < results.high.sceneryInstances);
  assert.equal(results.high.shadowMapSize, 2048);
  assert.equal(results.medium.shadowMapSize, 1024);
  assert.deepEqual([results.low.maxFps, results.medium.maxFps, results.high.maxFps], [30, 45, 60]);

  await page.evaluate("Array.from(document.querySelectorAll('#cameraPermissionModal button')).find(button => button.textContent.includes('Play without camera')).click()");
  await page.waitFor("!document.querySelector('#cameraPermissionModal')");
  // Stop the world for same-position visual comparisons without disabling the real scene.
  await page.evaluate("window.__lane.previewHazard('log', 0, 2, -50); document.querySelector('details').open = true");
  for (const quality of ['low', 'medium', 'high']) {
    await choose(quality, 'details');
    await page.waitFor(`window.__lane.summary().quality === '${quality}'`);
    writeFileSync(`${output}/${quality}-desktop.png`, await page.screenshot(await page.elementClip('#gameStage')));
  }
  await page.evaluate("document.querySelector('details').open = false");
  writeFileSync(`${output}/play-desktop.png`, await page.screenshot());
  await choose('low', 'details');
  await go('/play');
  await page.waitFor("window.__lane?.summary().quality === 'low'", { timeoutMs: 120000 });
  assert.equal(await page.evaluate('document.querySelector("#cameraPermissionModal input:checked").value'), 'low');

  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await go('/characters');
  await page.waitFor('document.querySelector("input[value=low]:checked")');
  const overflow = await page.evaluate('document.documentElement.scrollWidth > innerWidth');
  assert.equal(overflow, false, 'mobile selection has no horizontal overflow');
  writeFileSync(`${output}/selection-mobile.png`, await page.screenshot());
  await go('/play');
  await page.waitFor("window.__lane?.summary().quality === 'low'", { timeoutMs: 120000 });
  const modal = await page.evaluate(`(() => {
    const rect = document.querySelector('[role=dialog]').getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: innerHeight };
  })()`);
  assert.ok(modal.top >= 0 && modal.bottom <= modal.height, 'mobile camera controls fit');
  writeFileSync(`${output}/camera-setup-mobile.png`, await page.screenshot());
  await page.evaluate("Array.from(document.querySelectorAll('#cameraPermissionModal button')).find(button => button.textContent.includes('Play without camera')).click(); document.querySelector('details').open = true");
  await page.waitFor("!document.querySelector('#cameraPermissionModal')");
  writeFileSync(`${output}/play-mobile.png`, await page.screenshot());
  writeFileSync(`${output}/acceptance.json`, JSON.stringify({ presets: results, coldLow: cold, mobileModal: modal }, null, 2));
  console.log(JSON.stringify(results));
  console.log('PASS: cold Low, all live presets, shadows, scenery, persistence, desktop and mobile layouts.');
} finally {
  await page.close();
  await browser.close();
}
