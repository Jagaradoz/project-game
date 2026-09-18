import type { NextConfig } from 'next';

/**
 * The 3D models under public/assets are fetched at runtime by GLTFLoader using
 * paths built by string concatenation, so the bundler can neither trace nor
 * fingerprint them. They must stay plain static files -- do not add a loader
 * rule for .glb.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: '/how-to-play', destination: '/#how-to-play', permanent: true }];
  },
};

export default nextConfig;
