import type { NextConfig } from 'next';

/**
 * The 3D models under public/assets are fetched at runtime by GLTFLoader using
 * paths built by string concatenation, so the bundler can neither trace nor
 * fingerprint them. They must stay plain static files -- do not add a loader
 * rule for .glb.
 */
import os from 'node:os';

function getAllowedDevOrigins(): string[] {
  const origins = new Set<string>([
    'localhost',
    '127.0.0.1',
    '*.trycloudflare.com',
    '**.trycloudflare.com',
    '*.ngrok-free.app',
    '*.ngrok.io',
    '*.localtunnel.me',
  ]);

  try {
    const interfaces = os.networkInterfaces();
    for (const ifaces of Object.values(interfaces)) {
      for (const iface of ifaces || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          origins.add(iface.address);
        }
      }
    }
  } catch {
    // Ignore interface lookup failure
  }

  return Array.from(origins);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  allowedDevOrigins: getAllowedDevOrigins(),
  async redirects() {
    return [{ source: '/how-to-play', destination: '/#how-to-play', permanent: true }];
  },
};

export default nextConfig;
