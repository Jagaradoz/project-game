# Game and world feedback pass

## Summary

Improved combat readability, moment-to-moment feedback, and world composition without changing game rules.

## Key changes

- Added pulsing ground markers and damped camera impact for enemies, kills, and player hits.
- Reworked the HUD around a clear stage objective with reactive score and health feedback.
- Collapsed unavailable webcam video into a compact tracking-status chip.
- Rebalanced procedural scatter into readable clusters with landmark clearings.
- Added deterministic biome-specific landmark zones and stronger silhouette variety.
- Bumped the development version to `2.3.0-alpha.32`.

## Validation

- `npm test`: 155 passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed with the existing `metadataBase` warning.
- `git diff --check`: passed (line-ending notices only).

## Blockers

None.
