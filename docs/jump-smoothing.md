# Jump smoothing

## Asset worker handoff
- Objective: repair all five magician Jump actions and export in-place Jump clips.
- Read only AGENTS.md, tools/export_gameplay_assets.py, and public/assets/models/blender/magicians/magicians_animation_catalog_refined.blend. Inspect only each Jump/Running/Idle rig, its action, bones, constraints, and attached meshes. No broad scans or recursive delegation.
- Write only tools/fix_magician_jumps.py, tools/export_gameplay_assets.py, the same refined .blend, the five existing GLBs under public/assets/models/characters/animated/, and docs/jump-assets-record.md. Supervisor owns package/version, runtime, tests, and this document.
- Preserve the original blend in a timestamped copy outside the repository before changes. Repair mixed Jump curves by removing inherited fractional Running keys while retaining authored integer Jump poses; use smooth clamped interpolation. Remove residual running motion from untouched lower-body/control channels where needed, preserving prop attachment and existing character style. Leave all other actions and rows unchanged.
- Keep source Jump root lift for the Blender preview. In the exporter copy only, flatten Jump root-bone translation to its initial value so gameplay owns airborne height. Do not strip normal bone animation or alter other clips.
- Use Blender 5.1 background scripts; do not touch the live Blender session. Export players only, without exporting enemies/orbs or overwriting their records.
- Validate all five source Jump actions: no conflicting fractional keys, finite samples and bounded adjacent-subframe changes. Validate GLBs: six original clips, skins and finite samples, unchanged clip durations, constant Jump root translation and stable weapon attachments.
- Record only actions, key changes, validation results and blockers in docs/jump-assets-record.md. Report completion concisely with paths and metrics.

## Execution record
- Development version: 2.9.1-alpha.0.
- Removed 20,310 inherited fractional keys from the five source Jump actions; original integer poses and source preview lift remain. Original source is backed up outside the repository; details are in jump-assets-record.md.
- Re-exported five player GLBs with constant Jump root translation, six original clips, unchanged durations, skins and stable props. Gameplay now owns jump height.
- Flight poses use reducer time and source frames 4-13; frames 13-19 complete on the ground before shots resume. Airborne damage preserves the pose, completed jumps hold instead of restarting, and render updates share the reducer's frame limit.
- Validation: 203 tests, typecheck, lint and coverage passed. Live Blender review confirmed the five corrected rows and the former foot snap reduced from about 45 degrees to 1.3 degrees across the same adjacent key times. Browser simulation passed all five exported characters through flight, landing while firing, and return to run; screenshots are in docs/shots/jump-smoothing/.
- Target-device GPU/FPS and physical webcam acceptance were not part of these local checks.
- Blockers: none.
