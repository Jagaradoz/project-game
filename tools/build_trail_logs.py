"""Build independent faceted trail logs in a private background Blender process.

Run: blender --background --factory-startup --python tools/build_trail_logs.py
Blender X maps to game X; Blender Z maps to game Y. No source assets are opened.
"""

import json
import math
import struct
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "public/assets/models/environment"
BLEND_PATH = ROOT / "public/assets/models/blender/environment/trail_logs.blend"
RECORD_PATH = ROOT / "docs/tasks/hazard-assets-record.md"


def material(name, color):
    rgb = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = .95
    return mat


def build_log(scene, name, length, materials):
    vertices, faces, shades = [], [], []

    def face(indices, shade):
        faces.append(tuple(indices))
        shades.append(shade)

    # More longitudinal sections on the longer log: the diameter and bark
    # details remain authored at the same scale instead of stretching an asset.
    sides, sections = 12, round(length / .6)
    ring_positions = []
    for segment in range(sections + 1):
        x = -length / 2 + length * segment / sections
        offset_y = .012 * math.sin(segment * 1.13)
        offset_z = .012 * math.sin(segment * .83)
        profile = []
        for side in range(sides):
            angle = math.tau * side / sides
            ridge = 1 + .055 * math.sin(side * 2.7) + .025 * math.sin(segment * 1.1 + side)
            y = offset_y + .335 * math.cos(angle) * ridge
            z = .296 + offset_z + .285 * math.sin(angle) * ridge
            profile.append((y, z))
            vertices.append((x, y, z))
        ring_positions.append(profile)
    for segment in range(sections):
        for side in range(sides):
            a, b = segment * sides + side, segment * sides + (side + 1) % sides
            # Broad bark strips, with sparse darker grain valleys.
            shade = 1 if side in (2, 7, 10) else 2 if side in (1, 5) else 0
            face((a, b, b + sides, a + sides), shade)

    # Cut faces are slightly inset in the bark rim. Polygonal growth rings
    # use geometry and flat materials, so they need no external textures.
    for end, profile in [(-1, ring_positions[0]), (1, ring_positions[-1])]:
        x = end * (length / 2 - .006)
        cy = sum(p[0] for p in profile) / sides
        cz = sum(p[1] for p in profile) / sides
        start = len(vertices)
        scales = [1, .86, .63, .60, .35, .32, .12]
        for scale in scales:
            for side, (y, z) in enumerate(profile):
                warp = 1 + .02 * math.sin(side * 1.7 + end)
                vertices.append((x, cy + (y - cy) * scale * warp, cz + (z - cz) * scale))
        for ring in range(len(scales) - 1):
            for side in range(sides):
                a = start + ring * sides + side
                b = start + ring * sides + (side + 1) % sides
                indices = (a, b, b + sides, a + sides)
                face(reversed(indices) if end == -1 else indices, [0, 3, 4, 3, 4, 3][ring])
        indices = tuple(start + (len(scales) - 1) * sides + i for i in range(sides))
        face(reversed(indices) if end == -1 else indices, 3)

    # Stubby broken branches occupy the top/near side, staying inside the
    # solid body's lateral endpoints and the common gameplay footprint.
    for index, frac in enumerate((-.28, .08, .33)):
        base = Vector((length * frac, -.19 + index * .12, .40))
        tip = base + Vector((.10 * (-1 if index % 2 else 1), -.08, .22 - index * .015))
        direction = (tip - base).normalized()
        u = direction.cross(Vector((1, 0, 0))).normalized()
        v = direction.cross(u).normalized()
        start = len(vertices)
        for center, radius in [(base, .095), (tip, .055)]:
            for side in range(7):
                angle = math.tau * side / 7
                vertices.append(tuple(center + radius * (u * math.cos(angle) + v * math.sin(angle))))
        for side in range(7):
            a, b = start + side, start + (side + 1) % 7
            face((a, b, b + 7, a + 7), 1 if side % 3 == 0 else 0)
        face(reversed(tuple(start + side for side in range(7))), 0)
        face(tuple(start + 7 + side for side in range(7)), 3)

    # Small raised longitudinal ridges give bark readable relief at road level.
    for index in range(sections):
        x = -length / 2 + (index + .5) * length / sections
        y = -.324 + .012 * math.sin(index)
        z = .29 + .10 * math.sin(index * 2.4)
        start = len(vertices)
        vertices.extend([(x - .23, y, z), (x + .20, y, z + .009),
                         (x + .12, y - .012, z + .042), (x - .18, y - .014, z + .033)])
        face((start, start + 1, start + 2, start + 3), 1)

    # Exact authored footprint: snap vertical ground datum, center the depth,
    # and normalize height identically for both independently built variants.
    low_z = min(p[2] for p in vertices)
    high_z = max(p[2] for p in vertices)
    low_y = min(p[1] for p in vertices)
    high_y = max(p[1] for p in vertices)
    mid_y = (low_y + high_y) / 2
    vertices = [(x, y - mid_y, (z - low_z) * .65 / (high_z - low_z)) for x, y, z in vertices]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for mat in materials:
        mesh.materials.append(mat)
    for polygon, shade in zip(mesh.polygons, shades):
        polygon.material_index = shade
        polygon.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj["game_length"] = length
    obj["game_height"] = .65
    obj["orientation"] = "long axis game X; ground Y=0; centered X/Z"
    return obj


def glb_summary(path):
    """Inspect serialized vertices through node transforms in glTF/game axes."""
    raw = path.read_bytes()
    magic, version, size = struct.unpack_from("<4sII", raw)
    assert magic == b"glTF" and version == 2 and size == len(raw)
    json_length, chunk_type = struct.unpack_from("<II", raw, 12)
    assert chunk_type == 0x4E4F534A
    document = json.loads(raw[20:20 + json_length])
    binary_offset = 20 + json_length
    binary_length, chunk_type = struct.unpack_from("<II", raw, binary_offset)
    assert chunk_type == 0x004E4942
    binary = raw[binary_offset + 8:binary_offset + 8 + binary_length]
    points, triangles, primitive_count = [], 0, 0

    def walk(index, parent):
        nonlocal triangles, primitive_count
        node = document["nodes"][index]
        if "matrix" in node:
            values = node["matrix"]
            transform = Matrix([[values[col * 4 + row] for col in range(4)] for row in range(4)])
        else:
            x, y, z, w = node.get("rotation", [0, 0, 0, 1])
            transform = Matrix.LocRotScale(Vector(node.get("translation", [0, 0, 0])),
                                          Quaternion((w, x, y, z)), Vector(node.get("scale", [1, 1, 1])))
        world = parent @ transform
        if "mesh" in node:
            for primitive in document["meshes"][node["mesh"]]["primitives"]:
                primitive_count += 1
                assert primitive.get("mode", 4) == 4
                accessor = document["accessors"][primitive["attributes"]["POSITION"]]
                assert accessor["componentType"] == 5126 and accessor["type"] == "VEC3"
                view = document["bufferViews"][accessor["bufferView"]]
                offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
                stride = view.get("byteStride", 12)
                for n in range(accessor["count"]):
                    points.append(world @ Vector(struct.unpack_from("<3f", binary, offset + n * stride)))
                triangles += document["accessors"][primitive["indices"]]["count"] // 3
        for child in node.get("children", []):
            walk(child, world)

    for index in document["scenes"][document.get("scene", 0)]["nodes"]:
        walk(index, Matrix.Identity(4))
    low = [min(p[axis] for p in points) for axis in range(3)]
    high = [max(p[axis] for p in points) for axis in range(3)]
    return {"file": str(path.relative_to(ROOT)), "min": [round(v, 6) for v in low],
            "max": [round(v, 6) for v in high], "size": [round(b - a, 6) for a, b in zip(low, high)],
            "triangles": triangles, "mesh_nodes": len(document["meshes"]),
            "material_primitives": primitive_count,
            "materials": [mat["name"] for mat in document["materials"]], "bytes": len(raw)}


def main():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    materials = [material(name, color) for name, color in [
        ("woodBark", "765033"), ("woodBarkDark", "493322"),
        ("woodBarkWarm", "805b3b"), ("woodInner", "d3a36b"), ("wood", "b9864a")]]
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    entries = []
    for name, length in [("log_two_lane", 4.8), ("log_three_lane", 7.2)]:
        scene = bpy.data.scenes.new(name)
        scene.unit_settings.system = "METRIC"
        bpy.context.window.scene = scene
        obj = build_log(scene, name, length, materials)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.export_scene.gltf(filepath=str(MODEL_DIR / (name + ".glb")),
                                  export_format="GLB", use_selection=True, use_active_scene=True, export_extras=True,
                                  export_animations=False, export_cameras=False, export_lights=False)
        summary = glb_summary(MODEL_DIR / (name + ".glb"))
        assert abs(summary["size"][0] - length) < .00001
        assert abs(summary["min"][1]) < .00001
        assert abs(summary["size"][1] - .65) < .00001
        assert summary["size"][2] <= .9
        assert abs(summary["min"][0] + summary["max"][0]) < .00001
        assert abs(summary["min"][2] + summary["max"][2]) < .00001
        assert summary["mesh_nodes"] == 1 and summary["triangles"] < 1500
        entries.append(summary)
    for scene in list(bpy.data.scenes):
        if scene.name not in ("log_two_lane", "log_three_lane"):
            bpy.data.scenes.remove(scene)
    bpy.context.window.scene = bpy.data.scenes["log_two_lane"]
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                view = area.spaces.active
                view.region_3d.view_distance = 6
                view.region_3d.view_location = Vector((0, 0, .3))
                view.shading.type = "MATERIAL"
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), compress=True)
    lines = ["# Hazard log asset record", "", "## Summary", "",
             "Built two independent low-poly logs in background Blender. Original tree/catalog assets and the live Blender scene were not opened or modified.", "",
             "## Key changes", "",
             "- Faceted irregular bark, contrasting cut ends with geometric wood rings, three broken branch stubs and sparse raised bark grain.",
             "- Palette material names: woodBark, woodBarkDark, woodInner and wood; restrained woodBarkWarm retains authored color.",
             "- Editable Blender source has a separate scene per variant; GLBs contain one mesh each, with no lights, cameras, images or external buffers.",
             "- Source: `tools/build_trail_logs.py`; Blender: `public/assets/models/blender/environment/trail_logs.blend`.", "",
             "## Validation", "", "Serialized GLB positions inspected through full node transforms in game/glTF X/Y/Z axes:", "",
             "| Model | Bounds min | Bounds max | Triangles | Material primitives | Bytes |", "|---|---|---|---:|---:|---:|"]
    for item in entries:
        lines.append(f"| {Path(item['file']).name} | {item['min']} | {item['max']} | {item['triangles']} | {item['material_primitives']} | {item['bytes']} |")
    lines.extend(["", "Both lengths, 0.65 height, ground datum Y=0, centered X/Z and depth below 0.9 passed assertions. Material and triangle structure checked from exported binaries. Game-camera visual acceptance remains supervisor validation.",
                  "", "## Blockers", "", "None for asset export and structural validation.", ""])
    RECORD_PATH.write_text("\n".join(lines), encoding="utf-8")
    print("TRAIL_LOG_RESULT=" + json.dumps(entries))


if __name__ == "__main__":
    main()
