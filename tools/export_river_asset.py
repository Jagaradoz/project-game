"""Export the production river GLB from tools/build_trail_obstacles_catalog.py + tools/data/valley_profile.json.

Run (live or headless; nothing in the open file is modified):
  blender --background --factory-startup --python tools/export_river_asset.py
Regenerate tools/data/valley_profile.json first if the valley profile in ground.ts changes.
"""

import importlib.util
from pathlib import Path

import bpy

ROOT = Path(r"D:\Engineering Works\project-game")
OUTPUT = ROOT / "public/assets/models/environment/river_crossing.glb"


def main():
    spec = importlib.util.spec_from_file_location("trail_obstacles_import", ROOT / "tools/build_trail_obstacles_catalog.py")
    kit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(kit)
    obj = kit.build_river_production("river_crossing", 512.0)
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", use_selection=True, export_extras=False,
                              export_animations=False, export_cameras=False, export_lights=False)
    triangles = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    size = [round(v, 3) for v in obj.dimensions]
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    print("RIVER_EXPORT", {"file": str(OUTPUT), "triangles": triangles, "size_xyz_blender": size,
                           "bytes": OUTPUT.stat().st_size})


main()
