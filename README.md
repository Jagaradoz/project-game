# Webcam Lane Runner

Endless 3-lane runner steered with your body. Lean left/right to switch lane, jog in
place to shoot. Built on a webcam pose-detection testbed that answers one question:
**is browser webcam pose detection fast and reliable enough to drive a game?**

- 3D forest trail, 3 lanes. You are a rigged **Knight**; the enemies are **skeletons**
- **Lean LEFT–CENTER–RIGHT** maps straight onto the 3 lanes. Lane changes **snap**;
  the mapping is absolute, so lean position and lane can never drift apart
- **The march never stops.** Jogging in place opens fire; stop jogging and the bullets
  stop while you keep walking into whatever is ahead
- Enemies die to one bullet and only score when killed. One that walks past you is a miss
- 3 HP, one hit each, brief grace period, then a score + distance screen
- Arrow keys / `A`,`D` work too, so the game is playable with no camera at all
- Detector debug (skeleton, offsets, cadence, FPS, inference ms) still there, collapsed
- One biome, **Whispering Pines**: a flat forest floor filled out to the fog line, with a
  far-forest layer that thins itself on slow devices
- The trail **winds**, without the lanes moving. See "The trail that isn't there" below
- Five rigged **adventurers** to run as, each throwing their own weapon
- Skeletons **die where they fall** and burst into bone chips
- Pose detection is 100% client side: no video ever leaves the browser.

Stack: **Next.js 16 (App Router) + TypeScript + Tailwind v4**, with
[MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) `PoseLandmarker` and
[Three.js](https://threejs.org) as pinned npm dependencies.

### How it is put together

`src/engine/` is framework-free and knows nothing about React: the game reducer, the two
pose detectors, and the whole Three.js scene live there, and `npm test` exercises them in
plain Node. `src/engine/runtime.ts` owns the lifecycle -- both animation loops, the camera,
the WebGL context -- and `dispose()` releases all of it, which is what makes React Strict
Mode's double mount safe. `src/components/game/GameCanvas.tsx` is the only React component
that touches the engine; it reads a throttled snapshot through `useSyncExternalStore`, so
nothing re-renders at 60 Hz.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. `/play` starts on the keyboard immediately; open
**Camera & detector debug** and click **Start Camera** to steer with your body.

`localhost` counts as a secure context, so the camera works over plain HTTP here.
First load pulls ~6 MB of WASM + model from the CDN, so give it a few seconds.

## Test on your phone (ngrok)

Leave `serve` running and open a **second terminal**:

```bash
ngrok http 3000
```

Open the printed `https://<random>.ngrok-free.app` URL on the phone.

Two things that will otherwise cost you time:

- ngrok's free tier shows an interstitial warning page first — tap **"Visit Site"**.
- The camera **only** works over HTTPS or localhost. Opening the LAN address
  (`http://192.168.x.x:3000`) on your phone will fail to get camera permission.
  Use the ngrok `https://` URL. The page detects this case and says so explicitly.

If `ngrok` is not on your PATH yet:

```powershell
winget install ngrok.ngrok
ngrok config add-authtoken <YOUR_TOKEN>
```

## Tests

Both detectors and the whole game are pure reducers, so they run headless:

```bash
npm test            # 65 tests, Vitest, no DOM and no Three.js
npm run typecheck   # tsc --noEmit, strict
npm run lint
npm run build
```

`npm run shot` is the end-to-end check: with `npm run dev` running it drives the real
WebGL scene in headless Chrome through the `window.__lane` hook and writes
`docs/shots/*.png`, so a rendering regression shows up as a picture.

Coverage is gated at 80% over the engine's pure logic. Browser-API glue -- scene
construction, `getUserMedia`, the MediaPipe wrapper, canvas drawing -- is excluded from
that number and covered by `npm run shot` instead; see `vitest.config.mts`.

## Tuning

Every threshold lives in [`src/engine/config.ts`](src/engine/config.ts). Nothing is hardcoded
elsewhere. The starting values are estimates from typical body proportions, not
measurements — expect one tuning pass against your own body and camera placement.

The values you are most likely to touch:

| Setting | Meaning |
| --- | --- |
| `lateral.enterOffset` / `exitOffset` | How far to lean before LEFT/RIGHT commits, and how far back before it releases. Units are shoulder-widths. |
| `lateral.invertSides` | Flip if the on-screen label reads backwards. |
| `lateral.shoulderWeight` | How much the midline trusts shoulders over hips. Raise it if jogging in place nudges the lean label; lower it if leaning from the waist feels too sensitive. |
| `jog.crossThreshold` / `peakThreshold` | How high a knee must swing to count. Units are torso-lengths. |
| `jog.minStepsInWindow` / `windowMs` | How much evidence before it says JOGGING. |
| `pose.model` | `'lite'` (default, fastest) or `'full'` (more accurate, slower). |
| `game.walkSpeed` / `maxSpeed` / `rampDistance` | How fast the march is and how quickly it speeds up. |
| `game.fireIntervalMs` / `bulletSpeed` | Rate of fire and how fast a shot travels. |
| `game.spawnIntervalMs` / `minSpawnIntervalMs` | How thick the enemy stream gets. |
| `game.maxHp` / `invulnMs` | How many hits a run survives, and the grace period after one. |
| `game.camera` | Where the camera sits. Move it back if the outer lanes clip on a narrow screen. |

## How the two detections work

Both signals are **normalised by body size**, so the thresholds do not change when
you stand closer to or further from the camera — a phone propped on a desk frames
you very differently from a laptop.

**Lean / step.** Takes the body midline — shoulders weighted 0.7 against hips,
because the pelvis swings sideways on every step and the shoulders do not — learns
a baseline over the first second of standing still, then reports the sideways
offset in shoulder-widths. Hysteresis is **signed**: you commit to a side at
±0.35 and hold it until the offset falls back inside ±0.20 *on that same side*, so
crossing the baseline releases immediately and stepping straight across flips the
label in one move. That weighting plus the signed release is what lets you steer
left/right while jogging in place. Hit **Recalibrate Center** any time you
reposition.

**Jog in place.** Uses the *difference* between the two knee heights, divided by
torso length — not absolute knee height. Symmetric motion (squatting, bobbing,
camera shake) cancels out of a difference; alternating motion does not. A two-state
machine counts each knee swap as a step, but only if that swing actually reached a
real amplitude, which is what rejects small sways. It reports JOGGING when at least
2 steps land in a 2.5-second window at a plausible human cadence (40–300 spm). The
amplitude gate is deliberately low (a knee swing of 0.06 torso-lengths), so a light
shuffle in place is enough to keep the road moving — raise `jog.crossThreshold` /
`peakThreshold` if idle fidgeting starts registering.

## Mirroring

The video is displayed mirrored, like a mirror, and the overlay canvas carries the
same CSS transform so the skeleton stays glued to your body. MediaPipe landmark
coordinates are in **raw, un-mirrored** camera space, so LEFT/RIGHT labels are
emitted from *your* perspective — step to your own left and it reads `LEFT`. Flip
`lateral.invertSides` if you disagree.

## Screenshots without a human

The game boots its 3D loop without ever touching the webcam, so the whole scene can be
photographed headlessly:

```bash
npm run dev                                        # in one shell
node tools/shot.mjs --dist=0,760,1500 --sim=6      # in another
```

Each shot lands in `docs/shots/` and prints draw calls, triangle count, the active
character and its resolved animation clips. `--sim` steps the real reducer at a fixed
timestep first, because software rendering is far too slow to reach an interesting
moment in wall-clock time. `tools/cdp.mjs` drives Chrome over the DevTools Protocol
using only Node built-ins — no browser-automation dependency.

**These frames are for layout and colour review only.** They render through SwiftShader
and say nothing about frame rate on real hardware.

## Layout

```
app/                              routes, one per TOR screen
app/page.tsx                      home: briefing, safety, privacy, study entry
app/(info)/how-to-play|consent    full instructions; study consent (gates /practice)
app/(game)/play/page.tsx          the game; client-only boundary for the canvas
app/(game)/calibrate|stages|result  camera setup, stage select, run summary
app/(account)/login|register|profile|profile/edit|leaderboard
app/(study)/practice              CONTROL GROUP: same detectors, zero game elements

src/engine/                       framework-free; no React, no JSX
src/engine/config.ts              every tunable value, game included
src/engine/runtime.ts             lifecycle: both loops, camera, scene, dispose()
src/engine/types.ts               shared shapes; config types derived from CONFIG
src/engine/core/state.ts          pure reducer: input over time -> lanes, enemies, bullets, HP, score
src/engine/core/stage.ts          pure: (biome, stage, difficulty) -> tuned config + goalKills
src/engine/core/input.ts          lean + keyboard -> { lane, isFiring }
src/engine/detectors/lateral.ts   pure reducer: landmarks -> LEFT/CENTER/RIGHT
src/engine/detectors/jog.ts       pure reducer: landmarks over time -> jogging + cadence
src/engine/pose/camera.ts         getUserMedia, iOS quirks, readable errors
src/engine/pose/pose.ts           PoseLandmarker load/detect, GPU -> CPU fallback
src/engine/pose/draw.ts           skeleton overlay
src/engine/util/landmarks.ts      visibility gating + scale-invariant body measurements
src/engine/util/luma.ts           frame brightness + the /calibrate lighting & distance verdicts
src/engine/util/smooth.ts         EMA, sliding window, cadence
src/engine/pose/exposure.ts       throttled 32x24 frame sampler feeding util/luma.ts
src/engine/render/scene.ts        Three.js scene assembly
src/engine/render/sync.ts         one-way sync: game state -> meshes
src/engine/render/world/          palette, biomes, sky, lighting, ground, scatter,
                                  trailEdge, clouds, rng
src/engine/render/actors/         rigged player, skeleton pool, bone-chip bursts

src/components/game/GameCanvas.tsx  the ONLY React component that touches the engine
src/components/game/               HUD, goal bar, calibration + practice panels, pickers
src/components/ui/                 Button, Card, Field, Notice, StatTile, PageShell
src/components/pose/PoseStage.tsx  full-size camera + skeleton, for /calibrate and /practice
src/hooks/useGameRuntime.ts        useSyncExternalStore bridge to the runtime
src/hooks/useSession.ts            who is signed in
src/hooks/useHydrated.ts           waits for a persisted store to read localStorage
src/lib/api/repository.ts          THE data interface every page calls
src/lib/api/mock/                  localStorage stand-in (deleted when the backend lands)
src/lib/api/live/                  the same interface over the real API
src/lib/api/catalog.ts             biome + stage catalogue, derived from the engine's BIOMES
src/lib/validation/account.ts      zod schemas shared by the forms and the data layer
src/lib/store/                     persisted settings + consent; the run handed to /result
src/types/api.ts                   the contract shared with the backend

public/assets/models/             338 CC0 .glb files, fetched at runtime
public/catalog.html               standalone 3D asset catalogue
tools/cdp.mjs                     dependency-free Chrome DevTools Protocol client
tools/shot.mjs                    headless screenshot harness
test/                             headless detector + game tests
```

## Screens, and where the data comes from

There is no backend yet -- TOR 5 gives it, the database and real auth to
นายวสันต์ จันทร์ฉิม. So every page talks to `GameRepository` (`src/lib/api/repository.ts`)
and `NEXT_PUBLIC_API_MODE` decides what is behind it:

- `mock` (default) -- `src/lib/api/mock/`, backed by `localStorage`. Progress, runs and
  the leaderboard are all **derived from stored runs**, so an unlock can never drift from
  the run that earned it. `submitRun` is idempotent on `clientRunId`, which is what stops
  a reloaded `/result` recording the same run twice.
- `live` -- `src/lib/api/live/`, the same interface over `apiRequest()`. Every response is
  validated against a zod schema at the boundary, so a backend that disagrees with
  `src/types/api.ts` fails loudly instead of rendering `undefined`.

Switching is one env var and no code change.

**Accounts in mock mode are local, and the UI says so on every account screen.** Passwords
are never stored -- only a PBKDF2-SHA256 digest with a per-account salt. It is a stand-in
so the screens can be built and reviewed, not an authentication system.

**`/practice` is the control group.** TOR 3 requires the control condition to do the same
movements through the same detectors with no character, enemies, score or stages. The
engine runs in `mode: 'pose'` there, which has no WebGL context and no reducer at all, and
`PageShell` drops to a study nav -- a link reading "ตารางคะแนน" would itself be a game
element in front of the control group.

## The two loops

The camera tops out near 30 FPS and inference is the expensive part, so the game does
not run inside the pose loop. Pose keeps its `requestVideoFrameCallback` loop and
writes `{ lane, isFiring }` into a shared snapshot; the game reads that snapshot from
its own `requestAnimationFrame` loop and renders at display rate. That also means the
runner boots and plays on the keyboard before the camera is ever granted.

## What to record while testing

The number the game concept lives or dies on is **inference ms on the phone**, not
desktop FPS. Note both, plus whether the backend tile reads `GPU` or `CPU` — the
CPU fallback engages automatically on devices where the WebGL delegate fails, and
it is much slower.

## The wandering edge

The path runs dead straight to the horizon, because **the lanes never move**. A lane is an
exact x in the reducer, and interpolating it would break the one rule the game is built
on: whatever the input says the lane is, that is the lane this frame.

What wanders is the **boundary between dirt and grass**. Every vertex is displaced
sideways in the vertex shader by a function of its world z, weighted so it peaks at the
trail's lip and dies to nothing at the centre and out in the bank
([trailEdge.ts](src/engine/render/world/trailEdge.ts)). Collision, spawning and lane geometry never
see it.

The dirt is deliberately **wider than the play area** — 9.8 units against the lanes' 7.2 —
so however far the edge pinches inward, the outer lane is still on it. That is a
guarantee, not a look: `test/world.test.js` sweeps the same wave table the GLSL is
generated from and asserts the tightest edge never crosses the lane boundary. Measured
clearance is 0.44 units.

Two chunks have to agree on the displacement or it comes apart:

| Chunk | What breaks without it |
| --- | --- |
| `project_vertex` | nothing moves at all |
| `worldpos_vertex` | the ground samples its shadow from the undisplaced position |

(A shadow *caster* would need its depth material patched too, which `patchObject` handles.
Today the only thing patched is the ground, which receives shadows without casting.)

The ground is tessellated into 120 slices along z for the same reason — a coarse strip
turns a wandering edge into a zigzag.

Props are deliberately **not** moved with the edge. A grass tuft that sometimes sits on
the dirt is what an encroached path edge looks like; moving them in lockstep would read as
more machined, not less.

## Clouds

One InstancedMesh, so the whole layer is a single draw call. They occupy a real volume
rather than a band at the horizon: near clouds are low, small and scroll at half the
world's speed, distant ones are high, large and barely move. That difference in rate is
what makes them read as objects you travel under.

Worth knowing about the camera: it aims about 7 degrees down, so the top of the frame only
reaches ~24 degrees above horizontal. A cloud stays in shot only while it is further ahead
than roughly 2.25x its height above the camera — they sweep up out of the picture rather
than passing directly overhead.

## Assets and licences

All 3D assets are CC0 and vendored under `assets/models/`.

| Asset | Source | Licence |
| --- | --- | --- |
| Nature kit (329 models) | [Kenney](https://kenney.nl) Nature Kit | CC0 |
| Knight, Rogue, Hooded Rogue, Mage, Barbarian | [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers) | CC0 |
| Skeleton Minion | [KayKit Skeletons](https://kaylousberg.itch.io/kaykit-skeletons) | CC0 |
| Robot / X-Bot / Soldier | three.js examples | as per three.js |

The KayKit licence text is kept alongside the models in
`assets/models/characters/KayKit-LICENSE.txt`. Attribution is not required by CC0, but
Kay Lousberg and Kenney are credited here because the art is most of what you see.

### Why the kit recolours so cheaply

Every nature model is 5-17 KB, carries **no textures at all**, and names its materials
for what they are (`grass`, `leafsGreen`, `woodBark`, `stone`). Colour is therefore a
lookup table rather than an art job: `src/engine/render/world/palette.ts` maps material names to
hex values, so the kit's authored colours can be corrected in one place with no extra
download.
