# Trail hazard replacement — 2.10.0-alpha.0

## River and stone refinement — 2.10.1-alpha.0

- Widened rivers from 0.9 to 1.6 units along travel and extended water/banks to 512 units on each side, beyond the terrain and fog. Terrain clipping spans the entire landscape; sampled water and banks follow its profile without road-edge caps. River contact, enemy spacing, and lane-marker hiding use the wider bounds; solid hazard bounds stay at 0.45 units.
- Replaced the dirt outcrop `rock_smallA` with all five existing Blender-catalog small stone exports: medium single/pair/trio and small pair/pile. Kept deterministic placement, pooled instances, original materials, height limits, and open-lane clearance. Blender sources are unchanged.
- Passed 242 tests, typecheck, lint, and coverage (statements 91.96%, branches 88.62%, functions 95.40%, lines 92.66%). Full software-rendered Chrome hazard checks passed all seven layouts, jumping, dodging, single hits, drowning delay, and restart without shader/browser errors. Inspected refreshed river approach/jump and all three stone captures below. Scene totals: stones 346 draw calls; river 353 draw calls.
- Refreshed the open in-app game panel. Physical webcam and hardware-GPU acceptance remain unverified.

## Summary of actions

Replaced the long-root tree's obstacle and roadside uses with seven log, stone, and river layouts. Preserved original tree/catalog assets and existing uncommitted character/jump work. One bounded asset worker authored and validated the logs; the supervisor integrated and validated gameplay, rendering, and feedback.

## Key changes

- Logs and stone bands fill two adjacent lanes or all three. Open lanes remain usable; grounded contact costs one HP per crossing, respecting damage grace. Ten varied small stones per occupied lane use shared instanced geometry.
- Perpendicular, 0.9-unit rivers span the road and shoulders. Terrain clipping follows the displaced road, banks close the raised verge, and intersecting lane markers are hidden. A missed jump drowns instantly regardless of HP or invulnerability; drowning takes precedence over a simultaneous stage win.
- Swept collision checks clearance throughout contact, including early landings. Seeded spawning keeps the 8.5-second cadence and four slots, with 40/40/20 type weights, protected enemy-arrival windows, and boss entry deferred until crossings finish.
- Drowning uses one pooled splash and a 650 ms sink before the defeat panel. Presentation time advances independently of frozen gameplay. Restart resets water masks, particles, and sinking; scene disposal releases shared and instanced resources.
- HUD/instructions identify hazards, open escape lanes, and fatal river crossings. Development version and lockfile now read `2.10.0-alpha.0`; saved-run payloads are unchanged.
- Editable log source: `public/assets/models/blender/environment/trail_logs.blend`. Runtime GLBs contain 588 / 692 triangles for the 4.8 / 7.2-unit variants. Asset details: [record](</D:/Engineering Works/project-game/docs/tasks/hazard-assets-record.md>).

## Validation and test results

- `npm test`: 21 files, **241 tests passed**. Includes every occupied/open lane, jump timing, swept crossings, single hits, fatal/invulnerable drowning, simultaneous stage completion, deterministic layouts, enemy spacing, boss deferral, presentation timing, restart, and real GLB bounds.
- `npm run typecheck` and `npm run lint`: passed. `git diff --check`: passed.
- `npx vitest run --coverage`: passed all 80% floors; statements 91.96%, branches 88.20%, functions 95.40%, lines 92.66%.
- `node tools/check-hazards.mjs`: seven variants, open-lane dodges, jumps, single-hit contacts, drowning/overlay delay, and restart passed in installed Chrome with software WebGL; no browser/shader errors. Final river refinement rechecked with `--river-only`. Reports: [seven layouts](</D:/Engineering Works/project-game/docs/shots/trail-hazards/validation.json>) and [final river](</D:/Engineering Works/project-game/docs/shots/trail-hazards/river-validation.json>).
- `node tools/check-gameplay.mjs`: full stage autoplay crossed rivers, reached and defeated the boss, exercised warning/dodge behavior, and verified normal damage/death. Captures saved separately under `docs/shots/gameplay-hazards/`.
- Inspected gameplay-camera captures of all seven layouts, the airborne river crossing, sinking, and the defeat panel. Fixed bank occlusion and terrain gaps found during this review. Final fixture scene: logs 336 draw calls, stones 339, river 353; these totals include existing scenery and player rendering.

| Layout | Gameplay-camera capture |
|---|---|
| Log, left + centre | [View](</D:/Engineering Works/project-game/docs/shots/trail-hazards/log-2-lanes-left.png>) |
| Log, centre + right | [View](</D:/Engineering Works/project-game/docs/shots/trail-hazards/log-2-lanes-right.png>) |
| Log, all three | [View](</D:/Engineering Works/project-game/docs/shots/trail-hazards/log-3-lanes-left.png>) |
| Stones, left + centre | [View](</D:/Engineering Works/project-game/docs/shots/trail-hazards/stones-2-lanes-left.png>) |
| Stones, centre + right | [View](</D:/Engineering Works/project-game/docs/shots/trail-hazards/stones-2-lanes-right.png>) |
| Stones, all three | [View](</D:/Engineering Works/project-game/docs/shots/trail-hazards/stones-3-lanes-left.png>) |
| River, all three | [View](</D:/Engineering Works/project-game/docs/shots/trail-hazards/river-3-lanes.png>) |
| River jump / sink / defeat | [Jump](</D:/Engineering Works/project-game/docs/shots/trail-hazards/river-jump.png>), [sink](</D:/Engineering Works/project-game/docs/shots/trail-hazards/river-sinking.png>), [panel](</D:/Engineering Works/project-game/docs/shots/trail-hazards/river-defeat-panel.png>) |

## Blockers / unverified acceptance

Live Chrome control was unavailable (`Browser is not available: chrome`). Human webcam jumping and hardware-GPU frame rate remain unverified; software-rendered browser checks do not establish either. The development server is available at [local game](http://localhost:3000/play).

## Enemy scale, enemy animation, bigger hazards — 2.11.0-alpha.0

- Enemies sized against the player (mage ≈3.7 with hat): scout 3.4, skeleton 3.7, brute 3.9, treant 8. Collision radii grew with them (1 / 1.05 / 1.3 / 2).
- Brute (tank) `approachSpeed` -3 → +1. Negative made it slide backwards over the scrolling ground while its Walk clip stepped forward. It is still the slowest enemy.
- Hit and Attack clips are now additive overlays over the Walk/Run/Idle loop. Previously each one replaced the whole pose, so a brute under fire (every ~190 ms) never got to walk. Fresh slots also evaluate their first pose immediately instead of showing the bind pose.
- Jump height 1.65 → 2.4 and clearance 0.8 → 1.2 (same ratio) so hazards can grow with the player. Logs 1.25 tall, mossy, with shelf mushrooms (rebuilt with `tools/build_trail_logs.py`). Stone bands are boulders 1.1 tall at most with gap fillers. River 2.6 deep (radius 1.3) with a darker channel, bank foam, wet mud and boulders on both banks.
- Tools: `tools/check-enemy-anims.mjs` samples the clip each live enemy plays; `docs/shots/hazard-rework/` has review captures.
