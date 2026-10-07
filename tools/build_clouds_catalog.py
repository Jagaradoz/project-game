"""Author section "05 Clouds" of the environment catalog: every cloud the game draws.

Run inside the open catalog (live Blender) or headless, after tools/build_trail_obstacles_catalog.py:
  blender --background public/assets/models/blender/environment/environment_resource_catalog.blend --python tools/build_clouds_catalog.py

The section holds
  - assets:   sky_cloud (exported, baked vertex shading), spore_puff_{A,B,C}
  - displays: the game's whole sky layer at 1:40, and one full spore cloud at 1:1, both laid out from
              src/engine/render/world/cloud-layout.json with a port of the game's seeded RNG, so they are
              exactly what the game shows on the frame a cloud appears.
Game axes (x, y up, z towards the camera) map to Blender as (x, -z, y), the same as the glTF exporter.
Re-running rebuilds the section from scratch.
"""

import importlib.util
import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(r"D:\Engineering Works\project-game")
LAYOUT = json.loads((ROOT / "src/engine/render/world/cloud-layout.json").read_text(encoding="utf-8"))
ASSET_COLLECTION = "ASSETS | Clouds"
DISPLAY_COLLECTION = "DISPLAY | Clouds"
SKY_DISPLAY_SCALE = 1 / 40
HAZE = "fff3e2"            # palette.sky.haze; the game lifts it by sky.hazeLift and multiplies the baked shading
TRAIL = "9e754b"           # palette.ground.trail
VERGE = "6c8044"           # palette.ground.verge
SKY = "c9d2bc"             # palette.sky.zenith, as a backdrop for the white clouds

# The sky cloud: overlapping 20-face lumps in game axes (x, y up, z) with radius. Enough of them for a
# silhouette that survives being seen from below and close up.
SKY_BLOBS = [(0, 0, 0, 1), (.95, -.18, .12, .7), (-.9, -.22, -.08, .64), (.2, .38, -.22, .58),
             (-.35, .3, .3, .5), (1.55, -.35, -.15, .42), (-1.5, -.34, .18, .38)]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


KIT = load_module("trail_obstacles_import", ROOT / "tools/build_trail_obstacles_catalog.py")


def g2b(x, y, z):
    """Game axes to Blender axes."""
    return Vector((x, -z, y))


class GameRng:
    """Port of createRng in src/engine/render/world/rng.ts (32-bit LCG); same seed, same stream."""

    def __init__(self, seed):
        self.state = seed & 0xFFFFFFFF

    def __call__(self):
        self.state = (self.state * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.state / 2 ** 32

    def range(self, low, high):
        return low + self() * (high - low)


def linear(hex_color):
    return [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
            for c in (int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4))]


# --- materials -----------------------------------------------------------------

def fresh_material(name):
    old = bpy.data.materials.get(name)
    if old:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    return mat, mat.node_tree.nodes, mat.node_tree.links


def output_node(nodes):
    return next(n for n in nodes if n.type == "OUTPUT_MATERIAL")


def sky_material():
    """Unlit: baked vertex shading times the lifted haze, like the game's MeshBasicMaterial."""
    mat, nodes, links = fresh_material("skyCloud")
    for node in [n for n in nodes if n.type != "OUTPUT_MATERIAL"]:
        nodes.remove(node)
    shading = nodes.new("ShaderNodeVertexColor")
    shading.layer_name = "Color"
    tint = nodes.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.blend_type = "MULTIPLY"
    tint.inputs["Factor"].default_value = 1
    lift = LAYOUT["sky"]["hazeLift"]
    tint.inputs["B"].default_value = (*[c * lift for c in linear(HAZE)], 1)
    emission = nodes.new("ShaderNodeEmission")
    links.new(shading.outputs["Color"], tint.inputs["A"])
    links.new(tint.outputs["Result"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output_node(nodes).inputs["Surface"])
    mat.diffuse_color = (*linear(HAZE), 1)
    return mat


def blended(mat):
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = False


def node_math(nodes, links, operation, a, b=None):
    node = nodes.new("ShaderNodeMath")
    node.operation = operation
    for socket, value in zip(node.inputs, (a, b)):
        if value is None:
            continue
        if isinstance(value, (int, float)):
            socket.default_value = value
        else:
            links.new(value, socket)
    return node.outputs[0]


def spore_puff_material():
    """Node port of sporeMist.ts: unlit tint graded from mistShade (base) to mistLift (top), rim glow at grazing
    angles, alpha fading out towards the silhouette. Object colour = instance tint, object alpha = end fade."""
    spore = LAYOUT["spore"]
    mat, nodes, links = fresh_material("sporePuff")
    for node in [n for n in nodes if n.type != "OUTPUT_MATERIAL"]:
        nodes.remove(node)
    info = nodes.new("ShaderNodeObjectInfo")
    geometry = nodes.new("ShaderNodeNewGeometry")
    coords = nodes.new("ShaderNodeTexCoord")
    split = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Object"], split.inputs["Vector"])
    # facing = |N . V|; body = smoothstep(0.05, 0.75, facing)
    dot = nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    links.new(geometry.outputs["Normal"], dot.inputs[0])
    links.new(geometry.outputs["Incoming"], dot.inputs[1])
    facing = node_math(nodes, links, "ABSOLUTE", dot.outputs["Value"])
    body = nodes.new("ShaderNodeMapRange")
    body.interpolation_type = "SMOOTHSTEP"
    body.inputs["From Min"].default_value, body.inputs["From Max"].default_value = .05, .75
    links.new(facing, body.inputs["Value"])
    alpha = node_math(nodes, links, "MULTIPLY", body.outputs["Result"], info.outputs["Alpha"])
    alpha = node_math(nodes, links, "MULTIPLY", alpha, spore["puffOpacity"])
    # up = clamp(localY * 0.6 + 0.5); game local Y is Blender local Z
    up = node_math(nodes, links, "MULTIPLY_ADD", split.outputs["Z"], .6)
    up.node.inputs[2].default_value = .5
    up.node.use_clamp = True
    grade = nodes.new("ShaderNodeMix")
    grade.data_type = "RGBA"
    grade.inputs["A"].default_value = (*linear(spore["mistShade"][1:]), 1)
    grade.inputs["B"].default_value = (*linear(spore["mistLift"][1:]), 1)
    links.new(up, grade.inputs["Factor"])
    tinted = nodes.new("ShaderNodeMix")
    tinted.data_type = "RGBA"
    tinted.blend_type = "MULTIPLY"
    tinted.inputs["Factor"].default_value = 1
    links.new(grade.outputs["Result"], tinted.inputs["A"])
    links.new(info.outputs["Color"], tinted.inputs["B"])
    rim = node_math(nodes, links, "MULTIPLY", node_math(nodes, links, "SUBTRACT", 1.0, facing), spore["mistRimGlow"])
    glow = nodes.new("ShaderNodeMix")
    glow.data_type = "RGBA"
    glow.blend_type = "ADD"
    links.new(rim, glow.inputs["Factor"])
    links.new(tinted.outputs["Result"], glow.inputs["A"])
    links.new(info.outputs["Color"], glow.inputs["B"])
    emission = nodes.new("ShaderNodeEmission")
    links.new(glow.outputs["Result"], emission.inputs["Color"])
    clear = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    links.new(alpha, mix.inputs["Fac"])
    links.new(clear.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output_node(nodes).inputs["Surface"])
    blended(mat)
    mat.diffuse_color = (*linear(spore["puffColors"][0][1:]), spore["puffOpacity"])
    return mat


def flat_material(name, hex_color, alpha=1.0):
    mat, nodes, _ = fresh_material(name)
    shader = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*linear(hex_color), 1)
    shader.inputs["Roughness"].default_value = .95
    shader.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        blended(mat)
    mat.diffuse_color = (*linear(hex_color), alpha)
    return mat


# --- the sky cloud -------------------------------------------------------------------

def build_sky_cloud(name="sky_cloud"):
    """Merged lumps with the game's baked shading: bright warm top, cool shaded underside."""
    bm = bmesh.new()
    for x, y, z, r in SKY_BLOBS:
        verts = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)["verts"]
        bmesh.ops.translate(bm, verts=verts, vec=g2b(x, y, z))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    low = min(v.co.z for v in mesh.vertices)
    spread = max(1e-6, max(v.co.z for v in mesh.vertices) - low)
    colors = mesh.color_attributes.new("Color", "FLOAT_COLOR", "CORNER")
    for loop in mesh.loops:
        t = (mesh.vertices[loop.vertex_index].co.z - low) / spread
        shade = .58 + .42 * t
        cool = (1 - t) * .06  # undersides pick up a little sky, tops stay neutral
        colors.data[loop.index].color = (shade - cool * .5, shade - cool * .2, shade + cool, 1)
    mesh.color_attributes.active_color = colors
    mesh.materials.append(bpy.data.materials.get("skyCloud") or sky_material())
    return bpy.data.objects.new(name, mesh)


# --- displays ------------------------------------------------------------------

def sky_layer(collection, origin):
    """All sky clouds where the game puts them on frame zero (before any scroll), at 1:40."""
    sky = LAYOUT["sky"]
    root = bpy.data.objects.new("sky layer (1:40)", None)
    root.empty_display_size = 1 / SKY_DISPLAY_SCALE
    root.location = origin
    root.scale = (SKY_DISPLAY_SCALE,) * 3
    collection.objects.link(root)
    source = bpy.data.objects["sky_cloud"]
    rng = GameRng(sky["seed"])
    far_z = sky["startZ"] - sky["span"]
    for index in range(sky["count"]):
        y = rng.range(sky["minY"], sky["maxY"])
        altitude = (y - sky["minY"]) / (sky["maxY"] - sky["minY"])
        size = rng.range(9, 15) + altitude * 16
        x = rng.range(-sky["xSpread"], sky["xSpread"])
        z = far_z + rng() * sky["span"]
        yaw = rng() * math.tau
        sy, sz = size * rng.range(.44, .7), size * rng.range(.7, 1.15)
        cloud = source.copy()  # linked duplicate: the display can never drift from the asset
        cloud.name = f"sky layer | cloud {index:02d}"
        cloud.parent = root
        cloud.matrix_parent_inverse = Matrix.Identity(4)
        cloud.location = g2b(x, y, z)
        cloud.rotation_euler = (0, 0, yaw)
        cloud.scale = (size, sz, sy)
        collection.objects.link(cloud)
    # The camera's spot, so the layer reads as "above and ahead of the player".
    marker = bpy.data.objects.new("sky layer | camera", None)
    marker.empty_display_type = "CONE"
    marker.empty_display_size = 6
    marker.rotation_euler = (math.radians(90), 0, 0)
    marker.parent = root
    collection.objects.link(marker)
    return root


def valley_strip(half, length, ground):
    """The trail cross-section the cloud sits on: dirt over the lanes, verge beyond, following the valley."""
    xs = [i * .5 - half for i in range(int(half * 4) + 1)]
    bm = bmesh.new()
    rows = [[bm.verts.new((x, y, ground(x))) for x in xs] for y in (0, length)]
    trail_half = LAYOUT["spore"]["catalog"]["trailHalfWidth"]
    for k in range(len(xs) - 1):
        face = bm.faces.new((rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k]))
        face.material_index = 0 if abs((xs[k] + xs[k + 1]) / 2) < trail_half - .2 else 1
        if face.normal.z < 0:
            face.normal_flip()
    mesh = bpy.data.meshes.new("spore cloud | valley")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(flat_material("sporeDisplayTrail", TRAIL))
    mesh.materials.append(flat_material("sporeDisplayVerge", VERGE))
    return bpy.data.objects.new(mesh.name, mesh)


def spore_cloud(collection, origin):
    """One whole spore cloud as the game lays it out (spores.ts addSporeCloud, frame zero)."""
    spore = LAYOUT["spore"]
    length = spore["catalog"]["length"]
    half = spore["catalog"]["trailHalfWidth"]
    profile = KIT.load_profile()
    ground = KIT.profile_sampler(profile, 1)
    root = bpy.data.objects.new("spore cloud (1:1)", None)
    root.empty_display_size = 2
    root.location = origin
    root.rotation_euler = (0, 0, math.pi)  # front edge at the top of the section, cloud running down the page
    collection.objects.link(root)

    def adopt(obj):
        obj.parent = root
        obj.matrix_parent_inverse = Matrix.Identity(4)
        collection.objects.link(obj)
        return obj

    strip = adopt(valley_strip(half + 3.5, length, ground))
    strip.location.z = -.002
    tint = flat_material("sporeGround", spore["groundColor"][1:], spore["groundOpacity"])
    plane = bpy.data.meshes.new("spore cloud | ground tint")
    plane.from_pydata([(-half, 0, 0), (half, 0, 0), (half, length, 0), (-half, length, 0)], [], [(0, 1, 2, 3)])
    plane.materials.append(tint)
    adopt(bpy.data.objects.new(plane.name, plane)).location.z = .05

    rng = GameRng(spore["seed"])
    puffs = []
    for _ in range(spore["puffsPerShape"] * len(spore["puffAssets"])):
        x = rng.range(-half, half)
        low = spore["laneClearY"] if abs(x) < spore["laneClearX"] else spore["puffMinY"]
        puffs.append({"x": x, "y": rng.range(low, spore["puffMaxY"]), "t": rng(),
                      "size": rng.range(spore["puffMinSize"], spore["puffMaxSize"]),
                      "yaw": rng() * math.tau, "phase": rng() * math.tau})
    shapes = [bpy.data.objects[name] for name in spore["puffAssets"]]
    colors = spore["puffColors"]
    for i, puff in enumerate(puffs):
        z = -puff["t"] * length
        edge = max(0, min(1, -z / spore["edgeFade"], (length + z) / spore["edgeFade"]))
        breathe = 1 + math.sin(puff["phase"]) * .12
        obj = shapes[i % len(shapes)].copy()
        obj.name = f"spore cloud | puff {i:03d}"
        obj.location = g2b(puff["x"] + math.cos(puff["phase"]) * .3,
                           puff["y"] + math.sin(puff["phase"]) * spore["puffBob"], z)
        obj.rotation_euler = (0, 0, puff["yaw"])
        shrink = spore["puffEdgeMinScale"] + (1 - spore["puffEdgeMinScale"]) * edge
        obj.scale = (puff["size"] * breathe * shrink,) * 3
        obj.color = (*linear(colors[((i // len(shapes)) * 7) % len(colors)][1:]), edge)  # alpha = end fade
        adopt(obj)

    # Spore motes at time zero (sporeMist.ts createSporeMotes), as one point-cloud mesh drawn as tiny gems.
    glow = flat_material("sporeMote", spore["moteColor"][1:])
    shader = next(n for n in glow.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Emission Color"].default_value = (*linear(spore["moteColor"][1:]), 1)
    shader.inputs["Emission Strength"].default_value = 2
    bm = bmesh.new()
    low = spore["puffMinY"]
    for _ in range(spore["moteCount"]):
        x, y, t = rng.range(-half, half), rng.range(0, spore["puffMaxY"] - low), rng.range(.04, .96)
        phase = rng() * math.tau
        rng.range(.25, .7)  # speed: consumed to keep the stream aligned with the game
        centre = g2b(x + math.sin(phase) * .35, low + y, -t * length)
        verts = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=spore["moteSize"] * .25)["verts"]
        bmesh.ops.translate(bm, verts=verts, vec=centre)
    mesh = bpy.data.meshes.new("spore cloud | motes")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(glow)
    adopt(bpy.data.objects.new(mesh.name, mesh))
    return root


# --- section -------------------------------------------------------------------

def clear_section():
    for name in (ASSET_COLLECTION, DISPLAY_COLLECTION):
        collection = bpy.data.collections.get(name)
        if not collection:
            continue
        for obj in list(collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(collection)
    for mesh in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(mesh)


def label(text, source, collection, location, size=None):
    obj = KIT.copy_object(source, "label | " + text, collection, location, data_copy=True)
    obj.data.body = text
    if size:
        obj.data.size = size
    return obj


def sky_backdrop(tile):
    """Tint a tile with the game's sky, or a near-white cloud on a white tile has no silhouette."""
    mat = bpy.data.materials.get("skyBackdrop") or flat_material("skyBackdrop", SKY)
    for slot in tile.material_slots:
        slot.link = "OBJECT"
        slot.material = mat


def display_tile(name, centre, size, collection, tile_source, label_source, sky=False):
    tile = KIT.copy_object(tile_source, "display tile | " + name, collection, (centre[0], centre[1], -.14))
    tile.scale = (size[0] / tile_source.dimensions.x, size[1] / tile_source.dimensions.y, 1)
    if sky:
        sky_backdrop(tile)
    label(name, label_source, collection, (centre[0] - size[0] / 2 + .22, centre[1] + size[1] / 2 - .5, .04))


def extend_floor(bottom):
    """Grow the display floor down to `bottom` (idempotent: tracks how much this section added)."""
    # Works on scale, not `dimensions`, which goes stale until the depsgraph updates mid-script.
    floor = bpy.data.objects["display floor"]
    unit = max(v.co.y for v in floor.data.vertices) - min(v.co.y for v in floor.data.vertices)
    added = floor.get("clouds_extra") or 0.0
    length = unit * floor.scale.y - added
    centre = floor.location.y + added / 2
    extra = max(0.0, (centre - length / 2) - bottom)
    floor.scale.y = (length + extra) / unit
    floor.location.y = centre - extra / 2
    floor["clouds_extra"] = extra


def main():
    clear_section()
    assets, display = KIT.new_collection(ASSET_COLLECTION), KIT.new_collection(DISPLAY_COLLECTION)
    tile_source = bpy.data.objects["display tile | flower_purpleB"]
    label_source = bpy.data.objects["label | flower_purpleB"]
    tri_source = bpy.data.objects["triangles | flower_purpleB"]
    title_source = bpy.data.objects["04 Trail obstacles"]
    river = bpy.data.objects["river_crossing.anchor"]
    top = river.location.y - 4.1 - 1.6

    title = KIT.copy_object(title_source, "05 Clouds", display, (title_source.location.x, top, title_source.location.z),
                            data_copy=True)
    title.data.body = "05  CLOUDS / SKY CLOUD, SPORE CLOUD"

    spore_puff_material()
    entries = [(build_sky_cloud(), (-11.4, top - 3.6), (5.6, 4.2), .55)]
    for index, variant in enumerate("ABC"):
        puff = KIT.build_spore_puff(variant)
        puff.color = (*linear(LAYOUT["spore"]["puffColors"][index][1:]), 1)
        entries.append((puff, (-6.3 + index * 3.5, top - 3.6), (3.2, 4.2), 1.0))
    for obj, centre, tile, lift in entries:
        anchor = KIT.place_asset(obj, obj.name, centre, tile, assets, display, tile_source, label_source, tri_source)
        anchor.location.z += lift  # clouds float above their tiles
        if obj.name == "sky_cloud":
            obj.scale = (1.2,) * 3
            sky_backdrop(bpy.data.objects["display tile | sky_cloud"])

    displays_top = top - 6.4
    length = LAYOUT["spore"]["catalog"]["length"]
    sky_depth = LAYOUT["sky"]["span"] * SKY_DISPLAY_SCALE
    sky_width = LAYOUT["sky"]["xSpread"] * 2 * SKY_DISPLAY_SCALE
    sky_centre = (-7.0, displays_top - sky_depth / 2 - 1)
    display_tile("sky layer, as in game (1:40)", sky_centre, (sky_width + 2, sky_depth + 2), display, tile_source, label_source,
                 sky=True)
    # Game z = startZ is behind the camera; put the camera marker where the layer's origin falls.
    origin_y = displays_top - 1 - (sky_depth - LAYOUT["sky"]["startZ"] * SKY_DISPLAY_SCALE)
    sky_layer(display, (sky_centre[0], origin_y, 0))

    spore_centre = (7.6, displays_top - length / 2 - 1)
    display_tile("spore cloud, as in game (1:1)", spore_centre, (16.4, length + 2), display, tile_source, label_source)
    spore_cloud(display, (spore_centre[0], displays_top - 1, 0))

    extend_floor(displays_top - length - 4)
    camera_source = bpy.data.objects["CAMERA | Trail obstacles"]
    camera = KIT.copy_object(camera_source, "CAMERA | Clouds", display,
                             (0, displays_top - length / 2 - 18, 60), data_copy=True)
    camera.data.ortho_scale = length + 12
    print("CLOUDS", [(obj.name, KIT.triangle_count(obj)) for obj, *_ in entries])


if __name__ != "clouds_import":
    main()
