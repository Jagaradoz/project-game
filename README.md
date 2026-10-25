# Webcam Exercise Game

A browser game controlled by four gentle movements, with a separate Guide Mode for learning and technical evaluation. The implementation follows Proposal first, compatible TOR requirements, Research movement guidance, and the author's confirmed layout decisions.

## Run

```powershell
npm install
npm run dev
```

Open http://localhost:3000. The public pages are Home (`/`), Calibration (`/calibrate`), Guide Mode (`/test`), Game Mode (`/play`), and Result (`/result`). There is no Profile page, history or saved data.

Home leads directly to both modes. Game Mode requires camera permission, current body/centre calibration, suitable framing and light, and rehearsal of all four movements before every run. Stand with your head and knees visible, clear your space, and move at a comfortable pace.

## Controls and game goal

- Gently move your torso left, centre, or right to select one of three lanes.
- Alternate knee lifts: one detected step produces one equal-damage projectile. Character speed follows cadence, capped at the configured maximum.
- Put both hands on your hips to hold a shield against poison fog.
- Separate your hands, clap above your head, and separate them again to rearm the game jump. Arm raising alone and physical hopping do not trigger it.

The character stops without coasting when the knee detector reports cessation. Detection has a finite observation window: the existing knee-step timeout is 1.5 seconds, so this is not a claim of zero physical-motion latency.

Select one of the five existing characters and a starting difficulty in Game Mode setup. Difficulty increases every four gameplay minutes, up to level 5, by increasing enemy/fog challenge; it does not dictate exercise cadence or change scenes. Gameplay time and progress toward 20 minutes appear in the HUD. The goal is a milestone: play continues afterward until health runs out or you choose **Finish session**.

Body loss, camera failure, and hiding the page pause the simulation and gameplay clock. Resume is explicit and requires valid tracking. Manual Pause is available too. Results show score, enemies defeated, gameplay duration, detected knee-lift time, knee steps, movement counts, distance, and technical measurements.

## Guide Mode

Guide Mode keeps the existing `/test` URL and internal `test` runtime mode. Option A shows equal camera/skeleton, character response and visual-guidance columns on desktop and landscape; mobile portrait puts camera and character above the guide. The screen fits the device height without page scrolling. Measurements, logs, session options and developer evaluation use accessible overlays with independently scrollable contents.

Camera permission is requested once on entry, with an in-panel retry after camera/model failure. After calibration, framing and character readiness, the guide starts automatically. The toolbar contains only **Measurements** and **Event log**; **Resume** appears in the guide only when paused. The guide repeats lateral movement, alternate knee lifts, hands on hips and overhead clap: five successful repetitions per pose, a three-second transition, then a twenty-second rest after all four poses. Rests and pose changes advance automatically. The guide names one current action at a time, with arrows and short instructions for left/right movement, returning to centre and the next knee to lift.

The twenty-minute clock includes movements, transitions and rests. Manual pauses, tracking loss, hidden tabs, free practice and timed developer tests freeze it. Resume is explicit and requires valid tracking; successful reps and countdowns are retained, while detector starting positions must be observed again. At twenty minutes the session ends immediately and shows totals, completed rounds, skips and any unfinished pose. The summary offers Restart, Game Mode and Home. The engine retains visit-scoped free-practice and evaluation support, but the standard guide no longer exposes their session controls. The demonstration has no enemies, damage or scoring.

Measurements use actual runtime samples, with a dash for unavailable values. The centered event-log overlay shows short messages and elapsed timestamps, hides empty performance samples, and retains at most 500 raw events, supports category filters and clearing, and exports schema-version-2 JSON including guided session state, measurements and trial results. The diagnostic engine retains timed evaluation support and pauses guided practice if a developer trial is started. The two-button guide interface does not expose timed-test controls. These are technical observations; pose accuracy still requires observer ground truth.

## No stored data and privacy

The application keeps session state, bounded diagnostic events and the last run only in visit-scoped memory. Guide Mode reloads start a fresh session; Result reloads clear the last run. Diagnostic JSON is downloaded only when requested. There is no history, profile, personal high score, account, backend write, browser storage or online ranking.

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

`GameCanvas` is the React runtime boundary. Snapshot subscriptions are throttled; setup and gameplay retain the same camera and DOM nodes. The finished run is handed to `/result` through a small in-memory zustand store (`src/lib/store/run.ts`); there is no repository or data layer. Settings use plain in-memory zustand stores.

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

The browser tools need a running development server and installed Chrome or Edge. They use an isolated software-rendered browser. The scope check covers five public routes, nine removed routes, two portrait panels, six Proposal measurement types, viewport fit without scrolling, removed controls, zero-valued empty measurements, automatic camera entry, preview retry after denial, synthetic camera acquisition/navigation cleanup, idle animation, developer pause/resume, finishing/results and an empty result after reload. The long-play probe simulates 1,204 seconds across repeated runs and checks GPU-resource bounds; it is not a 20-minute physical-webcam acceptance trial.

For local development only, game setup includes **Development: skip camera**, plus the existing keyboard/headless harness. These controls and `window.__lane` are absent in production.

`npm run assets:catalog` opens the separate developer asset viewer at http://127.0.0.1:3101. It is served by a localhost-only tool; `/catalog.html` is absent from the public app.

For webcam use outside localhost, use HTTPS (for example the existing `npm run dev:mobile` tunnel helper). Guide Mode supports responsive phone, tablet and PC layouts; physical-webcam accuracy and target-device FPS still require testing on those devices.

See [the document alignment report](docs/document-alignment.md) (also exported as `docs/document-alignment.docx`) for source conflicts and recommended corrections.
