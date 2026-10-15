/** GPU resource regression in software-rendered Chrome; not a device FPS benchmark. */
import assert from 'node:assert/strict';
import { launchBrowser, openPage } from './cdp.mjs';

const BATCHES = Math.max(181, Math.ceil(Number(process.argv[3] ?? 1204) / 4));
const STEPS = 40;
const STEP_SEC = .1;
const browser = await launchBrowser({ width: 850, height: 850, port: 9348 });
const page = await openPage(browser.port);

try {
  // Count actual allocations/deletions, including textures on detached rigs.
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__gpuProbe = [];
    for (const Type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const create = Type.prototype.createTexture, remove = Type.prototype.deleteTexture;
      const counts = new WeakMap();
      Type.prototype.createTexture = function(...args) {
        let count = counts.get(this);
        if (!count) { count = { gl: this, created: 0, deleted: 0 }; counts.set(this, count); window.__gpuProbe.push(count); }
        const texture = create.apply(this, args); if (texture) count.created++;
        return texture;
      };
      Type.prototype.deleteTexture = function(texture) {
        if (texture) { const count = counts.get(this); if (count) count.deleted++; }
        return remove.call(this, texture);
      };
    }
  ` });
  await page.goto(process.argv[2] ?? 'http://localhost:3000/play');
  await page.waitFor('window.__lane?.ready', { timeoutMs: 90000 });
  await page.evaluate('window.__lane.restart(); window.__stressRestarts = 0');
  const samples = [];

  for (let batch = 0; batch < BATCHES; batch++) {
    await page.evaluate(`(() => {
      const h = window.__lane;
      for (let step=0; step<${STEPS}; step++) {
        let s=h.summary();
        if (s.isOver) { h.restart(); window.__stressRestarts++; s=h.summary(); }
        const lane=s.enemies.filter(e=>e.z<0).sort((a,b)=>b.z-a.z)[0]?.lane ?? 1;
        const hazard=s.hazards.find(o=>o.status!=='cleared'&&o.z>-6&&o.z<-2);
        h.simulate(${STEP_SEC},{lane,firing:true,jump:Boolean(hazard&&s.jumpHeight===0),shield:true});
      }
      return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    })()`);
    if (batch % 30 === 0) {
      const sample = await page.evaluate(`(() => {
        const p=window.__gpuProbe.filter(p=>p.gl.canvas.closest?.('#gameStage')&&!p.gl.isContextLost()).at(-1);
        if (!p) throw new Error('No live game WebGL context');
        return {seconds:${(batch + 1) * STEPS * STEP_SEC},textures:p.created-p.deleted,created:p.created,deleted:p.deleted,restarts:window.__stressRestarts};
      })()`);
      samples.push(sample);
      console.log(JSON.stringify(sample));
    }
  }

  const steady = samples.slice(3);
  assert.ok(steady.length >= 3);
  assert.ok(steady.every(s => s.textures < 256), 'GPU texture count stays within the fixed pool budget');
  const spread = Math.max(...steady.map(s => s.textures)) - Math.min(...steady.map(s => s.textures));
  assert.ok(spread <= 64, `texture count plateaus after warm-up; spread=${spread}`);
  assert.ok(samples.at(-1).deleted > 100, 'recycled models release their GPU textures');
  assert.ok(samples.at(-1).restarts > 0, 'run restarts exercised');
  const errors = page.logs.filter(l => ['error', 'pageerror'].includes(l.level) && !/favicon/.test(l.text));
  assert.deepEqual(errors, [], 'no browser or animation errors');
  console.log(`Long-play GPU checks passed: ${BATCHES * STEPS * STEP_SEC}s simulated, late texture spread ${spread}`);
} finally {
  await page.close();
  await browser.close();
}
process.exit(0);
