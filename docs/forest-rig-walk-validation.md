# Forest character rig and walk validation

## Summary
- Preserved the source blend and hidden Goblin original backup.
- Added one articulated 17-bone rig per character, bone-bound rigid details, smoothly weighted continuous legs, and four editable Walk actions.
- Weapons and grip fingers share their hand bone. Feet use a flat planted stance and raised swing; hips, arms and canopy have secondary motion.

## Validation
| Character | Bound parts | Cycle at 24 fps | Rest matrix error | Seam error | Third-cycle error | Pose movement |
|---|---:|---:|---:|---:|---:|---:|
| Bramble Skeleton | 399 | 32 frames | 0.00000498 | 0.00000000 | 0.00000000 | 0.32766 |
| Shroom Brute | 102 | 40 frames | 0.00000048 | 0.00000000 | 0.00000000 | 0.33013 |
| Goblin Scout | 279 | 28 frames | 0.00000176 | 0.00000000 | 0.00000000 | 0.54661 |
| Elder Treant | 340 | 56 frames | 0.00000191 | 0.00000000 | 0.00000000 | 0.30576 |

- Reopened the saved blend: all four 17-bone rigs retained their actions and 160 cyclic curves each; third-cycle pose checks passed.
- Repaired thorn geometry: all 588 vertices weighted across six host-bone groups; evaluated seam error 0 and visible motion 0.15576 units.
- Blender 5.1 layered action curves include Cycles modifiers; loops validated beyond authored frames.
- Source object transforms preserved in rest pose (tolerance 0.0001).
- Corrected 177 skeleton vine pieces and bound disconnected thorn islands to their host vines; rerendered affected previews.
- Collective preview range is 1120 frames (common cycle length).
- Contact and passing previews rendered in `public/assets/models/forest_walk_preview/`.
- These are in-place Blender animations; application integration and GLB export are outside this change.

## Blockers
- None.
