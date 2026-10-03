"""Build a Blender contact sheet from the GLBs selected by the game scenery.

Run with Blender: blender --background --factory-startup --python tools/build_environment_catalog.py
"""

import json
import math
import re
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "public/assets/models/nature"
SCATTER_SOURCE = ROOT / "src/engine/render/world/scatter.ts"
LANDMARK_SOURCE = ROOT / "src/engine/render/world/landmarks.ts"
OUTPUT_DIR = ROOT / "public/assets/models/blender/environment"
PREVIEW_DIR = ROOT / "docs/shots/environment-catalog"
BLEND_PATH = OUTPUT_DIR / "environment_resource_catalog.blend"

FOREST_COLORS = {
    "grass": "63834a", "leafsGreen": "537d3f", "leafsDark": "2e5433",
    "leafsFall": "e48b3a", "dirt": "a98055", "dirtDark": "715338",
    "stone": "b8b1a2", "stoneDark": "726b60", "wood": "b9864a",
    "woodBark": "765033", "woodBarkDark": "493322", "woodDark": "17120e",
    "woodBirch": "fff3e2", "woodInner": "d3a36b", "water": "5e9ea5",
    "corn": "e8bb63", "colorRed": "fe6601", "colorRedDark": "a84314",
    "colorYellow": "f5c75b", "colorPurple": "9972a5",
    "colorWhite": "fff3e2", "colorTan": "e7c395",
}


def linear_channel(value):
    value = int(value, 16) / 255
    return value / 12.92 if value < 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def rgba(hex_color):
    return (*[linear_channel(hex_color[i:i + 2]) for i in (0, 2, 4)], 1)


def flat_material(name, hex_color):
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba(hex_color)
    material.use_nodes = True
    shader = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if shader:
        shader.inputs["Base Color"].default_value = rgba(hex_color)
        shader.inputs["Roughness"].default_value = 1
    return material


def recolor_imported_materials(objects):
    for obj in objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            material = slot.material
            if not material:
                continue
            base_name = re.sub(r"\.\d{3}$", "", material.name)
            if base_name not in FOREST_COLORS:
                continue
            color = rgba(FOREST_COLORS[base_name])
            material.diffuse_color = color
            if material.use_nodes:
                shader = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
                if shader:
                    shader.inputs["Base Color"].default_value = color
                    shader.inputs["Metallic"].default_value = 0
                    shader.inputs["Roughness"].default_value = 1


def runtime_models():
    source = SCATTER_SOURCE.read_text(encoding="utf-8")
    model_arrays = re.findall(r"models:\s*\[([^\]]*)\]", source, re.S)
    names = set(re.findall(r"'([^']+)'", " ".join(model_arrays)))
    landmark_source = LANDMARK_SOURCE.read_text(encoding="utf-8")
    landmark_match = re.search(r"const treeModels\s*=\s*await Promise\.all\(\[([^\]]*)\]", landmark_source)
    if landmark_match:
        names.update(re.findall(r"'([^']+)'", landmark_match.group(1)))
    if not names:
        raise RuntimeError("No runtime scenery models found")
    for name in names:
        if not (MODEL_DIR / f"{name}.glb").is_file():
            raise FileNotFoundError(f"Missing runtime model: {name}")
    return names


def category_for(name):
    if name.startswith("tree_"):
        return "Trees"
    if name.startswith(("rock_", "stone_", "cliff_")):
        return "Stones and cliffs"
    if name.startswith(("grass", "plant_", "flower_", "cactus_")):
        return "Grass and plants"
    return "Forest details"


def collection(name):
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def move_to_collection(obj, target):
    target.objects.link(obj)
    for prior in list(obj.users_collection):
        if prior != target:
            prior.objects.unlink(obj)


def add_cube(name, center, scale, material, target):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    move_to_collection(obj, target)
    return obj


def add_text(name, body, location, size, material, target):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.size = size
    curve.extrude = 0
    obj = bpy.data.objects.new(name, curve)
    target.objects.link(obj)
    obj.location = location
    curve.materials.append(material)
    return obj


def add_asset(name, x, y, target, target_height):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(MODEL_DIR / f"{name}.glb"))
    imported = list(set(bpy.data.objects) - before)
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh in {name}.glb")
    recolor_imported_materials(imported)
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    min_corner = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    max_corner = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    center = (min_corner + max_corner) / 2
    height = max(0.001, max_corner.z - min_corner.z)
    width = max(max_corner.x - min_corner.x, max_corner.y - min_corner.y)
    factor = min(target_height / height, 3.3 / max(0.001, width))
    anchor = bpy.data.objects.new(name, None)
    target.objects.link(anchor)
    anchor.empty_display_type = "PLAIN_AXES"
    anchor.empty_display_size = 0.15
    for obj in imported:
        move_to_collection(obj, target)
    for obj in imported:
        if obj.parent is None:
            world_matrix = obj.matrix_world.copy()
            obj.parent = anchor
            obj.matrix_world = world_matrix
    anchor.scale = (factor,) * 3
    anchor.location = (x - center.x * factor, y - center.y * factor, -min_corner.z * factor)
    anchor["source_glb"] = f"nature/{name}.glb"
    triangles = sum(sum(len(face.vertices) - 2 for face in obj.data.polygons) for obj in meshes)
    anchor["triangles"] = triangles
    return triangles


def add_camera(name, target_y, ortho_scale, distance):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = ortho_scale
    camera = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = (0, target_y - distance * 0.55, distance * 1.35)
    look_at = Vector((0, target_y, 0))
    camera.rotation_euler = (look_at - camera.location).to_track_quat("-Z", "Y").to_euler()
    return camera


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.name = "GAME ENVIRONMENT | runtime asset catalog"
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    display = collection("DISPLAY ONLY | labels and pedestals")
    board = flat_material("warm ivory board", "e7e0d2")
    ink = flat_material("ink text", "241e18")
    orange = flat_material("orange category", "fe6601")
    ground = flat_material("catalog ground", "ccc4b5")
    names = runtime_models()
    order = ("Trees", "Stones and cliffs", "Grass and plants", "Forest details")
    grouped = {section: sorted(name for name in names if category_for(name) == section) for section in order}
    manifest = []
    section_cameras = []
    cursor = 0.0
    columns, tile_x, tile_y = 6, 4.7, 4.5
    for section in reversed(order):
        number = order.index(section) + 1
        models = grouped[section]
        if not models:
            continue
        section_start = cursor
        row_count = math.ceil(len(models) / columns)
        section_height = 4.1 + row_count * tile_y
        section_display = collection(f"DISPLAY | {section}")
        add_text(f"{number:02d} {section}", f"{number:02d}  {section.upper()}  /  {len(models)} MODELS", (-13.4, cursor + section_height - 1.3, 0.04), 0.68, orange, section_display)
        target = collection(f"ASSETS | {section}")
        for index, name in enumerate(models):
            col, row = index % columns, index // columns
            x = (col - (columns - 1) / 2) * tile_x
            y = cursor + 4.1 + (row_count - 1 - row) * tile_y
            add_cube(f"display tile | {name}", (x, y, -0.14), (4.2, 4.15, 0.2), board, section_display)
            target_height = 2.8 if section == "Trees" else 1.9 if section == "Stones and cliffs" else 1.5
            triangles = add_asset(name, x, y + 0.25, target, target_height)
            add_text(f"label | {name}", name, (x - 1.88, y - 1.74, 0.035), 0.235, ink, section_display)
            add_text(f"triangles | {name}", f"{triangles} triangles", (x - 1.88, y - 2.02, 0.035), 0.17, ink, section_display)
            manifest.append({"name": name, "category": section, "triangles": triangles, "source": f"nature/{name}.glb"})
        section_cameras.append((f"{number:02d}-{section.lower().replace(' ', '-')}", add_camera(f"CAMERA | {section}", section_start + section_height / 2, 32, 25), target, section_display, row_count))
        cursor += section_height + 3.0
    add_cube("display floor", (0, cursor / 2 - 0.2, -0.36), (30, cursor + 3, 0.2), ground, display)
    overview = add_camera("CAMERA | All assets", cursor / 2, 34, cursor * 0.85)
    scene.camera = overview
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 2400
    scene.render.resolution_y = 5000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = rgba("eee9de")[:3]
    sun_data = bpy.data.lights.new("catalog sun", "SUN")
    sun_data.energy = 1.5
    sun = bpy.data.objects.new("catalog sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.4, -0.5, -0.5)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    category_collections = [entry[index] for entry in section_cameras for index in (2, 3)]
    for slug, camera, asset_collection, display_collection, rows in section_cameras:
        for section_collection in category_collections:
            section_collection.hide_render = section_collection not in (asset_collection, display_collection)
        scene.camera = camera
        scene.render.resolution_y = 1800 if rows >= 4 else 1150 if rows == 2 else 800
        scene.render.filepath = str(PREVIEW_DIR / f"{slug}.png")
        bpy.ops.render.render(write_still=True)
    for section_collection in category_collections:
        section_collection.hide_render = False
    scene.camera = overview
    scene.render.resolution_y = 5000
    scene.render.filepath = str(PREVIEW_DIR / "00-all-assets.png")
    bpy.ops.render.render(write_still=True)
    scene.camera = next(camera for _, camera, _, _, _ in section_cameras if camera.name == "CAMERA | Trees")
    scene.render.resolution_y = 1800
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.shading.type = "MATERIAL"
                area.spaces.active.overlay.show_overlays = False
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), compress=True)
    (PREVIEW_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"CATALOG_RESULT models={len(manifest)} max_triangles={max(item['triangles'] for item in manifest)} blend={BLEND_PATH}")


if __name__ == "__main__":
    main()
