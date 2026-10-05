Summary of actions taken
- Exported the current Blender environment catalog to 38 standalone runtime GLBs without saving or replacing the original catalog or nature-kit models.
- Applied revised trees, palms, stones, outcrops, flowers, grass, mushrooms and stumps to game scenery. Root oak appears once per landmark cycle; distant forest uses the two light pine models.

Key changes
- Added seeded random grass, stones and trees on safe flat outcrop tops, including smaller roadside outcrops. Preserved authored materials, shared instance batches, quality thinning and platform-relative scrolling at the wrap seam.
- Added small dirt-shoulder grass and stones outside the physical lanes. Development version: 2.8.0-alpha.1.

Validation or test results
- All 38 GLBs passed container, geometry grounding, model-only and plateau metadata checks.
- Camera-free browser review confirmed revised scenery renders and no model-load errors. Device GPU performance and webcam tracking were not tested.
- Final repository tests with coverage: 170 passed; coverage thresholds passed. Typecheck, lint, production build and diff whitespace checks passed. Preview: docs/shots/environment-integration/game.png.

Blockers
- None.
