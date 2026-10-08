# Game runtime audit - 2.28.4-alpha.0

Summary of actions taken
- Audited camera/pose lifecycle, scene startup and teardown, idle rendering, frame timing, and scrolling GPU buffers. Implemented fixes and regression checks.

Key changes
- Camera startup supports cancellation during permission, metadata, and playback; failures release streams and metadata listeners. Late permission results release their stream without replacing the current video source.
- Runtime teardown releases and detaches owned streams, cancels startup, resets timing/readouts, and permits immediate retry. Obsolete requests cannot unlock or close newer startup resources.
- Pose initialization cancelled during WASM loading no longer starts a model. Inference failures stop resources cleanly; hidden pose callbacks skip inference/exposure and reset timing before resuming.
- Stationary dialogs and paused previews repaint when their state, character, or size changes. Unchanged HUD snapshots retain their identity; stationary scenery and hidden clouds skip repeated buffer uploads.
- Hidden game callbacks pause simulation and rendering; visibility changes reset the frame clock. Lane movement uses elapsed time and matches at 30, 60, and 120 Hz.
- Failed scene startup releases WebGL, shadow resources, and already-loaded actor caches. Disposal during character loading cannot register a late resize observer or debug hook; obsolete character requests cannot replace newer projectile styling.

Validation or test results
- Full Vitest: 36 files, 358 tests passed. Typecheck, ESLint, and diff checks passed.
- Coverage passed every 80% threshold: statements 95.04%, branches 91.39%, functions 99.51%, lines 96.33% (configured engine logic and data-layer scope).
- Chrome GPU probe: over the same 12 idle frames, draw calls fell from 5,148 to 0 and buffer uploads from 2,520 to 0. Active play still draws and uploads; resize/warp repaint correctly. Synthetic hidden callbacks performed zero GPU work and preserved distance, then resumed. The development camera bypass made zero camera requests. Screenshot inspected.
- Long-play resource regression: 724 simulated seconds, 59 restarts, late live-texture spread 22, and 2,721 texture deletions; no browser errors. Reproduce with `node tools/check-runtime-performance.mjs` and `node tools/check-long-play.mjs` against the development server.

Blockers
- No implementation blockers. Lifecycle tests mock browser/MediaPipe APIs; browser checks use software Chrome and simulated controls. Physical webcam behavior, hardware FPS, and thermal performance remain unmeasured.
