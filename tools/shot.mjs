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
 *   node tools/shot.mjs --biomes=forest,autumn,highlands,oasis --clip=#gameStage
 *
 * Software rendering means these frames are for LAYOUT AND COLOUR review only.
 * They say nothing about frame rate on a real GPU.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchBrowser, openPage, sleep } from './cdp.mjs';

const DEFAULTS = {
  url: 'http://localhost:3000/play',
  out: 'docs/shots',
  dist: '0',
  biomes: '',
  clip: '',
  w: 900,
  h: 1200,
  settle: 1200,
  boot: 45000,
  sim: 0,
};

const BIOME_FILES = {
  forest: '01-whispering-pines',
  autumn: '02-emberfall',
  highlands: '03-grey-crags',
  oasis: '04-sunwash-dunes',
};

/** Manual biome fade in the renderer is 1400ms; wait past that so palettes are pure. */
const BIOME_BLEND_MS = 2200;

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (const entry of argv) {
    const match = /^--([a-z]+)=(.*)$/.exec(entry);
    if (!match) continue;
    const [, key, value] = match;
    if (key in args) args[key] = /^\d+$/.test(value) && key !== 'dist' && key !== 'biomes' ? Number(value) : value;
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

function fileName(biome, distance) {
  const metres = `${String(distance).padStart(4, '0')}m`;
  if (!biome) return `${metres}.png`;
  const slug = BIOME_FILES[biome] ?? biome;
  return distance === 0 ? `${slug}.png` : `${slug}-${metres}.png`;
}

function roundClip(clip) {
  if (!clip || !(clip.width > 1) || !(clip.height > 1)) return null;
  return {
    x: Math.max(0, Math.floor(clip.x)),
    y: Math.max(0, Math.floor(clip.y)),
    width: Math.ceil(clip.width),
    height: Math.ceil(clip.height),
    scale: 1,
  };
}

async function isolateGameStage(page) {
  await page.evaluate(`(() => {
    const stage = document.getElementById('gameStage');
    document.querySelectorAll('header, footer').forEach((el) => { el.style.display = 'none'; });
    if (!stage?.parentElement) return;
    for (const el of [...stage.parentElement.children]) {
      if (el !== stage) el.style.display = 'none';
    }
    const main = stage.closest('main');
    if (main) {
      main.style.padding = '32px';
      main.style.minHeight = '100dvh';
      main.style.justifyContent = 'center';
    }
  })()`);
}

async function captureFrame(page, clipSelector) {
  if (!clipSelector) return page.screenshot();
  const clip = roundClip(await page.elementClip(clipSelector));
  return page.screenshot(clip);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const distances = String(args.dist).split(',').map((value) => Number(value.trim()));
  const biomes = String(args.biomes)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const shots = biomes.length > 0
    ? biomes.flatMap((biome) => distances.map((distance) => ({ biome, distance })))
    : distances.map((distance) => ({ biome: '', distance }));
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
    if (args.clip) await isolateGameStage(page);

    let lastBiome = '';
    for (const shot of shots) {
      if (hasHook && shot.biome && shot.biome !== lastBiome) {
        await page.evaluate(`window.__lane.restart()`);
        await page.evaluate(`(() => {
          const select = document.getElementById('biomeSelect');
          if (select) {
            const proto = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
            proto?.set?.call(select, ${JSON.stringify(shot.biome)});
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }
          window.__lane.setBiome(${JSON.stringify(shot.biome)});
        })()`);
        lastBiome = shot.biome;
        await sleep(BIOME_BLEND_MS);
      }
      if (hasHook && shot.distance > 0) {
        await page.evaluate(`window.__lane.warpTo(${shot.distance})`);
      }
      if (hasHook && Number(args.sim) > 0) {
        await page.evaluate(`window.__lane.simulate(${Number(args.sim)}, { firing: true })`);
      }
      await sleep(Number(args.settle));

      const png = await captureFrame(page, args.clip);
      const name = fileName(shot.biome, biomes.length > 0 && distances.length === 1 ? 0 : shot.distance);
      writeFileSync(join(outDir, name), png);

      const state = hasHook ? await page.evaluate('JSON.stringify(window.__lane.summary())') : null;
      console.log(`  ${join(args.out, name)}  ${(png.length / 1024).toFixed(0)} KB${state ? `  ${state}` : ''}`);
      reportLogs(page.logs, name);
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
