/**
 * Mobile Development Runner with Cloudflare HTTPS Tunnel.
 *
 * Browsers require a secure context (HTTPS or localhost) for webcam access
 * (navigator.mediaDevices.getUserMedia). When opening on a mobile device over
 * the local network, an HTTPS tunnel (e.g. Cloudflare Quick Tunnel) provides
 * seamless camera access without SSL certificate warnings.
 *
 * Usage:
 *   node tools/mobile.mjs
 *   npm run dev:mobile
 */

import { spawn, execSync } from 'node:child_process';
import os from 'node:os';
import readline from 'node:readline';

const PORT = process.env.PORT || 3000;

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address });
      }
    }
  }

  // Prioritize Wi-Fi / WLAN adapters
  const wifi = candidates.find((c) => /wi-fi|wlan/i.test(c.name));
  if (wifi) return wifi.address;

  // Prioritize typical home/hotspot subnets
  const typical = candidates.find(
    (c) => c.address.startsWith('172.20.') || c.address.startsWith('192.168.'),
  );
  if (typical) return typical.address;

  return candidates[0]?.address || '127.0.0.1';
}

function killProcess(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  } catch {
    // Process may have already exited
  }
}

async function main() {
  const localIp = getLocalIp();
  console.log('\x1b[36m%s\x1b[0m', '🚀 Starting Webcam Exergame Mobile Runner...');

  // 1. Start Next.js dev server on 0.0.0.0
  const isWindows = process.platform === 'win32';
  const nextBin = './node_modules/next/dist/bin/next';

  const nextProcess = spawn(process.execPath, [nextBin, 'dev', '-H', '0.0.0.0', '-p', String(PORT)], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
  });

  nextProcess.stdout.on('data', (data) => {
    const text = data.toString();
    if (/ready in/i.test(text) || /started server on/i.test(text)) {
      console.log('\x1b[32m%s\x1b[0m', `✓ Next.js dev server ready on port ${PORT}`);
    }
  });

  nextProcess.stderr.on('data', (data) => {
    process.stderr.write(data);
  });

  // 2. Start Cloudflare Tunnel for secure HTTPS webcam access
  let tunnelUrl = null;
  const cloudflaredCmd = isWindows ? 'cloudflared.exe' : 'cloudflared';
  const cfProcess = spawn(cloudflaredCmd, ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });

  const rl = readline.createInterface({ input: cfProcess.stderr });
  rl.on('line', (line) => {
    const match = line.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !tunnelUrl) {
      tunnelUrl = match[0];
      printBanner(tunnelUrl, localIp);
    }
  });

  cfProcess.stdout.on('data', (data) => {
    const match = data.toString().match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !tunnelUrl) {
      tunnelUrl = match[0];
      printBanner(tunnelUrl, localIp);
    }
  });

  function printBanner(httpsUrl, lanIp) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(httpsUrl)}`;
    console.log('\n\x1b[32m%s\x1b[0m', '============================================================');
    console.log('\x1b[1m\x1b[33m%s\x1b[0m', '  Webcam Exergame - Mobile Access Ready! 🎮📱');
    console.log('\x1b[32m%s\x1b[0m', '============================================================\n');
    console.log('\x1b[1m\x1b[32m%s\x1b[0m', `  📱 Mobile HTTPS URL (Webcam Enabled):`);
    console.log(`     ${httpsUrl}\n`);
    console.log('\x1b[36m%s\x1b[0m', `  💻 Local Network URL (no camera -- plain HTTP):`);
    console.log(`     http://${lanIp}:${PORT}\n`);
    console.log('\x1b[37m%s\x1b[0m', `  🖥️  Local Machine URL:`);
    console.log(`     http://localhost:${PORT}\n`);
    console.log('\x1b[35m%s\x1b[0m', `  📷 Scan QR Code to Open on Mobile:`);
    console.log(`     ${qrUrl}\n`);
    console.log('\x1b[32m%s\x1b[0m', '============================================================');
    console.log('\x1b[90m%s\x1b[0m', '  Note: Video processing runs locally on your phone.');
    console.log('\x1b[90m%s\x1b[0m', '  Press Ctrl+C to stop both dev server and tunnel.\n');
  }

  const cleanup = () => {
    console.log('\nStopping servers...');
    killProcess(nextProcess);
    killProcess(cfProcess);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);
}

main().catch((err) => {
  console.error('Failed to start mobile runner:', err);
  process.exit(1);
});
