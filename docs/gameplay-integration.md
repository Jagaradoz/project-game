# Gameplay integration

## Approved scope
- Five magicians: Run, Attack, Hit, Death, Jump and Idle from the saved master.
- Forest enemies: scout (weak), skeleton (normal), brute (slow tank), treant (boss), with health, movement, reactions and attacks.
- Per-magician animated spell orbs with trails, cast feedback and impacts.
- Calibrated webcam jumping and keyboard fallback; roadside root obstacles affect only the player.
- Preserve Blender sources and runtime lifecycle ownership. No framework imports in the engine.

## Asset worker handoff
- Read only AGENTS.md, tools/export_magician_game_clips.py, tools/rig_forest_walks.py, and public/assets/models/blender/magicians/magicians_animation_catalog_refined.blend. No broad scans or recursive delegation.
- Create tools/export_gameplay_assets.py. Write only public/assets/models/characters/animated/, public/assets/models/enemies/animated/, public/assets/models/spells/, and docs/gameplay-assets-record.md. Supervisor owns package.json and all engine files.
- Export Mage, Druid, SkeletonMage, Witch, MagicalGirl with exactly Run/Attack/Hit/Death/Jump/Idle clips using each corresponding row action and its actual frame range. Bake one cycle; remove preview placement and object translation so gameplay owns movement.
- Export GoblinScout, BrambleSkeleton, ShroomBrute, ElderTreant with Walk/Run/Idle/Death plus short authored Attack/Hit reactions if absent. Preserve rigs, materials, silhouettes and bone attachment. Optimize the high-poly goblin and consolidate compatible geometry; target <=15000 triangles per enemy, <=16 material primitives where practical. Bake bone-parented rigid parts to skinned weights before merging if needed.
- Export five separate orb assemblies as Mage/Druid/SkeletonMage/Witch/MagicalGirl.glb with a Loop clip where feasible. Convert curves to meshes and omit labels/preview staging.
- Never save or modify original .blend files. Use Blender background and temporary copies.
- Validate every output's clip names, durations, skins, finite animation samples and geometry budget. Include concise actions, key changes, validation and blockers in the execution record.

## Supervisor execution
1. Add regression tests for jump recognition, enemy durability/boss progression, root collision and animation priority; observe failures.
2. Extend pure reducer/types/config with enemy identities, health, speeds, attacks, jumping and obstacle events.
3. Integrate pooled actor animations, root placement, spell effects, camera/keyboard input and visible tracking/game feedback.
4. Run focused tests, full tests, typecheck, lint, coverage and browser playback. Record limits of webcam/GPU acceptance.

## Execution record
- Development version: 2.9.0-alpha.0.
- Integrated six player animation states, four enemy tiers with health and boss lane attacks, five authored orb loops with pooled trails/cast/impact effects, and roadside root obstacles.
- Added calibrated two-foot webcam jumping, landing/reacquisition guards, Up/W/J and button input, feet guidance in calibration/practice, and obstacle/boss HUD feedback. Roots collide with the player only.
- Preserved source Blender files. Enemy exports fit the 15,000-triangle budget; runtime loader checks passed all 24 enemy clips at three deformed-pose samples each.
- Validation: npm test (190 tests), npm run typecheck, npm run lint, npm run build, and coverage (91.07% lines, 87.14% branches) passed. Browser playback passed Run/Attack/Jump/Hit/Death for all five magicians; complete gameplay passed root crossings, boss warning/dodge/victory, idle, hit and defeat. Screenshots are in docs/shots/gameplay-integration/ and docs/shots/magician-playback/.
- Physical webcam recognition and target-device GPU/FPS acceptance remain untested. One Treant source-mesh export warning is recorded in gameplay-assets-record.md; the exported body and animation were reviewed in the game browser.
- Prop-placement review passed after retaining native bone attachments. Fixed cached-rig grounding on character reselection and stopped invulnerability blinking from freezing a defeat pose partly transparent; both have regression tests.
