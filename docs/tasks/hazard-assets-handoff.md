# Hazard asset handoff

Objective: build matching low-poly woodland logs for the approved obstacle replacement.

Read only AGENTS.md, this handoff, tools/export_environment_catalog.py, tools/build_root_obstacle_tree.py, and src/engine/render/world/palette.ts. No broad scans or recursive delegation.

Write only tools/build_trail_logs.py, public/assets/models/environment/log_two_lane.glb, public/assets/models/environment/log_three_lane.glb, public/assets/models/blender/environment/trail_logs.blend, and docs/tasks/hazard-assets-record.md. Supervisor owns the development version bump (2.10.0-alpha.0) for this shared change set.

Build independent 4.8 and 7.2 unit logs, lying along game X (perpendicular to travel Z), bottom at Y=0, centered X/Z. Height about 0.65, maximum depth 0.9. Include faceted irregular brown bark, contrasting cut ends and visible wood rings, a few broken branch details inside these bounds. Materials match palette woodBark/woodInner. Do not modify source root tree/catalog/character assets. Save an editable .blend and export GLBs through background Blender. Avoid changing the user's live Blender scene.

Validate GLB world bounds (including glTF conversion), meshes/materials and triangle counts. Record outputs and results concisely in hazard-assets-record.md. Deliver exact paths and any blockers. Do not edit game engine or tests.
