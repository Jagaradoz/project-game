# Attack animation integration

## Scope and handoff
- Export only the five approved magician rigs with Run/Attack clips.
- Runtime worker owns player.ts, sync.ts and focused animation tests only.
- Preserve gameplay timing and lifecycle ownership; do not play idle.
- Validate GLB clip names, runtime transitions, tests, typecheck and lint.

## Execution record
- Exported five skinned GLBs from the refined catalog with only Run and Attack.
- Mage uses the approved clips; Druid, Skeleton Mage, Witch and Magical Girl
  are available in the existing character selector with attached weapons.
- Firing starts a complete attack; sustained firing repeats attacks, and release
  finishes recovery before fading to run. No idle playback added.
- Preserved gameplay firing cadence and original Blender/source character files.
- Validation: 161 tests pass, typecheck and lint pass. Export assertions verify
  both clips and skins. Headless browser checks pass Run -> Attack -> Run for
  all five characters with no console errors; rendered captures inspected.
- Live webcam input and hardware GPU performance were not tested.
- Development version: 2.4.0-alpha.0. No blockers.
