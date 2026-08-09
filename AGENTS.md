# Agent Guidelines & Rules

## Mandatory Development Version Bump Rule

Whenever an AI agent makes **ANY** code or content modification to this repository, the agent **MUST** increment the development version number displayed at the bottom of the page in [`index.html`](file:///d:/Browser%20Works/test-game/index.html) (inside `<span id="versionNumber">...</span>`).

### Reason & Note:
This version is an internal **development and testing version** (not an official release version). The user tests this application via local server & tunnel connections. Browser caching can cause stale code to be executed during testing. Incrementing this development version number on every single AI modification ensures the user can visually confirm that the web app has updated to the latest code version.

### Execution Protocol:
1. Check the current version string in [`index.html`](file:///d:/Browser%20Works/test-game/index.html) (e.g., `1.0.1`).
2. Increment the version number (e.g., `1.0.1` -> `1.0.2` for small edits/bug fixes, or `1.1.0` for new features).
3. Apply the changes and update the `<span id="versionNumber">` element in [`index.html`](file:///d:/Browser%20Works/test-game/index.html) and `"version"` in [`package.json`](file:///d:/Browser%20Works/test-game/package.json).
4. State the updated version number in the final summary sent to the user.
