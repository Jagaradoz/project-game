# Agent Guidelines & Rules

## User & Project Information
- **User / Project Author**: ภานุพงศ์ รักสนิท (Panupong Raksanit)
- **Student ID**: 6621650400 (Group 800)
- **Project**: Webcam-based Exercise Game (เว็บไซต์เกมออกกำลังกายผ่านเว็บแคม)

## Mandatory Development Version Bump Rule

Whenever an AI agent makes **ANY** code or content modification to this repository, the agent **MUST** increment the development version number in [`package.json`](package.json).

### Reason & Note:
This version is an internal **development and testing version** (not an official release version). The user tests this application via local server & tunnel connections. Browser caching can cause stale code to be executed during testing. Incrementing this development version number on every single AI modification ensures the user can visually confirm that the web app has updated to the latest code version.

### Execution Protocol:
1. Check the current `"version"` in [`package.json`](package.json) (e.g. `2.0.0`).
2. Increment it (patch for small edits/bug fixes, minor for new features).
3. That is the only edit needed — [`src/components/ui/VersionTag.tsx`](src/components/ui/VersionTag.tsx) reads it and renders the footer, so there is exactly one source of truth.
4. State the updated version number in the final summary sent to the user.

## Project Stack

Next.js 16 (App Router) + TypeScript + Tailwind v4. Routes live in `app/`, following the TOR screen list.

- `src/engine/` is **framework-free** and must stay that way — no React imports, no JSX. It owns the game reducer, the pose detectors, and the Three.js scene.
- `src/engine/runtime.ts` is the only lifecycle owner. Anything that starts a loop, a camera or a WebGL context goes through it, and `dispose()` must release it.
- `src/components/game/GameCanvas.tsx` is the **only** React component that touches the engine.
- The 3D assets in `public/assets/` are fetched at runtime by path string; never import or bundle them.
- Run `npm test` (Vitest, 65 tests) and `npm run typecheck` before considering a change done.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
