/** Camera-free browser checks of combat feedback and the full-height play stage. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchBrowser, openPage } from './cdp.mjs';

const out = join(tmpdir(), 'project-game-combat-visuals');
mkdirSync(out, { recursive: true });
const browser = await launchBrowser({ width: 1440, height: 1000, port: 9342 });
const page = await openPage(browser.port);
const milestones = [];
try {
  await page.goto('http://localhost:3000/play');
  await page.waitFor('window.__lane?.ready && document.querySelector("#gameStage")', { timeoutMs: 60000 });
  // Keep the camera gated. The development harness steps the actual reducer.
  await page.evaluate('document.querySelector("#cameraPermissionModal")?.remove(); window.__lane.restart()');
  await page.waitFor('getComputedStyle(document.querySelector(".combo-hit")).visibility === "hidden"');
  await page.evaluate(`(() => {
    const h = window.__lane;
    for (let i = 0; i < 150 && h.summary().comboHits === 0; i += 1) {
      const target = h.summary().enemies.sort((a,b) => b.z-a.z)[0];
      h.simulate(.05, { lane: target?.lane ?? 1, firing: true });
    }
  })()`);
  await page.waitFor('document.querySelector(".combo-hit")?.dataset.comboHits === "1"');
  assert.equal(await page.evaluate('document.querySelectorAll(".combo-hit-time").length'), 0, 'no timeout bar while active');
  for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const layout = await page.evaluate(`(() => {
      const stage = document.querySelector('#gameStage').getBoundingClientRect();
      const combo = document.querySelector('.combo-hit').getBoundingClientRect();
      return { stage: { top: stage.top, bottom: stage.bottom, width: stage.width },
        comboTop: combo.top / innerHeight, height: innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
        chrome: document.querySelectorAll('header, footer').length,
        buttons: [...document.querySelectorAll('main button')].map(b => b.textContent.trim()) };
    })()`);
    assert.equal(layout.stage.top, 0);
    assert.equal(layout.stage.bottom, height);
    assert.ok(layout.stage.width <= width);
    assert.ok(layout.comboTop >= .30 && layout.comboTop <= .35);
    assert.ok(layout.scrollHeight <= height);
    assert.equal(layout.chrome, 0);
    assert.deepEqual(layout.buttons, []);
    writeFileSync(join(out, `layout-${width}x${height}.png`), await page.screenshot());
  }
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const seen = new Set();
  for (let batch = 0; batch < 220 && seen.size < 4; batch += 1) {
    const result = await page.evaluate(`(() => {
      const h = window.__lane;
      for (let step = 0; step < 24; step += 1) {
        const before = h.summary();
        if (before.isOver) return before;
        const target = before.enemies.filter(e => e.z < 1).sort((a,b) => b.z-a.z)[0];
        const hazard = before.hazards.find(o => o.status !== 'cleared' && o.z > -5 && o.z < -3);
        h.simulate(.05, { lane: target?.lane ?? 1, firing: true,
          jump: Boolean(hazard && before.jumpHeight === 0), shield: before.spores.some(s => s.z > -4) });
        const after = h.summary();
        if (after.comboHits !== before.comboHits || after.isOver) return after;
      }
      return h.summary();
    })()`);
    await page.waitFor(`Number(document.querySelector('.combo-hit')?.dataset.comboHits ?? 0) === ${result.comboHits}`);
    const hits = result.comboHits;
    if (hits > 0 && hits % 5 === 0 && hits <= 20 && !seen.has(hits)) {
      seen.add(hits);
      const color = await page.evaluate('getComputedStyle(document.querySelector(".combo-hit")).getPropertyValue("--combo-color").trim()');
      milestones.push({ hits, color });
      await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      writeFileSync(join(out, `combo-${hits}.png`), await page.screenshot());
    }
    if (result.isOver && seen.size < 4) {
      await page.evaluate('window.__lane.restart()');
    }
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [5, 10, 15, 20], 'four real-hit milestones reached');
  assert.equal(new Set(milestones.map(m => m.color)).size, 4, 'each milestone changes colour');
  const expired = await page.evaluate(`(() => {
    const h = window.__lane;
    h.setActorsVisible(false);
    for (let step = 0; step < 102; step += 1) {
      const before = h.summary();
      const hazard = before.hazards.find(o => o.status !== 'cleared' && o.z > -5 && o.z < -3);
      h.simulate(.05, { lane: 0, firing: false, shield: true, jump: Boolean(hazard && before.jumpHeight === 0) });
    }
    return h.summary();
  })()`);
  assert.equal(expired.comboHits, 0, 'five seconds without an impact expires the chain');
  await page.waitFor('getComputedStyle(document.querySelector(".combo-hit")).visibility === "hidden"');
  assert.equal(await page.evaluate('window.__lane.summary().comboHits'), 0, 'timeout resets the hit chain');
  assert.equal(await page.evaluate('document.querySelectorAll(".combo-hit-time").length'), 0, 'expired chain has no timer');
  await page.evaluate('window.__lane.setActorsVisible(true)');
  await page.evaluate('window.__lane.restart()');
  await page.waitFor('getComputedStyle(document.querySelector(".combo-hit")).visibility === "hidden"');
  await page.evaluate(`(() => {
    const h = window.__lane;
    for (let i = 0; i < 150 && h.summary().comboHits === 0; i += 1) {
      const target = h.summary().enemies.sort((a,b) => b.z-a.z)[0];
      h.simulate(.05, { lane: target?.lane ?? 1, firing: true });
    }
  })()`);
  await page.waitFor('document.querySelector(".combo-hit")?.dataset.comboHits === "1"');
  assert.equal(await page.evaluate('getComputedStyle(document.querySelector(".combo-hit")).getPropertyValue("--combo-color").trim()'), '#ff941f', 'new chain restores the base colour');
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const duration = await page.evaluate('parseFloat(getComputedStyle(document.querySelector(".combo-hit-pulse")).animationDuration)');
  assert.ok(duration <= .001, 'reduced motion disables the hit pulse');
  const errors = page.logs.filter(log => ['error', 'pageerror'].includes(log.level));
  assert.deepEqual(errors, [], 'no browser errors');
  console.log(JSON.stringify({ passed: true, milestones, screenshots: out }, null, 2));
} finally {
  await page.close();
  await browser.close();
}
process.exit(0);
