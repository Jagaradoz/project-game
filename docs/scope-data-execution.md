# Visit data and page cleanup execution

- Replaced account/mock/live adapters with a visit-scoped in-memory repository behind `@/lib/api`. Defensive result copies, idempotency keys, run validation and cumulative step statistics are retained.
- Removed login, register, profile edit, leaderboard, practice, consent and standalone character routes plus exclusive auth components, stores, hooks, validation and tests.
- Profile now displays visit history, cumulative statistics and five personal high scores. History links select a run on Result.
- Settings now use a plain memory store with character, camera visibility, graphics quality and starting difficulty (default 1, clamped 1–5).
- Home explains the four documented controls, stopping knee lifts, visit-only data and the 20-minute goal. Shared navigation links only retained pages.
- Validation: focused repository/client tests passed (15 tests); scoped ESLint passed.
- Integration: initial typecheck encountered stale generated Next route declarations, supervisor runtime work in progress, and graphics-settings tests still expecting persisted settings. Supervisor owns those remaining files and final full verification.
