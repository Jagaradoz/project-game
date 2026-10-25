# Guide Mode implementation record

## Summary of actions taken
- Implemented approved option A in production at `/test`; visible naming is Guide Mode.
- Delegated the bounded UI/overlay work to one worker; supervisor integrated runtime behavior and validation.
- Development version: `2.36.0-alpha.0`. Disposable HTML remains separate in `tmp/guide-mode-mockups/`.

## Key changes
- Three equal PC/landscape panels; mobile portrait places camera and character above guidance. Dynamic device height, safe areas, contained camera/skeleton, no page scrolling.
- Runtime-owned 20-minute guided session: five/ten reps, three-second transitions, twenty-second rests, automatic rounds, explicit resume, immediate expiry and summary. Preserve guided checkpoints during free practice and timed evaluation.
- Overlay-only measurements, logs, session settings and developer evaluation. Native modal focus/Escape behavior. Real runtime values and bounded logs; JSON report schema 2 includes session progress.
- Preserved camera/WebGL ownership and detector semantics; automatic pose changes require fresh detector preparation. Removed the unused manual guide component and refreshed app labels and README.

## Validation or test results
- 43 test files / 395 tests passed, including deterministic timing, rounds, repetition gates, interruption recovery, mode/trial isolation, immediate expiry and runtime integration.
- Coverage passed the 80% floor: 97.09% statements, 94.94% branches, 100% functions, 98.18% lines. A loaded-host rerun timed out in the existing enemy-spawn test; rerunning with two workers and a 20-second test timeout passed all 395 tests without changing any test assertions.
- Typecheck, full lint, optimized build and diff checks passed. Build reports the existing metadataBase localhost fallback warning.
- Software-Chrome acceptance passed at 1920x1080, 1366x768, 1024x600, 768x1024, 390x844, 320x568, 844x390 and 667x375: panels, diagrams, instructions and controls fit with no page scrolling. Overlay focus/Escape, free practice, five/ten goals, measurements, log filter/clear/export, camera retry/synthetic stream and Game Mode/result flow passed.
- Browser screenshots and acceptance JSON: `tmp/guide-mode-implementation/browser/`. Automatic pose/session progression is validated through deterministic detector/runtime tests; the browser camera fixture supplies synthetic video, not real pose inference.

## Blockers
- No implementation blockers. Physical-webcam accuracy, thermals and target-device FPS require separate device acceptance.

## Follow-up adjustments
- Version `2.36.2-alpha.0`: toolbar now exposes only Measurements and Event log. Start is automatic after readiness; Resume appears only when paused. Removed the session/skip/manual-start controls and optional rest-shortcut button.
- Every overlay explicitly centers in the viewport. Logs use short plain-language messages and one elapsed timestamp; empty performance samples are hidden from the display. Complete raw event data remains available in JSON export.
- Follow-up validation: 44 files / 398 tests, typecheck, lint and build passed. Browser checks verify the two toolbar actions and centered dialogs on PC, 390x844 and 320x568 views; no raw JSON is rendered in log rows.

- Version `2.36.3-alpha.0`: concise live direction cues replace the full-sequence heading. Lateral targets, return-to-centre direction, specific knee sides, hand/clap preparation and pause/rest states follow actual practice state. Larger action text and directional icons lead; metadata, rep counts and upcoming poses are secondary.
- Directional guidance validation: 45 files / 402 tests and typecheck/lint passed. Full browser acceptance passed; stress checks for long action cues and paused Resume fit at 1366x768, 390x844, 320x568, 844x390 and 667x375.
