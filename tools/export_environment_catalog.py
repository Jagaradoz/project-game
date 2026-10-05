"""Export revised catalog assets without changing the source .blend or nature kit.

Run: blender --background --factory-startup --python tools/export_environment_catalog.py
"""

import json
import math
import tempfile
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/models/blender/environment/environment_resource_catalog.blend"
OUTPUT = ROOT / "public/assets/models/environment"


def descendants(anchor):
    return [obj for obj in anchor.children_recursive if obj.type == "MESH"]


def convex_hull(points):
    points = sorted(set(points))
    def cross(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    lower, upper = [], []
    for p in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def plateau(mesh):
    """Conservative inscribed circle from the authored grass cap's flat faces."""
    faces = [p for p in mesh.polygons
             if "grass" in mesh.materials[p.material_index].name.lower() and p.normal.z > .95]
    if not faces:
        raise RuntimeError("Outcrop has no flat grass cap")
    points = [mesh.vertices[i].co for p in faces for i in p.vertices]
    top = max(v.z for v in points)
    flat_points = [(round(v.x, 6), round(v.y, 6)) for v in points if abs(v.z - top) < .001]
    hull = convex_hull(flat_points)
    if len(hull) < 3:
        raise RuntimeError("Outcrop cap must have a polygonal support surface")
    distances = []
    for a, b in zip(hull, hull[1:] + hull[:1]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        # The origin must lie inside every counterclockwise hull edge.
        inward = (dx * -a[1] - dy * -a[0]) / math.hypot(dx, dy)
        if inward <= 0:
            raise RuntimeError("Outcrop cap does not contain its centered origin")
        distances.append(inward)
    return {"plateauY": round(top, 6), "plateauRadius": round(min(distances) * .9, 6)}


def export_asset(name, objects, stage):
    bpy.ops.object.select_all(action="DESELECT")
    copies = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for source in objects:
        evaluated = source.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
        mesh.transform(source.matrix_world)
        obj = bpy.data.objects.new("export | " + source.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.select_set(True)
        copies.append(obj)
    bpy.context.view_layer.objects.active = copies[0]
    if len(copies) > 1:
        bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    mesh = obj.data
    lo = Vector(tuple(min(v.co[i] for v in mesh.vertices) for i in range(3)))
    hi = Vector(tuple(max(v.co[i] for v in mesh.vertices) for i in range(3)))
    size = hi - lo
    if name == "tree_root_oak":
        factor = 3.2 / size.z
    elif name.startswith("tree_"):
        factor = 2 / size.z
    elif name.startswith("rock_"):
        factor = 2.4 / max(size.x, size.y)
    elif name.startswith("stone_"):
        width = .25 if "small" in name else .5 if "medium" in name else .9
        factor = width / max(size.x, size.y)
    else:
        height = .38 if name == "grass" else .65 if "bush" in name else .55 if "flower" in name else .4 if "mushroom" in name else .6 if "stump" in name else .5
        factor = height / size.z
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    mesh.transform(Matrix.Scale(factor, 4) @ Matrix.Translation(-center))
    mesh.update()
    # Join collapses dozens of authored leaf objects; share identical material slots.
    materials, remap = [], {}
    for index, mat in enumerate(mesh.materials):
        if mat not in materials:
            materials.append(mat)
        remap[index] = materials.index(mat)
    indices = [remap[p.material_index] for p in mesh.polygons]
    mesh.materials.clear()
    for mat in materials:
        mesh.materials.append(mat)
    for p, index in zip(mesh.polygons, indices):
        p.material_index = index
    metadata = plateau(mesh) if name.startswith("rock_") else {}
    for key, value in metadata.items():
        obj[key] = value
    bpy.ops.export_scene.gltf(filepath=str(stage / (name + ".glb")), use_selection=True,
                              export_extras=True, export_animations=False, export_cameras=False,
                              export_lights=False)
    bounds = [max(v.co[i] for v in mesh.vertices) - min(v.co[i] for v in mesh.vertices) for i in range(3)]
    triangles = sum(len(p.vertices) - 2 for p in mesh.polygons)
    result = {"name": name, "url": f"/assets/models/environment/{name}.glb",
              "triangles": triangles, "materials": len(materials),
              "size": [round(bounds[0], 6), round(bounds[2], 6), round(bounds[1], 6)], **metadata}
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    return result


def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    assets = {}
    for obj in bpy.data.objects:
        if obj.type != "EMPTY":
            continue
        if "source_glb" in obj or obj.name.startswith("stone_") or obj.name.startswith("rock_"):
            meshes = descendants(obj)
            if meshes:
                assets[obj.name.split(".")[0]] = meshes
    assets["tree_root_oak"] = descendants(bpy.data.objects["RootOak_Origin"])
    if len(assets) != 38:
        raise RuntimeError(f"Expected 38 catalog assets, found {len(assets)}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="game-environment-export-") as temporary:
        stage = Path(temporary)
        results = [export_asset(name, objects, stage) for name, objects in sorted(assets.items())]
        for entry in results:
            file = stage / (entry["name"] + ".glb")
            if file.read_bytes()[:4] != b"glTF":
                raise RuntimeError(f"Export is not a GLB: {file}")
        # Publish only after every asset passed export and structural checks.
        for entry in results:
            name = entry["name"] + ".glb"
            (OUTPUT / name).write_bytes((stage / name).read_bytes())
    manifest = {"source": "blender/environment/environment_resource_catalog.blend", "assets": results}
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("ENVIRONMENT_EXPORT=" + json.dumps({"assets": len(results), "triangles": sum(e["triangles"] for e in results),
          "bytes": sum((OUTPUT / (e["name"] + ".glb")).stat().st_size for e in results)}))


if __name__ == "__main__":
    main()
