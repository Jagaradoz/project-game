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
- The run travels through **four biomes** — forest, autumn, highlands, oasis — crossfading
  every 700 m in palette and in which props line the trail, or pick one from the selector
- The trail **winds**, without the lanes moving. See "The trail that isn't there" below
- Five rigged **adventurers** to run as, each throwing their own weapon
- Skeletons **die where they fall** and burst into bone chips
- 100% client side. No server processing, no login, no database, no build step.

Stack: plain HTML/CSS/ES modules, [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe)
`PoseLandmarker` and [Three.js](https://threejs.org), both loaded from jsDelivr at pinned
versions. Zero npm dependencies.

## Run locally

```powershell
cd "d:\Browser Works\test-game"
npx -y serve . -l 5173
```

Open <http://localhost:5173>. The runner starts immediately on the keyboard; open
**Camera & detector debug** and click **Start Camera** to steer with your body.

`localhost` counts as a secure context, so the camera works over plain HTTP here.
First load pulls ~6 MB of WASM + model from the CDN, so give it a few seconds.

## Test on your phone (ngrok)

Leave `serve` running and open a **second terminal**:

```powershell
ngrok http 5173
```

Open the printed `https://<random>.ngrok-free.app` URL on the phone.

Two things that will otherwise cost you time:

- ngrok's free tier shows an interstitial warning page first — tap **"Visit Site"**.
- The camera **only** works over HTTPS or localhost. Opening the LAN address
  (`http://192.168.x.x:5173`) on your phone will fail to get camera permission.
  Use the ngrok `https://` URL. The page detects this case and says so explicitly.

If `ngrok` is not on your PATH yet:

```powershell
winget install ngrok.ngrok
ngrok config add-authtoken <YOUR_TOKEN>
```

## Tests

Both detectors and the whole game are pure reducers, so they run headless:

```powershell
npm test
```

## Tuning

Every threshold lives in [`src/config.js`](src/config.js). Nothing is hardcoded
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
index.html                  game canvas + HUD, webcam thumbnail, debug panel
styles.css                  layout only, including the mirror transform
src/config.js               every tunable value, game included
src/camera.js               getUserMedia, iOS quirks, readable errors
src/pose.js                 PoseLandmarker load/detect, GPU -> CPU fallback
src/draw.js                 skeleton overlay
src/detectors/lateral.js    pure reducer: landmarks -> LEFT/CENTER/RIGHT
src/detectors/jog.js        pure reducer: landmarks over time -> jogging + cadence
src/game/state.js           pure reducer: input over time -> lanes, enemies, bullets, HP, score
src/game/input.js           lean + keyboard -> { lane, isFiring }
src/game/scene.js           Three.js scene assembly and the biome crossfade
src/game/render.js          one-way sync: game state -> meshes
src/game/world/palette.js   biome palettes + the Kenney material recolour map
src/game/world/biomes.js    biome progression, blending, scatter-set selection
src/game/world/sky.js       vertex-coloured gradient dome
src/game/world/lighting.js  renderer setup, sun + shadow rig
src/game/world/ground.js    valley cross-section, trail stones, horizon ridges
src/game/world/scatter.js   instanced scenery, one InstancedMesh per model part
src/game/world/curve.js     the vertex-shader trail bend
src/game/world/clouds.js    instanced drifting clouds
src/game/world/rng.js       seeded RNG for world building
src/game/actors/player.js   rigged character, animation graph, weapon loadout
src/game/actors/enemies.js  rigged skeleton pool with capped mixer updates
src/game/actors/effects.js  instanced bone-chip bursts
src/util/landmarks.js       visibility gating + scale-invariant body measurements
src/util/smooth.js          EMA, sliding window, cadence
src/main.js                 wiring: pose loop, game loop, HUD
tools/cdp.mjs               dependency-free Chrome DevTools Protocol client
tools/shot.mjs              headless screenshot harness
test/                       headless detector + game tests
```

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

## The trail that isn't there

The path visibly bends and rolls, but **the lanes never move**. A lane is an exact x in
the reducer, and interpolating it would break the one rule the game is built on: whatever
the input says the lane is, that is the lane this frame.

So the world does not actually curve. Every vertex is displaced sideways and vertically
in the vertex shader by a function of its world z, ramped to zero at the player
([curve.js](src/game/world/curve.js)). Collision, spawning and lane geometry never see it;
the trail runs dead straight underfoot and winds away into the distance.

Three things have to agree on that displacement or it comes apart:

| Chunk | What breaks without it |
| --- | --- |
| `project_vertex` | nothing bends at all |
| `worldpos_vertex` | surfaces sample their shadow from the unbent position |
| the depth material | objects are drawn bent but cast shadows from where they were |

The ground is tessellated into 74 slices along z for the same reason — a two-slice strip
has nothing to bend, it just shears.

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
lookup table rather than an art job: `src/game/world/palette.js` maps material names to
hex values, so the same 329 models repaint themselves for a new biome. Autumn is the
forest with a different table — no extra download.
