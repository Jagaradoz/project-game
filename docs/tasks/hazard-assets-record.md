# Hazard log asset record

## Summary

Built two independent low-poly logs in background Blender. Original tree/catalog assets and the live Blender scene were not opened or modified.

## Key changes

- Faceted irregular bark, contrasting cut ends with geometric wood rings, three broken branch stubs and sparse raised bark grain.
- Palette material names: woodBark, woodBarkDark, woodInner, wood, leafsGreen (moss), colorTan and colorRed (shelf mushrooms); restrained woodBarkWarm retains authored color.
- Editable Blender source has a separate scene per variant; GLBs contain one mesh each, with no lights, cameras, images or external buffers.
- Source: `tools/build_trail_logs.py`; Blender: `public/assets/models/blender/environment/trail_logs.blend`.

## Validation

Serialized GLB positions inspected through full node transforms in game/glTF X/Y/Z axes:

| Model | Bounds min | Bounds max | Triangles | Material primitives | Bytes |
|---|---|---|---:|---:|---:|
| log_two_lane.glb | [-2.4, 0.0, -0.628773] | [2.4, 1.253497, 0.628773] | 840 | 8 | 42832 |
| log_three_lane.glb | [-3.6, 0.0, -0.628773] | [3.6, 1.253497, 0.628773] | 960 | 8 | 49324 |

Both lengths, 1.0-1.3 tall, ground datum Y=0, centered X/Z and depth below 1.5 passed assertions. Material and triangle structure checked from exported binaries. Game-camera visual acceptance remains supervisor validation.

## Blockers

None for asset export and structural validation.
