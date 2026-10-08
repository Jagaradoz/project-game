# Long-play lag fix — 2.27.2-alpha.0

- Actions: audited runtime/reducer accumulation and measured real WebGL texture allocations and deletions in Chrome.
- Key changes: dispose cloned enemy/corpse/player skeleton textures when replacing rigs; release cached player assets, point/sprite textures and shadow targets during teardown; close replaced/cancelled pose models; continue checking frame times throughout play and reduce shadows, scenery detail and pixel ratio after sustained slowdown. Hidden tabs and isolated stalls do not trigger quality changes.
- Validation: the original three-minute simulation grew from 30 to 666 live GPU textures, with no deletions. The same probe after the fix reached 113 and released 576 textures. The longer regression simulated 724 seconds and 60 run restarts: its last four samples were 91, 71, 93 and 113 live textures (spread 42), with 2,682 texture deletions and no browser errors. All 332 tests, typecheck, lint, coverage thresholds and diff checks passed.
- Blockers/limits: no implementation blocker. Chrome used software rendering and simulated controls; physical webcam play, hardware FPS and thermal behavior were not measured.

Reproduce against the development server with `node tools/check-long-play.mjs`. Resource tests also cover repeated rig swaps, shared skeleton disposal, late character/pose loads and CPU pose fallback. Quality tests start with three smooth minutes before a sustained slowdown.
