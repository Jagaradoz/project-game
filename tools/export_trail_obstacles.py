"""Export the log, rockfall and spore assets authored by tools/build_trail_obstacles_catalog.py.

Run (headless; the catalog .blend is not opened or modified):
  blender --background --factory-startup --python tools/export_trail_obstacles.py
Writes public/assets/models/environment/{log,stone_hazard}_{two,three}_lane_{A,B,C}.glb,
spore_puff_{A,B,C}.glb and sky_cloud.glb (from tools/build_clouds_catalog.py).
Seeds match the catalog section, so the game ships exactly what the catalog shows.
"""

import importlib.util
import json
from pathlib import Path

import bpy

ROOT = Path(r"D:\Engineering Works\project-game")
OUTPUT = ROOT / "public/assets/models/environment"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def export(obj):
    bpy.context.scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = OUTPUT / (obj.name + ".glb")
    options = dict(filepath=str(path), export_format="GLB", use_selection=True, export_extras=False,
                   export_animations=False, export_cameras=False, export_lights=False)
    if obj.data.color_attributes:
        # The sky cloud's shading is baked into vertex colours; ship them even if no material reads them.
        options["export_vertex_color"] = "ACTIVE"
    bpy.ops.export_scene.gltf(**options)
    lo = [min(v.co[i] for v in obj.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in obj.data.vertices) for i in range(3)]
    # Report in game axes: X, Y up, Z travel (Blender -Y).
    return {"name": obj.name, "triangles": sum(len(p.vertices) - 2 for p in obj.data.polygons),
            "x": [round(lo[0], 3), round(hi[0], 3)], "height": round(hi[2], 3),
            "z": [round(-hi[1], 3), round(-lo[1], 3)], "bytes": path.stat().st_size}


def main():
    kit = load("trail_obstacles_import", ROOT / "tools/build_trail_obstacles_catalog.py")
    logs = load("build_trail_logs", ROOT / "tools/build_trail_logs.py")
    scene = bpy.context.scene
    results = []
    for lane_name, length in (("log_two_lane", 4.8), ("log_three_lane", 7.2)):
        for variant in "ABC":
            results.append(export(kit.build_log_variant(logs, scene, f"{lane_name}_{variant}", length, variant)))
    for lanes in (2, 3):
        for variant in "ABC":
            results.append(export(kit.build_stone_hazard(lanes, variant)))
    for variant in "ABC":
        results.append(export(kit.build_spore_puff(variant)))
    clouds = load("clouds_import", ROOT / "tools/build_clouds_catalog.py")
    results.append(export(clouds.build_sky_cloud()))
    print("TRAIL_OBSTACLE_EXPORT=" + json.dumps(results))


main()
