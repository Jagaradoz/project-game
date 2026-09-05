import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * The engine is framework-free and has no DOM coupling in its testable parts,
 * so these run in the plain node environment -- no jsdom, same as the original
 * `node --test` setup.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      /**
       * The threshold applies to the engine's pure logic -- the reducers, the
       * detectors and their maths -- which is what can actually be asserted
       * headlessly.
       *
       * Excluded below is browser-API glue with no logic worth asserting in
       * isolation: Three.js scene construction, getUserMedia, the MediaPipe
       * wrapper, canvas drawing and the runtime's loop wiring. Those are
       * verified by `npm run shot`, which drives the real scene in a headless
       * browser, and by the manual pass in the README.
       */
      include: [
        'src/engine/**',
        // The data layer is pure too: the repository is derivation over a
        // storage map, and the schemas and formatters are plain functions.
        'src/lib/api/**',
        'src/lib/validation/**',
        'src/lib/format.ts',
      ],
      exclude: [
        'src/engine/render/**',
        'src/engine/pose/**',
        'src/engine/runtime.ts',
        'src/engine/types.ts',
        // The live adapter cannot be exercised until the backend exists; it is
        // schema declarations plus one apiRequest call per endpoint.
        'src/lib/api/live/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
