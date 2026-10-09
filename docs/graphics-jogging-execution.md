# Graphics presets and light jogging

## Summary of actions taken
- Added saved Low / Medium / High graphics controls before and during play.
- Retuned light jogging detection and validated rendering and detector behavior.
- Incremented development version to `2.30.0-alpha.0`.

## Key changes
- Low: 30% of nearby vegetation, no distant filler, clouds, motes or shadows; pixel ratio capped at 1 and scene work at 30 FPS.
- Medium (default): 65% nearby vegetation, 50% distant filler and motes, 1024px shadows; pixel ratio capped at 1.5 and scene work at 45 FPS.
- High: full scenery, 2048px shadows; pixel ratio capped at 2 and scene work at 60 FPS.
- Presets apply without rebuilding the scene or restarting the run. Sustained poor frame rates can lower the active preset; the saved preference remains intact.
- Game stepping and scene synchronization share the frame budget, preserving transient combat events and accumulated elapsed play time. Camera inference keeps its existing independent lifecycle.
- Knee crossing threshold reduced from 0.035 to 0.025 torso lengths; amplitude noise gate reduced from 0.06 to 0.05; smoothing increased to 0.65. Missing knees clear the phase to prevent phantom return steps.

## Validation or test results
- `npm test`: 39 files / 390 tests passed.
- `npm run typecheck` and `npm run lint`: passed.
- `npx vitest run --coverage`: passed the 80% gates (95.11% statements, 91.56% branches, 99.51% functions, 96.37% lines).
- Synthetic light jogging (0.06 torso-length amplitude) passed at 15/20/30 FPS, 60-180 steps/minute and multiple body scales; jitter, bobbing, stopping and missing-knee checks passed.
- `node tools/check-graphics.mjs`: cold Low startup, live switches, shadow restoration, scenery thinning, persistence and desktop/mobile-width layouts passed. Final screenshots and measurements are in `docs/shots/graphics/`.
- The development server restarted successfully with default Turbopack after an initial HMR crash.

## Blockers
- No implementation blockers. Software-browser checks do not establish physical-webcam acceptance or FPS on a low-end CPU/GPU or physical mobile device.
