/** Idle/visibility regression in software Chrome; hardware FPS is a separate check. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchBrowser, openPage } from './cdp.mjs';

const browser = await launchBrowser({ width: 850, height: 850, port: 9352 });
const page = await openPage(browser.port);
const screenshot = join(tmpdir(), 'project-game-runtime-check.png');
try {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__renderProbe = { draws: 0, uploads: 0, cameraCalls: 0 };
    for (const Type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','bufferSubData']) {
        const original = Type.prototype[name];
        if (!original) continue;
        Type.prototype[name] = function(...args) {
          if (this.canvas.closest?.('#gameStage')) window.__renderProbe[name === 'bufferSubData' ? 'uploads' : 'draws']++;
          return original.apply(this, args);
        };
      }
    }
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (...args) => { window.__renderProbe.cameraCalls++; return getUserMedia(...args); };
  ` });
  await page.goto(process.argv[2] ?? 'http://localhost:3000/play?debug=1');
  await page.waitFor('window.__lane?.ready', { timeoutMs: 90000 });
  const sample = () => page.evaluate(`(async () => {
    await new Promise(r => requestAnimationFrame(r));
    const before = {...window.__renderProbe};
    for (let i=0; i<12; i++) await new Promise(r => requestAnimationFrame(r));
    return { draws: window.__renderProbe.draws - before.draws, uploads: window.__renderProbe.uploads - before.uploads };
  })()`);
  const idle = await sample();
  assert.deepEqual(idle, { draws: 0, uploads: 0 }, 'stationary startup does no repeated GPU work');
  const beforeWarp = await page.evaluate('window.__renderProbe.draws');
  await page.evaluate('window.__lane.warpTo(100)');
  await page.waitFor(`window.__renderProbe.draws > ${beforeWarp}`);
  assert.equal(await page.evaluate('window.__lane.summary().dist'), 100);
  const beforeResize = await page.evaluate('window.__renderProbe.draws');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
  await page.waitFor(`window.__renderProbe.draws > ${beforeResize}`);
  assert.deepEqual(await sample(), idle, 'resized static scene becomes idle again');
  await page.evaluate(`[...document.querySelectorAll('button')].find(b => /without camera/.test(b.textContent)).click()`);
  await page.waitFor('!document.querySelector("#cameraPermissionModal")');
  assert.equal(await page.evaluate('window.__renderProbe.cameraCalls'), 0);
  const playing = await sample();
  assert.ok(playing.draws > 0 && playing.uploads > 0, 'active game still animates');
  await page.evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__testHidden ?? false });
    window.__testHidden = true; document.dispatchEvent(new Event('visibilitychange'));`);
  const pausedState = await page.evaluate('window.__lane.summary().dist');
  const hidden = await sample();
  assert.deepEqual(hidden, idle, 'hidden callbacks perform no GPU work');
  assert.equal(await page.evaluate('window.__lane.summary().dist'), pausedState, 'hidden callbacks do not advance the run');
  await page.evaluate(`window.__testHidden = false; document.dispatchEvent(new Event('visibilitychange'))`);
  assert.ok((await sample()).draws > 0, 'visible play resumes');
  await page.evaluate('window.__lane.restart(); window.__lane.simulate(.5, {firing:true})');
  writeFileSync(screenshot, await page.screenshot());
  const errors = page.logs.filter(l => ['error', 'pageerror'].includes(l.level) && !/favicon/.test(l.text));
  assert.deepEqual(errors, [], 'no browser errors');
  console.log(JSON.stringify({ idle, playing, hidden, cameraCalls: 0, screenshot }));
} finally {
  await page.close();
  await browser.close();
}
process.exit(0);
