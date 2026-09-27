/** Headless game acceptance: load each exported rig and exercise Run/Attack. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, sleep } from './cdp.mjs';

const browser = await launchBrowser({ width: 1100, height: 1000 });
const page = await openPage(browser.port);
const output = 'docs/shots/magician-playback';
mkdirSync(output, { recursive: true });
try {
  await page.goto('http://localhost:3000/play');
  await page.waitFor('window.__lane?.ready', { timeoutMs: 60000, label: 'game ready' });
  await page.evaluate(`(() => {
    document.querySelector('#cameraPermissionModal')?.remove();
    document.querySelectorAll('#gameStage > :not(canvas)').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#gameStage, #gameStage canvas').forEach(el => {
      el.style.filter = 'none'; el.style.opacity = '1';
    });
  })()`);
  for (const character of ['mage', 'druid', 'skeletonMage', 'witch', 'magicalGirl']) {
    await page.evaluate(`(() => {
      const select = document.querySelector('#charSelect');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(character)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.waitFor(`window.__lane.summary().character === ${JSON.stringify(character)} && window.__lane.summary().clips.length === 2 && performance.getEntriesByType('resource').some(r => r.name.endsWith('/animated/' + ${JSON.stringify(({ mage: 'Mage', druid: 'Druid', skeletonMage: 'SkeletonMage', witch: 'Witch', magicalGirl: 'MagicalGirl' })[character])} + '.glb') && r.responseEnd > 0)`, { timeoutMs: 20000, label: character });
    // Resource timing finishes before embedded textures decode and attach.
    await sleep(2000);
    const phases = await page.evaluate(`(() => {
      const hook = window.__lane;
      hook.restart();
      hook.simulate(0.1, { firing: false });
      const run = hook.summary();
      hook.simulate(0.65, { firing: true });
      const attack = hook.summary();
      hook.simulate(2, { firing: false });
      return { run, attack, recovered: hook.summary() };
    })()`);
    assert.equal(phases.run.anim, 'run');
    assert.equal(phases.attack.anim, 'shoot');
    assert.equal(phases.recovered.anim, 'run');
    assert.deepEqual(phases.run.clips.sort(), ['run', 'shoot']);
    await page.evaluate('window.__lane.restart(); window.__lane.simulate(0.65, { firing: true })');
    await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const clip = await page.evaluate(`(() => { const r = document.querySelector('#gameStage').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 }; })()`);
    writeFileSync(`${output}/${character}.png`, await page.screenshot(clip));
    console.log(character, JSON.stringify(phases));
  }
  const errors = page.logs.filter(log => log.level === 'error' || log.level === 'pageerror');
  assert.deepEqual(errors, [], 'Browser console errors');
  console.log('All five magician Run -> Attack -> Run checks passed.');
} finally {
  await page.close();
  await browser.close();
}
