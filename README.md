# Webcam Exercise Game

A browser game controlled by four gentle movements, with a separate Test Mode for learning and technical evaluation. The implementation follows Proposal first, compatible TOR requirements, Research movement guidance, and the author's confirmed layout decisions.

## Run

```powershell
npm install
npm run dev
```

Open http://localhost:3000. The public pages are Home (`/`), Calibration (`/calibrate`), Test Mode (`/test`), Game Mode (`/play`), Result (`/result`), and Profile (`/profile`).

Home leads directly to both modes. Game Mode requires camera permission, current body/centre calibration, suitable framing and light, and rehearsal of all four movements before every run. Stand with your head and knees visible, clear your space, and move at a comfortable pace.

## Controls and game goal

- Gently move your torso left, centre, or right to select one of three lanes.
- Alternate knee lifts: one detected step produces one equal-damage projectile. Character speed follows cadence, capped at the configured maximum.
- Put both hands on your hips to hold a shield against poison fog.
- Separate your hands, clap above your head, and separate them again to rearm the game jump. Arm raising alone and physical hopping do not trigger it.

The character stops without coasting when the knee detector reports cessation. Detection has a finite observation window: the existing knee-step timeout is 1.5 seconds, so this is not a claim of zero physical-motion latency.

Select one of the five existing characters and a starting difficulty in Game Mode setup. Difficulty increases every four gameplay minutes, up to level 5, by increasing enemy/fog challenge; it does not dictate exercise cadence or change scenes. Gameplay time and progress toward 20 minutes appear in the HUD. The goal is a milestone: play continues afterward until health runs out or you choose **Finish session**.

Body loss, camera failure, and hiding the page pause the simulation and gameplay clock. Resume is explicit and requires valid tracking. Manual Pause is available too. Results show score, enemies defeated, gameplay duration, detected knee-lift time, knee steps, movement counts, distance, and technical measurements.

## Test Mode

Two 9:16 panels show the webcam/skeleton and a slightly rotated character facing the camera and responding automatically to detected movements. Movement status and instructions accompany the character. A plain text measurements section below shows the Proposal's latency, pose/render FPS, processing time per frame, knee cadence, character speed and per-movement detection counts. Empty measurements show zero. Test Mode has no site header/footer or setup controls; a camera retry button appears only after a camera error and fits the desktop viewport without page scrolling. Its demonstration has no enemies, damage, scoring, or game progression.

Opening Test Mode requests browser camera permission automatically. Rejection or camera/model startup failure keeps the page open and shows an Allow camera retry button inside the camera preview. Calibration happens automatically, and the current game character is reused without a selector. Without a detected body or movement, the character plays its idle animation; hidden pages suspend rendering. The author's revised scope removes the built-in evaluation trial forms. The researcher must record observer scores, manual step counts and environment notes separately. Accuracy comes from observer ground truth, never model confidence.

## Visit-only data and privacy

Player results, personal high scores, trial records, notes, and preferences live only in memory. Client navigation preserves them; reloading or closing the document clears them. There are no accounts, authentication, backend writes, browser player-storage reads/writes, or online rankings. Legacy browser data is left untouched and unused.

Camera frames are processed locally using MediaPipe and are never uploaded or recorded. The initial pose model and WASM files are downloaded from the pinned CDN. The developer asset catalog uses existing assets and requires network access for its Three.js import map.

## Technical measurements

Inference duration measures the pose-model call. Frame processing includes detection, control mapping and overlay work. Response latency measures camera-frame callback receipt to the first submitted character render using `performance.now()`; it does not measure physical movement onset or display presentation. Mean/min/max and P95 are aggregated with a bounded 1 ms histogram (extreme overflow is conservatively represented by the largest observed value).

Pose FPS and submitted render FPS are separate. Game sessions aggregate mean render FPS, first/final-minute FPS, decline percentage, and body-loss pause episodes. Gameplay duration excludes pauses; detected knee-lift time is tracked separately.

Proposal evaluation targets require a researcher-operated real-webcam session:
- P95 frame-to-response latency ≤200 ms.
- Accuracy ≥90% for each movement across ten scored attempts.
- Knee-count error ≤10% for each one-minute pace trial, with cadence-responsive speed and stopping observed.
- Mean FPS ≥24 and final-minute decline ≤15% during 20 minutes.
- At most one observed stability incident, counting freezes and body-loss pauses.

Local tests and software-rendered Chrome do not establish physical accuracy, device FPS, thermals, or clinical benefit.

## Architecture

`src/engine/` stays independent of React and the data layer. `runtime.ts` owns all loops, camera/model lifetimes, renderer startup and teardown:
- `game`: calibrated runner.
- `test`: the same detection/control pipeline plus a lightweight character demonstration.
- `pose`: calibration only, with no renderer.

`GameCanvas` is the React runtime boundary. Snapshot subscriptions are throttled; setup and gameplay retain the same camera and DOM nodes. Pages use `repository` from `@/lib/api`, backed by one visit-scoped repository with idempotent run submission. Results are returned as defensive copies. Settings and evaluation state use plain in-memory zustand stores.

Assets in `public/assets/` remain runtime-fetched files. Existing assets, character rigs and licenses are preserved. Legacy body-jump/arm-raise detector modules remain independently tested but are not production controls. Headless/developer input omitting cadence retains the old simulation path; production pose input always supplies cadence and consumable step events.

## Validation and developer tools

```powershell
npm test
npm run typecheck
npm run lint
npx vitest run --coverage
npm run build
node tools/check-scope-pages.mjs http://localhost:3000
node tools/check-long-play.mjs http://localhost:3000/play 1204
```

The browser tools need a running development server and installed Chrome or Edge. They use an isolated software-rendered browser. The scope check covers six public routes, eight removed routes, two portrait panels, six Proposal measurement types, viewport fit without scrolling, removed controls, zero-valued empty measurements, automatic camera entry, preview retry after denial, synthetic camera acquisition/navigation cleanup, idle animation, developer pause/resume, finishing/results, visit history, and reset on reload. The long-play probe simulates 1,204 seconds across repeated runs and checks GPU-resource bounds; it is not a 20-minute physical-webcam acceptance trial.

For local development only, game setup includes **Development: skip camera**, plus the existing keyboard/headless harness. These controls and `window.__lane` are absent in production.

`npm run assets:catalog` opens the separate developer asset viewer at http://127.0.0.1:3101. It is served by a localhost-only tool; `/catalog.html` is absent from the public app.

For webcam use outside localhost, use HTTPS (for example the existing `npm run dev:mobile` tunnel helper). The documented product target remains desktop/laptop browsers.

See [the document alignment report](docs/document-alignment.md) for source conflicts and recommended corrections, and [the execution record](docs/scope-modes-execution.md) for validation boundaries.
