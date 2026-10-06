/** Browser regression: flight pose follows game time, then absorbs landing. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, sleep } from './cdp.mjs';

const browser = await launchBrowser({ width: 1100, height: 1000, port: 9335 });
const page = await openPage(browser.port);
const output = 'docs/shots/jump-smoothing';
mkdirSync(output, { recursive: true });
try {
  await page.goto('http://localhost:3000/play');
  await page.waitFor('window.__lane?.ready', { timeoutMs: 60000 });
  await page.evaluate(`(() => {
    document.querySelector('#cameraPermissionModal')?.remove();
    document.querySelectorAll('#gameStage > :not(canvas)').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#gameStage, #gameStage canvas').forEach(el => {
      el.style.setProperty('filter', 'none', 'important');
      el.style.setProperty('opacity', '1', 'important');
    });
  })()`);
  for (const character of ['mage', 'druid', 'skeletonMage', 'witch', 'magicalGirl']) {
    await page.evaluate(`(() => {
      const select = document.querySelector('#charSelect');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(character)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.waitFor(`window.__lane.summary().character === ${JSON.stringify(character)} && window.__lane.summary().clips.length === 6`);
    await sleep(1200);
    const phases = await page.evaluate(`(() => {
      const h = window.__lane;
      h.restart();
      h.simulate(.4, { firing: false, jump: true });
      return h.summary();
    })()`);
    assert.equal(phases.anim, 'jump', character + ' flight');
    const phase = (phases.elapsedMs - phases.jumpStartedMs) / 800;
    assert.ok(Math.abs(phases.animTime / phases.animDuration - (4 + phase * 9) / 19) < 1e-5,
      character + ' jump follows reducer phase');
    assert.ok(phases.jumpHeight > 1.6);
    await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    writeFileSync(`${output}/${character}-airborne.png`, await page.screenshot(await page.elementClip('#gameStage')));
    const landing = await page.evaluate(`window.__lane.simulate(.5, { firing: true }); window.__lane.summary()`);
    assert.equal(landing.jumpHeight, 0, character + ' grounded');
    assert.equal(landing.anim, 'jump', character + ' landing resists rapid shots');
    assert.ok(landing.animTime / landing.animDuration > 13 / 19);
    await page.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    writeFileSync(`${output}/${character}-landing.png`, await page.screenshot(await page.elementClip('#gameStage')));
    const recovered = await page.evaluate(`window.__lane.simulate(.7, { firing: false }); window.__lane.summary()`);
    assert.equal(recovered.anim, 'run', character + ' recovered');
    console.log(character, JSON.stringify({ phase, airborneTime: phases.animTime, landingTime: landing.animTime, recovered: recovered.anim }));
  }
  assert.deepEqual(page.logs.filter(log => log.level === 'error' || log.level === 'pageerror'), []);
  console.log('All five exported magician flight/landing/recovery checks passed.');
} finally {
  await page.close();
  await browser.close();
}
process.exit(0);
