# Jump asset execution record

- Preserved original source: `C:\Users\user\.codex\backups\project-game\magicians_animation_catalog_refined-20261006-105919.blend`.
- Repaired only five Jump actions: removed inherited fractional Running keys, retained every integer pose and frame range 0-19, and applied Bezier AUTO_CLAMPED handles.
- Untouched control channels now hold their equal boundary values; source root lift remains for catalog preview. Running and Idle action signatures are unchanged.
- Source validation: 153 samples per character at 1/8-frame spacing; all transforms finite, bone displacement below 0.2 m and rotation below 0.35 rad per sample; weapon attachment drift below 0.0001.

| Character | Removed keys | Held channels | Retained keys | Max bone step (m) | Max rotation step (rad) | Source lift (m) |
|---|---:|---:|---:|---:|---:|---:|
| Mage | 4062 | 324 | 2308 | 0.06453 | 0.22158 | 0.69309 |
| Druid | 4062 | 324 | 2308 | 0.06429 | 0.22158 | 0.69894 |
| Skeleton Mage | 4062 | 324 | 2308 | 0.06503 | 0.22158 | 0.69894 |
| Witch | 4062 | 324 | 2308 | 0.06431 | 0.22158 | 0.69633 |
| Magical Girl | 4062 | 324 | 2308 | 0.06463 | 0.22158 | 0.69320 |

- Export validation: all five retain six clips, skins and finite transform samples; export compared every clip duration with its previous GLB.

| Player | Jump duration (s) | Root translation spread | Weapons attached | Skins |
|---|---:|---:|---:|---:|
| Mage | 0.7917 | 0 | 2 | 1 |
| Druid | 0.7917 | 0 | 1 | 1 |
| SkeletonMage | 0.7917 | 0 | 1 | 1 |
| Witch | 0.7917 | 0 | 1 | 1 |
| MagicalGirl | 0.7917 | 0 | 1 | 1 |

- Blender evaluated exported weapon centers across all six clips with attachment drift below 0.02 m; GLB weapons remain descendants of a hand slot with static local transforms.
- Enemies, spells and their execution record were not exported or rewritten.
- Supervisor validation: live Blender review and browser simulation of all five exported characters passed; flight, landing while firing and return to run were checked. Repository validation is recorded in jump-smoothing.md.
- Blockers: none.
