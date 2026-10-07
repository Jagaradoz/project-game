/** Real Chrome/WebGL regression with deterministic fixtures and real reducer crossings. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage } from './cdp.mjs';

const browser = await launchBrowser({ width: 1100, height: 1000, port: 9341 });
const page = await openPage(browser.port);
const output = 'docs/shots/trail-hazards';
mkdirSync(output, { recursive: true });
const results = [];
const riverOnly = process.argv.includes('--river-only');
async function settle() {
  await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
}
async function capture(name) {
  await settle();
  writeFileSync(`${output}/${name}.png`, await page.screenshot(await page.elementClip('#gameStage')));
}
async function preview(kind, startLane = 0, laneCount = 3, z = -8) {
  await page.evaluate(`window.__lane.previewHazard(${JSON.stringify(kind)}, ${startLane}, ${laneCount}, ${z})`);
  await settle();
}
try {
  await page.goto('http://localhost:3000/play');
  await page.waitFor('window.__lane?.ready', { timeoutMs: 60000 });
  await page.evaluate(`(() => {
    const style = document.createElement('style'); style.id = 'hazard-capture-style';
    style.textContent = '#cameraPermissionModal{display:none!important}#gameStage>:not(canvas){display:none!important}#gameStage,#gameStage canvas{filter:none!important;opacity:1!important}';
    document.head.append(style);
  })()`);
  for (const kind of riverOnly ? [] : ['log', 'stones']) {
    for (const [start, count] of [[0, 2], [1, 2], [0, 3]]) {
      await preview(kind, start, count);
      const name = `${kind}-${count}-lanes-${start === 0 ? 'left' : 'right'}`;
      await capture(name);
      const state = await page.evaluate('window.__lane.summary()');
      assert.equal(state.hp, 3);
      assert.equal(state.hazards[0].kind, kind);
      results.push({ name, calls: state.calls, triangles: state.tris });
      if (count === 2) {
        const openLane = start === 0 ? 2 : 0;
        const escaped = await page.evaluate(`window.__lane.simulate(1, {lane:${openLane}, firing:false}); window.__lane.summary()`);
        assert.equal(escaped.hp, 3, name + ' open lane');
        assert.equal(escaped.hazards[0].status, 'cleared');
      }
      await preview(kind, start, count, -5);
      const jumped = await page.evaluate('window.__lane.simulate(.8, {lane:1, firing:false, jump:true}); window.__lane.summary()');
      assert.equal(jumped.hp, 3, name + ' jumped');
      assert.equal(jumped.hazards[0].status, 'cleared');
      await preview(kind, start, count, -1.8);
      const struck = await page.evaluate(`window.__lane.simulate(.5, {lane:${start}, firing:false}); window.__lane.summary()`);
      assert.equal(struck.hp, 2, name + ' one hit');
    }
  }
  await preview('river');
  await capture('river-3-lanes');
  const river = await page.evaluate('window.__lane.summary()');
  results.push({ name: 'river-3-lanes', calls: river.calls, triangles: river.tris });
  await preview('river', 0, 3, -5);
  await page.evaluate('window.__lane.simulate(.4, {firing:false, jump:true})');
  await capture('river-jump');
  const cleared = await page.evaluate('window.__lane.simulate(.4, {firing:false}); window.__lane.summary()');
  assert.equal(cleared.hp, 3);
  assert.equal(cleared.hazards[0].status, 'cleared');
  await preview('river', 0, 3, -1.8);
  // The verdict waits for the late-takeoff grace after the river's centre passes.
  const dead = await page.evaluate('window.__lane.simulate(.5, {firing:false}); window.__lane.summary()');
  assert.equal(dead.hp, 0);
  assert.equal(dead.deathReason, 'drowned');
  assert.equal(dead.isCleared, false);
  assert.equal(dead.endPresentationComplete, false);
  assert.equal(dead.splashVisible, true);
  const frozenElapsed = dead.elapsedMs;
  const sinking = await page.evaluate('window.__lane.simulate(.3, {firing:false}); window.__lane.summary()');
  assert.equal(sinking.elapsedMs, frozenElapsed);
  assert.ok(sinking.playerY < 0);
  assert.equal(sinking.endPresentationComplete, false);
  await capture('river-sinking');
  await page.evaluate(`document.querySelector('#hazard-capture-style').textContent = '#cameraPermissionModal{display:none!important}#gameStage,#gameStage canvas{filter:none!important;opacity:1!important}'`);
  assert.equal(await page.evaluate('document.querySelector("#gameStage")?.textContent.includes("River crossing missed")'), false);
  const finished = await page.evaluate('window.__lane.simulate(.4, {firing:false}); window.__lane.summary()');
  assert.equal(finished.endPresentationComplete, true);
  assert.equal(finished.playerVisible, false);
  assert.equal(finished.splashVisible, false);
  await page.waitFor('document.querySelector("#gameStage")?.textContent.includes("River crossing missed")');
  await capture('river-defeat-panel');
  await preview('log', 0, 2);
  const reset = await page.evaluate('window.__lane.summary()');
  assert.equal(reset.deathReason, null);
  assert.equal(reset.playerY, 0);
  assert.equal(reset.playerVisible, true);
  assert.equal(reset.splashVisible, false);
  const assets = await page.evaluate('performance.getEntriesByType("resource").map(r => r.name)');
  assert.equal(assets.some(path => path.includes('tree_root_oak.glb')), false);
  for (const name of ['log_two_lane_A', 'log_three_lane_C', 'stone_hazard_two_lane_B', 'stone_hazard_three_lane_A', 'river_crossing']) {
    assert.ok(assets.some(path => path.includes(name + '.glb')), name + ' loaded');
  }
  const errors = page.logs.filter(log => ['error', 'pageerror'].includes(log.level));
  assert.deepEqual(errors, [], 'browser and shader errors');
  const report = { variants: results, riverJump: cleared, drowning: finished, restart: reset, errors };
  writeFileSync(`${output}/${riverOnly ? 'river-validation' : 'validation'}.json`, JSON.stringify(report, null, 2));
  console.log(riverOnly ? 'River visuals, jumping, drowning delay and reset passed.' : 'Seven hazard variants, jumping, open-lane dodges, one-hit collisions, drowning delay and reset passed.');
  console.log(JSON.stringify(results));
} finally {
  await page.close();
  await browser.close();
}
process.exit(0);
