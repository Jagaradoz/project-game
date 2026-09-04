/**
 * Minimal Chrome DevTools Protocol client.
 *
 * Node 22 ships a global WebSocket and fetch, so driving a headless Chrome needs
 * no dependencies at all -- which keeps the screenshot harness from dragging a
 * browser-automation library into a project that has exactly one devDependency.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const LAUNCH_TIMEOUT_MS = 20000;
const CALL_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 100;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Software rendering: there is no GPU on a headless box, and SwiftShader draws WebGL correctly. */
function chromeArgs(port, userDataDir, width, height) {
  return [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    // Without these the renderer treats the window as occluded and throttles
    // requestAnimationFrame, so the game clock barely advances between shots.
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-features=CalculateNativeWinOcclusion',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    'about:blank',
  ];
}

async function waitForEndpoint(port, deadlineMs) {
  while (Date.now() < deadlineMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return await response.json();
    } catch {
      // Chrome has not opened the port yet; keep polling until the deadline.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Chrome did not expose a debugging port on ${port} in time`);
}

export async function launchBrowser({ width = 900, height = 1200, port = 9333 } = {}) {
  const executable = CHROME_CANDIDATES.find(Boolean);
  if (!executable) throw new Error('No Chrome binary found. Set CHROME_PATH.');

  const userDataDir = mkdtempSync(join(tmpdir(), 'lane-shot-'));
  const child = spawn(executable, chromeArgs(port, userDataDir, width, height), {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  const stderr = [];
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)));

  try {
    await waitForEndpoint(port, Date.now() + LAUNCH_TIMEOUT_MS);
  } catch (error) {
    child.kill('SIGKILL');
    throw new Error(`${error.message}\n${stderr.join('').slice(-2000)}`);
  }

  return {
    port,
    async close() {
      child.kill('SIGKILL');
      // Chrome flushes its profile asynchronously, so a removal straight after
      // the kill can lose a race with its own writes. One retry is enough.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          rmSync(userDataDir, { recursive: true, force: true });
          return;
        } catch {
          await sleep(250);
        }
      }
    },
  };
}

/** One CDP session against a fresh tab, with console and page errors captured. */
export async function openPage(port) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const logs = [];
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP socket failed to open')), { once: true });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.consoleAPICalled') {
      const text = message.params.args.map(describeRemoteObject).join(' ');
      logs.push({ level: message.params.type, text });
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      logs.push({ level: 'pageerror', text: details.exception?.description || details.text });
    } else if (message.method === 'Log.entryAdded') {
      logs.push({ level: message.params.entry.level, text: message.params.entry.text });
    }
  });

  function send(method, params = {}) {
    const id = nextId += 1;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`CDP call timed out: ${method}`));
      }, CALL_TIMEOUT_MS);
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  return {
    logs,
    send,
    async goto(url) {
      await send('Page.navigate', { url });
    },
    /** Evaluates in page context and unwraps the value, awaiting promises. */
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed');
      }
      return result.result.value;
    },
    /** Polls an expression until it is truthy, so captures never race asset loads. */
    async waitFor(expression, { timeoutMs = 30000, label = expression } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          if (await this.evaluate(`Boolean(${expression})`)) return true;
        } catch {
          // The page may still be navigating; retry until the deadline.
        }
        await sleep(POLL_INTERVAL_MS);
      }
      throw new Error(`Timed out waiting for: ${label}`);
    },
    async screenshot() {
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      return Buffer.from(data, 'base64');
    },
    async close() {
      socket.close();
    },
  };
}

function describeRemoteObject(arg) {
  if (arg.value !== undefined) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
  return arg.description || arg.type;
}
