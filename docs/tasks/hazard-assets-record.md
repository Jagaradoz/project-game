# Hazard log asset record

## Summary

Built two independent low-poly logs in background Blender. Original tree/catalog assets and the live Blender scene were not opened or modified.

## Key changes

- Faceted irregular bark, contrasting cut ends with geometric wood rings, three broken branch stubs and sparse raised bark grain.
- Palette material names: woodBark, woodBarkDark, woodInner and wood; restrained woodBarkWarm retains authored color.
- Editable Blender source has a separate scene per variant; GLBs contain one mesh each, with no lights, cameras, images or external buffers.
- Source: `tools/build_trail_logs.py`; Blender: `public/assets/models/blender/environment/trail_logs.blend`.

## Validation

Serialized GLB positions inspected through full node transforms in game/glTF X/Y/Z axes:

| Model | Bounds min | Bounds max | Triangles | Material primitives | Bytes |
|---|---|---|---:|---:|---:|
| log_two_lane.glb | [-2.4, 0.0, -0.352382] | [2.4, 0.65, 0.352382] | 588 | 5 | 27812 |
| log_three_lane.glb | [-3.6, 0.0, -0.352873] | [3.6, 0.65, 0.352873] | 692 | 5 | 33440 |

Both lengths, 0.65 height, ground datum Y=0, centered X/Z and depth below 0.9 passed assertions. Material and triangle structure checked from exported binaries. Game-camera visual acceptance remains supervisor validation.

Saved Blender file reopened successfully in a second background process: two scenes, each with exactly one editable mesh (350 vertices / 414 vertices).

## Blockers

None for asset export and structural validation.
