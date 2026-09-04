/**
 * Headless capture harness for the runner.
 *
 * The game boots its 3D loop without ever touching the webcam, so the whole
 * scene can be photographed in CI-style isolation. Used to review composition,
 * palette and biome transitions without a human having to look at every build.
 *
 * Usage:
 *   node tools/shot.mjs                       # one shot at the start of a run
 *   node tools/shot.mjs --dist=0,700,1500     # warp to distances, one shot each
 *   node tools/shot.mjs --out=docs/shots --w=900 --h=1200
 *
 * Software rendering means these frames are for LAYOUT AND COLOUR review only.
 * They say nothing about frame rate on a real GPU.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchBrowser, openPage, sleep } from './cdp.mjs';

const DEFAULTS = {
  url: 'http://localhost:5173/',
  out: 'docs/shots',
  dist: '0',
  w: 900,
  h: 1200,
  settle: 1200,
  boot: 45000,
  sim: 0,
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (const entry of argv) {
    const match = /^--([a-z]+)=(.*)$/.exec(entry);
    if (!match) continue;
    const [, key, value] = match;
    if (key in args) args[key] = /^\d+$/.test(value) && key !== 'dist' ? Number(value) : value;
  }
  return args;
}

function reportLogs(logs, phase) {
  const notable = logs.filter((entry) => entry.level === 'error' || entry.level === 'pageerror' || entry.level === 'warning');
  if (notable.length === 0) return;
  console.log(`  console (${phase}):`);
  for (const entry of notable.slice(0, 12)) {
    console.log(`    [${entry.level}] ${entry.text.split('\n')[0].slice(0, 200)}`);
  }
  logs.length = 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distances = String(args.dist).split(',').map((value) => Number(value.trim()));
  const outDir = resolve(process.cwd(), args.out);
  mkdirSync(outDir, { recursive: true });

  const browser = await launchBrowser({ width: Number(args.w), height: Number(args.h) });
  const page = await openPage(browser.port);

  try {
    console.log(`> ${args.url}`);
    await page.goto(args.url);

    const hasHook = await page
      .waitFor('window.__lane && window.__lane.ready', { timeoutMs: Number(args.boot), label: 'scene ready' })
      .then(() => true)
      .catch((error) => {
        console.log(`  ! ${error.message} -- capturing anyway`);
        return false;
      });

    reportLogs(page.logs, 'boot');
    if (!hasHook) await sleep(4000);

    for (const distance of distances) {
      if (hasHook && distance > 0) {
        await page.evaluate(`window.__lane.warpTo(${distance})`);
      }
      if (hasHook && Number(args.sim) > 0) {
        await page.evaluate(`window.__lane.simulate(${Number(args.sim)})`);
      }
      await sleep(Number(args.settle));

      const png = await page.screenshot();
      const name = `${String(distance).padStart(4, '0')}m.png`;
      writeFileSync(join(outDir, name), png);

      const state = hasHook ? await page.evaluate('JSON.stringify(window.__lane.summary())') : null;
      console.log(`  ${join(args.out, name)}  ${(png.length / 1024).toFixed(0)} KB${state ? `  ${state}` : ''}`);
      reportLogs(page.logs, `${distance}m`);
    }
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
