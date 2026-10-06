# Gameplay asset export record

## Summary
- Exported from the approved magician animation catalog in Blender 5.1.2; the source blend was opened read-only and never saved.
- Exported five magician rigs with Run/Attack/Hit/Death/Jump/Idle, four forest enemies with Walk/Run/Idle/Death/Attack/Hit, and five spell orb assemblies with Loop.

## Key changes
- Detached enemy armatures from staging parents, reset merged meshes to identity local basis, and removed copied object-location keys; converted orb curves to mesh and omitted staging labels.
- Preserved player accessories as native bone-parented GLTF nodes; converted bone-parented enemy details to full-weight armature skinning, consolidated each enemy into one mesh, and reduced enemy geometry to the runtime budget.
- Enemy Attack and Hit are short authored armature reactions because the catalog contains no dedicated enemy reactions.

## Validation
| Asset | Clips | Duration seconds | Skins | Triangles | Materials | Bytes |
|---|---|---|---:|---:|---:|---:|
| Magician Mage | Attack, Death, Hit, Idle, Jump, Run | Run 0.7917, Attack 0.9167, Hit 1.5833, Death 0.7917, Jump 0.7917, Idle 1.0833 | 1 | 5683 | 1 | 520160 |
| Magician Druid | Attack, Death, Hit, Idle, Jump, Run | Run 0.7917, Attack 0.9167, Hit 1.5833, Death 0.7917, Jump 0.7917, Idle 1.0833 | 1 | 8846 | 2 | 650588 |
| Magician SkeletonMage | Attack, Death, Hit, Idle, Jump, Run | Run 0.7917, Attack 0.9167, Hit 1.5833, Death 0.7917, Jump 0.7917, Idle 1.0833 | 1 | 6107 | 3 | 570816 |
| Magician Witch | Attack, Death, Hit, Idle, Jump, Run | Run 0.7917, Attack 0.9167, Hit 1.5833, Death 0.7917, Jump 0.7917, Idle 1.0833 | 1 | 6850 | 3 | 477496 |
| Magician MagicalGirl | Attack, Death, Hit, Idle, Jump, Run | Run 0.7917, Attack 0.9167, Hit 1.5833, Death 0.7917, Jump 0.7917, Idle 1.0833 | 1 | 9520 | 2 | 604108 |
| Enemy GoblinScout | Attack, Death, Hit, Idle, Run, Walk | Walk 1.2083, Run 0.7917, Idle 1.7083, Death 0.7083, Attack 0.625, Hit 0.4167 | 1 | 13780 | 17 | 693072 |
| Enemy BrambleSkeleton | Attack, Death, Hit, Idle, Run, Walk | Walk 1.375, Run 0.875, Idle 2.0417, Death 0.75, Attack 0.625, Hit 0.4167 | 1 | 11524 | 11 | 561784 |
| Enemy ShroomBrute | Attack, Death, Hit, Idle, Run, Walk | Walk 1.7083, Run 1.0417, Idle 2.375, Death 0.8333, Attack 0.625, Hit 0.4167 | 1 | 12572 | 15 | 646168 |
| Enemy ElderTreant | Attack, Death, Hit, Idle, Run, Walk | Walk 2.375, Run 1.375, Idle 3.0417, Death 1.0833, Attack 0.625, Hit 0.4167 | 1 | 11016 | 18 | 556644 |
| Spell Mage | Loop | Loop 1.5833 | 0 | 1264 | 4 | 39812 |
| Spell Druid | Loop | Loop 1.5833 | 0 | 884 | 4 | 30512 |
| Spell SkeletonMage | Loop | Loop 1.5833 | 0 | 1264 | 4 | 40148 |
| Spell Witch | Loop | Loop 1.5833 | 0 | 1264 | 4 | 40056 |
| Spell MagicalGirl | Loop | Loop 1.5833 | 0 | 888 | 4 | 30468 |

- All exported animation input times and transform samples are finite with positive clip duration; all player/enemy GLBs retain a skin.
- Player accessories remain native bone-parented nodes. Blender evaluated their weapon centers against each assigned hand slot per clip with <=0.02 m drift; Three.js GLTFLoader/AnimationMixer bounds and applicable hat attachment checks passed all five player exports across six clips.
- Source Druid, Skeleton Mage, and Magical Girl Death props remain attached to the animated right hand slot; source rest-bone matrices match the exported Attack rig, with no authored release action.
- Enemy deformed world bounds were sampled at start/middle/end of Walk, Run, Idle, Attack and Hit; all stayed within their expected local-origin envelopes after detaching staging parents.
- Three.js GLTFLoader/AnimationMixer audit passed all six enemy clips at three samples each for all four exports.
- Enemy GLBs are at or below 15,000 triangles; compatible parts were consolidated into one mesh per enemy.

## Blockers
- Blender emitted an invalid-mesh warning for a treant source mesh during export; the resulting GLB passed clip, finite-sample, skin, and triangle-budget checks, but the flagged piece still needs viewport review.
