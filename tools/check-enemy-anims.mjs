/** Samples the clip each live enemy kind is playing, and whether its pose advances. Needs `npm run dev`. */
import { launchBrowser, openPage } from './cdp.mjs';
const browser = await launchBrowser({ width: 900, height: 1200, port: 9335 });
const page = await openPage(browser.port);
try {
  await page.goto('http://localhost:3000/play');
  await page.waitFor('window.__lane?.ready', { timeoutMs: 60000, label: 'game loaded' });
  const report = await page.evaluate(`(() => {
    const h = window.__lane; h.restart();
    const seen = {};
    for (let i = 0; i < 4000; i++) {
      const before = h.summary();
      const lane = before.enemies.filter(e => e.z < 1).sort((a, b) => b.z - a.z)[0]?.lane ?? 1;
      h.simulate(.05, { lane, firing: true });
      const s = h.summary();
      for (const a of s.enemyAnims) {
        const key = a.kind + ':' + a.clip + ':' + (a.z > -5 ? 'near' : a.z > -70 ? 'mid' : 'far');
        (seen[key] ??= []).push(+a.time.toFixed(2));
      }
      if (s.isOver) h.restart();
    }
    return Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, { n: v.length, distinctTimes: new Set(v).size, min: Math.min(...v), max: Math.max(...v) }]));
  })()`);
  console.log(JSON.stringify(report, null, 1));
} finally { await browser.close(); }
