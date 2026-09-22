# Scenery quality — 2.3.0-alpha.33

- Replaced forest cone landmarks with bundled kit trunks and folded individual leaf canopies; retained palette transitions.
- Added shared model-footprint spacing across scenery layers, including wraparound clearance and landmark reservations. Full bands skip placements instead of forcing intersections.
- Added curved grass tufts, more verge flowers, seamless soil grain/mottling and subtle bump relief that scrolls with the world.
- Scene teardown releases geometry, materials and textures, including disposal during loading.
- Validation: 156 tests pass; typecheck, lint and diff whitespace checks pass. Coverage: 92.36% statements, 85.47% branches, 93.37% functions, 93.93% lines.
- Software-rendered captures reviewed for forest, autumn, highlands and oasis in docs/shots/scenery-quality. No hardware frame-rate acceptance performed.
- Blockers: none.
