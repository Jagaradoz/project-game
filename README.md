# Webcam Pose Detection MVP

Client-side testbed for an exercise-game concept. Answers one question: **is browser
webcam pose detection fast and reliable enough to drive a game?**

- Live webcam feed with the detected skeleton drawn on top
- **Lean / step LEFT–CENTER–RIGHT** from shoulder + hip midline
- **Jogging in place** detection with a steps-per-minute readout
- **FPS** and **inference milliseconds** shown separately
- 100% client side. No server processing, no login, no database, no build step.

Stack: plain HTML/CSS/ES modules + [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe)
`PoseLandmarker`, loaded from jsDelivr.

## Run locally

```powershell
cd "d:\Browser Works\test-game"
npx -y serve . -l 5173
```

Open <http://localhost:5173> and click **Start Camera**.

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

Both detectors are pure reducers over landmark arrays, so they run headless:

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
| `jog.crossThreshold` / `peakThreshold` | How high a knee must swing to count. Units are torso-lengths. |
| `jog.minStepsInWindow` / `windowMs` | How much evidence before it says JOGGING. |
| `pose.model` | `'lite'` (default, fastest) or `'full'` (more accurate, slower). |

## How the two detections work

Both signals are **normalised by body size**, so the thresholds do not change when
you stand closer to or further from the camera — a phone propped on a desk frames
you very differently from a laptop.

**Lean / step.** Takes the midline of shoulders and hips, learns a baseline over
the first second of standing still, then reports the sideways offset in
shoulder-widths. Hysteresis (enter at 0.35, release at 0.20) stops the label
chattering when you hover on the boundary. Hit **Recalibrate Center** any time you
reposition.

**Jog in place.** Uses the *difference* between the two knee heights, divided by
torso length — not absolute knee height. Symmetric motion (squatting, bobbing,
camera shake) cancels out of a difference; alternating motion does not. A two-state
machine counts each knee swap as a step, but only if that swing actually reached a
real amplitude, which is what rejects small sways. It reports JOGGING when at least
3 steps land in a 2-second window at a plausible human cadence (60–240 spm).

## Mirroring

The video is displayed mirrored, like a mirror, and the overlay canvas carries the
same CSS transform so the skeleton stays glued to your body. MediaPipe landmark
coordinates are in **raw, un-mirrored** camera space, so LEFT/RIGHT labels are
emitted from *your* perspective — step to your own left and it reads `LEFT`. Flip
`lateral.invertSides` if you disagree.

## Layout

```
index.html                  video + overlay canvas + HUD
styles.css                  layout only, including the mirror transform
src/config.js               every tunable value
src/camera.js               getUserMedia, iOS quirks, readable errors
src/pose.js                 PoseLandmarker load/detect, GPU -> CPU fallback
src/draw.js                 skeleton overlay
src/detectors/lateral.js    pure reducer: landmarks -> LEFT/CENTER/RIGHT
src/detectors/jog.js        pure reducer: landmarks over time -> jogging + cadence
src/util/landmarks.js       visibility gating + scale-invariant body measurements
src/util/smooth.js          EMA, sliding window, cadence
src/main.js                 wiring + render loop + FPS meter
test/                       headless detector tests
```

## What to record while testing

The number the game concept lives or dies on is **inference ms on the phone**, not
desktop FPS. Note both, plus whether the backend tile reads `GPU` or `CPU` — the
CPU fallback engages automatically on devices where the WebGL delegate fails, and
it is much slower.
