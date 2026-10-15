# Scope modes execution record

## Actions and changes
- Implemented Test Mode with two 9:16 live panels above the Proposal's six measurement types, fitting the desktop viewport without scrolling. Removed its header/footer and persistent camera/reset/character/trial controls. Camera permission is requested automatically on entry; rejection keeps Test Mode open with an Allow camera retry button inside the camera preview. Empty readings show zero. Idle animation keeps playing without tracking; hidden pages suspend it. Observer trial forms were removed at the author's request.
- Shared four-control pipeline uses torso lanes, consumable knee-step projectiles, hands-on-hips shielding and overhead-clap jumps. Physical hops and arm raises are not production triggers.
- Added calibrated game startup, inline character/difficulty selection, cadence speed/stop, explicit pause/resume, 20-minute milestone with continued play, manual finish and technical summaries.
- Replaced account/backend/persistent state with a visit-scoped repository and plain memory stores. Consolidated history/high scores in Profile; removed seven unsupported page routes and public catalog.html. Preserved catalog as a separate localhost developer tool.
- Fixed late Test Mode asset loading so a cancelled runtime cannot acquire and later lose its replacement's WebGL context.
- Preserved original DOCX files and game assets. Added document-alignment recommendations and refreshed README. Version 2.31.7-alpha.0.

## Validation
- 371 tests across 42 files passed; typecheck and lint passed.
- Coverage passed: statements 96.79%, branches 94.54%, functions 100%, lines 97.92%; every required aggregate exceeds 80%.
- Final production build passed and lists exactly the six product pages (plus framework metadata/not-found routes).
- Local software-Chrome scope check passed: six retained routes, eight removed URLs, two 9:16 panels and six measurement types fitting at 1366×768, 1024×600 and 768×600 without scrolling. Verified removed controls, zero-valued empty readings, one automatic camera request per entry, repeated denial staying in Test Mode and preview retry, synthetic camera acquisition and navigation cleanup, moving idle animation, developer pause/resume, finish/result and visit reset. No player-storage access or page exceptions. Synthetic camera checks are not real-webcam acceptance. Pose-model startup is network dependent and excluded from the current UI probe; runtime unit tests cover startup success/failure.
- GPU resource probe: 1,204 simulated seconds, 105 run restarts, 5,228 textures allocated, 5,137 deleted; late live-texture spread 27, all sampled live counts below 256. This is simulated/resource evidence, not real device FPS.

## Blockers and acceptance limits
- No code blockers.
- Real-webcam accuracy/cadence ground truth and the 20-minute target-device latency/FPS/stability acceptance remain unperformed and must be recorded by the researcher.
