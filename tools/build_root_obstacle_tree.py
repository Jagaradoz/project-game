"""Author a standalone low-poly roadside tree; preview pieces are kept separate.

Run: blender --background --factory-startup --python tools/build_root_obstacle_tree.py
The tree origin is the trunk base, +X points toward the road, and Z points up.
"""

import json
import math
import random
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/assets/models/blender/environment"
PREVIEW = ROOT / "docs/shots/root-obstacle-tree"
RNG = random.Random(46)


def interpolate_path(points, values, steps=3):
    """Catmull-Rom positions with interpolated radii, preserving authored knots."""
    result, profiles = [], [[] for _ in values]
    for index in range(len(points) - 1):
        a, b, c, d = [Vector(points[min(max(i, 0), len(points) - 1)]) for i in (index - 1, index, index + 1, index + 2)]
        for step in range(steps):
            t = step / steps
            p = .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
            result.append(tuple(p))
            for profile, source in zip(profiles, values):
                profile.append(source[index] * (1 - t) + source[index + 1] * t)
    result.append(points[-1])
    for profile, source in zip(profiles, values):
        profile.append(source[-1])
    return result, profiles


def material(name, color):
    rgb = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = 1
    return mat


def collection(name):
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def relocate(obj, coll):
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    coll.objects.link(obj)


def mesh_object(name, vertices, faces, mats, coll, parent=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.parent = parent
    for mat in mats:
        mesh.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = False
        # Long facets carry restrained tonal variation, rather than noisy speckles.
        face.material_index = (face.index % 11) % len(mats)
    return obj


def tube(name, points, radii, mats, coll, parent, sides=9, vertical=1):
    """Connected tapered rings with stable transported frames and closed ends."""
    points, (radii,) = interpolate_path(points, [radii], 3)
    vertices, faces = [], []
    previous_u = None
    for index, point in enumerate(points):
        point = Vector(point)
        tangent = Vector(points[min(index + 1, len(points) - 1)]) - Vector(points[max(0, index - 1)])
        tangent.normalize()
        reference = Vector((0, 0, 1)) if abs(tangent.z) < .85 else Vector((0, 1, 0))
        u = tangent.cross(reference).normalized()
        if previous_u is not None and u.dot(previous_u) < 0:
            u = -u
        v = tangent.cross(u).normalized()
        previous_u = u
        for side in range(sides):
            angle = side * math.tau / sides
            # Continuous bark ridges follow the full length of the limb.
            ridge = 1 + .085 * math.sin(angle * 7 + .3) + .045 * math.cos(angle * 4 + index * .17)
            offset = (u * math.cos(angle) + v * math.sin(angle) * vertical) * radii[index] * ridge
            vertices.append(tuple(point + offset))
    for ring in range(len(points) - 1):
        for side in range(sides):
            a, b = ring * sides + side, ring * sides + (side + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(reversed(range(sides))), tuple((len(points) - 1) * sides + i for i in range(sides))])
    return mesh_object(name, vertices, faces, mats, coll, parent)


def root_mesh(name, path, widths, crests, mats, coll, parent):
    """An irregular solid buttress: buried underside and exposed angular crest."""
    path, (widths, crests) = interpolate_path(path, [widths, crests], 3)
    vertices, faces = [], []
    # Rounded, slightly fluted arch with a broad buried foot.
    profile = [(-1.02, .025), (-.97, .23), (-.81, .52), (-.61, .76), (-.36, .87), (-.16, .97), (.04, 1), (.27, .92), (.45, .84), (.64, .69), (.82, .47), (.98, .19), (1, -.06), (.45, -.09), (-.45, -.09), (-.94, -.06)]
    for index, center in enumerate(path):
        ahead = Vector(path[min(index + 1, len(path) - 1)]) - Vector(path[max(0, index - 1)])
        across = Vector((-ahead.y, ahead.x, 0)).normalized()
        for side, height in profile:
            point = Vector(center) + across * side * widths[index]
            point.z = height * crests[index] if height > 0 else height
            vertices.append(tuple(point))
    sides = len(profile)
    for ring in range(len(path) - 1):
        for side in range(sides):
            a, b = ring * sides + side, ring * sides + (side + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    # Reversed profile convention: recalculate normals below before saving.
    faces.extend([tuple(reversed(range(sides))), tuple((len(path) - 1) * sides + i for i in range(sides))])
    obj = mesh_object(name, vertices, faces, mats, coll, parent)
    obj["role"] = "exposed root / future jump obstacle"
    return obj


def fuse_wood(asset, anchor, bark):
    """Union the intersecting limbs and roots into one sculpted, flat-shaded skin."""
    parts = [obj for obj in asset.objects if obj.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    wood = bpy.context.object
    wood.name = "RootOak_Wood_Continuous"
    remesh = wood.modifiers.new("Continuous root and branch junctions", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = .085
    remesh.use_smooth_shade = False
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    soften = wood.modifiers.new("Soften root junctions", "SMOOTH")
    soften.factor, soften.iterations = .65, 4
    bpy.ops.object.modifier_apply(modifier=soften.name)
    decimate = wood.modifiers.new("Authored low-poly surface", "DECIMATE")
    decimate.decimate_type = "COLLAPSE"
    decimate.ratio = .105
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    # Voxel union can leave tiny detached slivers at the thinnest root tips.
    topology = bmesh.new()
    topology.from_mesh(wood.data)
    pending, components = set(topology.verts), []
    while pending:
        stack, component = [pending.pop()], []
        while stack:
            vertex = stack.pop()
            component.append(vertex)
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other in pending:
                    pending.remove(other)
                    stack.append(other)
        components.append(component)
    main_body = max(components, key=len)
    fragments = [vertex for component in components if component is not main_body for vertex in component]
    if fragments:
        bmesh.ops.delete(topology, geom=fragments, context="VERTS")
    topology.to_mesh(wood.data)
    topology.free()
    wood.data.update()
    wood.data.materials.clear()
    for mat in bark:
        wood.data.materials.append(mat)
    moss = material("Bark | moss in damp root creases", "526242")
    wood.data.materials.append(moss)
    for face in wood.data.polygons:
        p = face.center
        angle = math.atan2(p.y, p.x)
        grain = math.sin(angle * 7 + p.z * .18) + .45 * math.sin(angle * 13 - p.z * .35)
        face.material_index = 2 if grain < -.85 else 1 if grain > .95 else 0
        if p.z < 1.3 and p.y > .3 and face.normal.z > .45 and math.sin(p.x * 3.7 + p.y * 5.3) > .15:
            face.material_index = 4
        face.use_smooth = False
    wood["road_crossing_x"] = [2.3, 7.8]
    wood["jump_crest_m"] = .8
    wood["main_root_reach_m"] = 9.2
    wood.parent = anchor
    return wood


def bark_details(wood, bark, asset, anchor):
    """Small tapered bark ridges and a weathered oval knot on the trunk."""
    for index in range(19):
        angle = index * 2.399
        z = 1.6 + (index % 7) * .77
        outward = Vector((math.cos(angle), math.sin(angle), 0))
        hits = []
        half = .24 + (index % 3) * .14
        for dz in [-half, -.4 * half, .45 * half, half]:
            origin = outward * 3 + Vector((0, 0, z + dz))
            hit, position, normal, _ = wood.ray_cast(origin, -outward)
            if hit:
                hits.append(tuple(position + normal * .018))
        if len(hits) == 4:
            tube(f"RootOak_Bark_Ridge_{index:02d}", hits, [.012, .065, .047, .008], [bark[index % 3]], asset, anchor, sides=5, vertical=.6)
    outward = Vector((-.3, -1, 0)).normalized()
    hit, center, normal, _ = wood.ray_cast(outward * 3 + Vector((0, 0, 3.85)), -outward)
    if hit:
        horizontal = normal.cross(Vector((0, 0, 1))).normalized()
        up = horizontal.cross(normal).normalized()
        vertices, faces = [], []
        for ring in range(3):
            scale, relief = [(1, .009), (.77, .045), (.47, .011)][ring]
            for i in range(12):
                angle = math.tau * i / 12
                vertices.append(tuple(center + normal * relief + horizontal * (.21 * math.cos(angle) * scale) + up * (.33 * math.sin(angle) * scale)))
        for ring in range(2):
            for i in range(12):
                a, b = ring * 12 + i, ring * 12 + (i + 1) % 12
                faces.append((a, b, b + 12, a + 12))
        faces.extend([tuple(reversed(range(12))), tuple(24 + i for i in range(12))])
        mesh_object("RootOak_Bark_Weathered_Knot", vertices, faces, [bark[2], bark[0]], asset, anchor)


def foliage(position, scale, index, asset, anchor, leaves, small=False):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1 if small else 2, radius=1, location=position)
    obj = bpy.context.object
    obj.name = f"RootOak_Leaf_{'Edge' if small else 'Crown'}_{index:02d}"
    for vertex in obj.data.vertices:
        p = vertex.co.normalized()
        variation = 1 + .13 * math.sin(p.x * 7 + index) * math.cos(p.y * 6 - p.z * 4) + RNG.uniform(-.055, .055)
        vertex.co *= variation
    obj.scale = scale
    obj.rotation_euler = (RNG.uniform(-.22, .22), RNG.uniform(-.22, .22), RNG.uniform(-1, 1))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if not small:
        modifier = obj.modifiers.new("Broad hand-sized canopy facets", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = .78
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    relocate(obj, asset)
    obj.parent = anchor
    for mat in leaves:
        obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        shade = polygon.normal.z + RNG.uniform(-.22, .22)
        polygon.material_index = 2 if shade > .68 else 1 if shade < -.3 else (0 if index % 3 else 3)
        polygon.use_smooth = False
    return obj


def cube(name, location, dimensions, mat, coll):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    relocate(obj, coll)
    return obj


def camera(name, location, target, scale, coll):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = scale
    obj = bpy.data.objects.new(name, data)
    coll.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    return obj


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    # This script is run in a private factory-startup process.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    scene.name = "ROOT OAK | roadside jump obstacle study"
    scene.unit_settings.system = "METRIC"
    asset = collection("ASSET | Root Oak")
    staging = collection("PREVIEW ONLY | roadside and scale")
    studio = collection("PREVIEW ONLY | cameras and lighting")
    bark = [material("Bark | " + label, color) for label, color in [("ochre", "765033"), ("warm", "805b3b"), ("shade", "67472f"), ("ridge", "906944")]]
    leaves = [material("Leaf | " + label, color) for label, color in [("forest", "52723b"), ("deep", "3d5b30"), ("sun", "718b49"), ("middle", "5c7c40")]]
    grass = material("Preview | forest floor", "63834a")
    road = material("Preview | earthen road", "a98055")
    stone = material("Preview | pale scale marker", "e3dac4")
    anchor = bpy.data.objects.new("RootOak_Origin", None)
    asset.objects.link(anchor)
    anchor["placement"] = "trunk base at origin; rotate +X toward road; root crest about 0.75 m across road"
    anchor["asset_only_collection"] = asset.name
    tube("RootOak_Trunk", [(0, 0, -.07), (.08, -.06, .65), (-.16, .14, 1.65), (-.22, .25, 2.7), (.04, .2, 4), (.4, .25, 5.7), (.28, .4, 7.4), (.72, .42, 8.9), (.85, .52, 10.5)], [1.52, 1.4, 1.22, 1.13, 1.02, .88, .7, .46, .17], bark, asset, anchor, sides=24)
    jump_root = root_mesh("RootOak_Root_Jump_Main", [(0, -.35, 0), (1.15, -.48, 0), (2.3, -.85, 0), (3.7, -1.3, 0), (5.3, -.95, 0), (6.9, -.48, 0), (8.5, -.58, 0), (9.2, -.28, 0)], [1.1, .93, .74, .62, .57, .45, .25, .055], [2.05, 1.55, 1.02, .81, .84, .73, .32, .045], bark, asset, anchor)
    jump_root["road_crossing_x"] = [2.3, 7.8]
    jump_root["jump_crest_m"] = .8
    for index, (angle, length) in enumerate([(1.03, 4.6), (2.12, 3.8), (3.04, 4.1), (4.13, 4.8), (5.03, 3.6)]):
        path = []
        for frac in [0, .21, .43, .64, .85, 1]:
            bend = angle + .29 * math.sin(frac * math.pi + index)
            path.append((math.cos(bend) * length * frac, math.sin(bend) * length * frac, 0))
        root_mesh(f"RootOak_Root_Buttress_{index + 1:02d}", path, [1.02, .75, .52, .38, .22, .045], [2.1, 1.4, .85, .58, .29, .04], bark, asset, anchor)
        fork_start = Vector(path[3])
        fork_end = Vector(path[5]) + Vector((math.cos(angle + .8), math.sin(angle + .8), 0)) * 1.4
        fork_middle = fork_start.lerp(fork_end, .55)
        root_mesh(f"RootOak_Root_FineFork_{index:02d}", [tuple(fork_start), tuple(fork_middle), tuple(fork_end)], [.24, .16, .035], [.49, .25, .025], bark, asset, anchor)
    root_mesh("RootOak_Root_Jump_Fork", [(5.1, -.9, 0), (6.05, -1.65, 0), (7.25, -2.2, 0), (8.1, -2.85, 0)], [.42, .32, .18, .04], [.69, .5, .3, .04], bark, asset, anchor)
    root_mesh("RootOak_Root_Jump_UpperFork", [(6.6, -.5, 0), (7.4, .02, 0), (8.2, .4, 0), (8.75, .15, 0)], [.31, .22, .12, .035], [.62, .35, .22, .035], bark, asset, anchor)
    branches = [
        ([(.25, .2, 5.4), (-1.2, .35, 6.9), (-2.7, .55, 8.4), (-4, .65, 9.2)], [.67, .51, .29, .08]),
        ([(.35, .3, 6.2), (1.9, .1, 7.5), (3.6, -.35, 8.9), (4.7, -.6, 9.5)], [.65, .47, .26, .08]),
        ([(.2, .3, 7), (.1, 1.9, 8.3), (-.8, 3, 9.7)], [.55, .36, .09]),
        ([(.4, .4, 8), (-.4, -1.3, 9.15), (-1.4, -2.5, 10.4)], [.45, .3, .09]),
    ]
    for index, (path, radii) in enumerate(branches):
        tube(f"RootOak_Bough_{index + 1:02d}", path, radii, bark, asset, anchor, sides=14)
        end = Vector(path[-1])
        start = Vector(path[-2])
        for direction in [-1, 1]:
            fork = end + Vector((direction * .55, direction * .9, .75))
            tube(f"RootOak_BoughFork_{index}_{direction}", [tuple(start), tuple(end), tuple(fork)], [radii[-2] * .65, .13, .035], bark, asset, anchor, sides=9)
    wood = fuse_wood(asset, anchor, bark)
    bark_details(wood, bark, asset, anchor)
    canopy = [
        ((-.6, .4, 12.5), (2.9, 2.45, 2.35)),
        ((-3.65, .7, 10.3), (2.7, 2.35, 1.8)),
        ((3.6, .1, 10.8), (2.65, 2.3, 2.05)),
        ((-.6, 2.95, 11.2), (2.55, 2.15, 2.15)),
        ((-.7, -2.35, 11.3), (2.65, 2.25, 1.95)),
        ((-2.9, -1.9, 9.9), (2.15, 1.9, 1.55)),
        ((3.1, -2.05, 10.0), (2.15, 1.9, 1.65)),
        ((2.7, 2.4, 10.9), (2.5, 2.0, 1.85)),
        ((-3, 2.65, 10.5), (2.25, 1.9, 1.65)),
        ((1.55, -.25, 12.6), (2.3, 2.1, 2.1)),
        ((-2.05, -.6, 11.8), (2.4, 2.05, 2.0)),
        ((.8, 1.45, 11.95), (2.8, 2.2, 2.1)),
    ]
    for index, (position, scale) in enumerate(canopy):
        foliage(position, scale, index, asset, anchor, leaves)
    # Smaller leaf sprays scallop the crown edges and reveal the branch forks.
    for index in range(26):
        angle = index * 2.399
        reach = 4.6 + .65 * math.sin(index * 1.7)
        position = (math.cos(angle) * reach, math.sin(angle) * reach * .79, 9.65 + .8 * math.sin(angle * 2 + .5))
        size = .85 + .28 * math.sin(index * 1.9) ** 2
        foliage(position, (size * 1.3, size, size * .88), index, asset, anchor, leaves, small=True)
    # Stagger the upper leaf sprays around the large crowns, avoiding a uniform rim.
    for index in range(18):
        angle = index * 2.399
        reach = 2.7 + .45 * math.sin(index * 1.3)
        position = (-.35 + math.cos(angle) * reach, .1 + math.sin(angle) * reach * .87, 12.9 + .5 * math.cos(angle * 2) + (index % 3) * .23)
        size = .72 + .22 * math.sin(index * 2.1) ** 2
        foliage(position, (size * 1.3, size, size * .85), index + 26, asset, anchor, leaves, small=True)
    # Root moss stays in sheltered creases; the crossing crest remains visible wood.
    # Ground and road are reference pieces, not part of the tree asset.
    cube("Preview_Forest_Ground", (1, 0, -.18), (27, 23, .25), grass, staging)
    cube("Preview_Main_Road_6m", (5.35, 0, -.047), (6.1, 23, .04), road, staging)
    # 1.8 m humanoid gives a direct scale reference beside the crossing root.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.18, location=(5.3, -3.8, 1.62))
    obj = bpy.context.object
    obj.name = "Preview_Scale_1.8m_Head"
    obj.data.materials.append(stone)
    relocate(obj, staging)
    cube("Preview_Scale_1.8m_Torso", (5.3, -3.8, 1.17), (.43, .26, .6), stone, staging)
    for side in [-1, 1]:
        cube(f"Preview_Scale_Leg_{side}", (5.3 + side * .12, -3.8, .43), (.17, .2, .86), stone, staging)
        cube(f"Preview_Scale_Arm_{side}", (5.3 + side * .32, -3.8, 1.1), (.16, .19, .65), stone, staging)
    hero = camera("CAMERA | Tree and crossing root", (24, -32, 20), (1.5, 0, 6.1), 23, studio)
    detail = camera("CAMERA | Root obstacle detail", (15, -19, 12), (3.2, -.5, 1.5), 13, studio)
    for name, location, energy, size in [("Key", (-7, -10, 19), 2400, 11), ("Fill", (9, -4, 12), 1400, 10), ("Rim", (1, 8, 17), 1800, 8)]:
        data = bpy.data.lights.new("LIGHT | " + name, "AREA")
        data.energy, data.shape, data.size = energy, "DISK", size
        obj = bpy.data.objects.new("LIGHT | " + name, data)
        studio.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((1, 0, 6)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.world.use_nodes = True
    background = next(node for node in scene.world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs["Color"].default_value = (.65, .7, .58, 1)
    background.inputs["Strength"].default_value = .45
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        pass
    scene.render.resolution_x, scene.render.resolution_y = 1440, 1440
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    # Ensure normals point out on every closed mesh, including buttress profiles.
    for obj in asset.objects:
        if obj.type != "MESH":
            continue
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    for cam, filename in [(hero, "tree-overview.png"), (detail, "root-detail.png")]:
        scene.camera = cam
        scene.render.filepath = str(PREVIEW / filename)
        bpy.ops.render.render(write_still=True)
    scene.camera = hero
    bpy.ops.object.select_all(action="DESELECT")
    anchor.select_set(True)
    bpy.context.view_layer.objects.active = anchor
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.shading.type = "MATERIAL"
                area.spaces.active.overlay.show_overlays = False
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "root_obstacle_tree.blend"), compress=True)
    meshes = [obj for obj in asset.objects if obj.type == "MESH"]
    summary = {"blend": str(OUTPUT / "root_obstacle_tree.blend"), "mesh_objects": len(meshes), "triangles": sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in meshes), "root_crest_m": .8, "main_root_reach_m": 9.2, "continuous_wood": wood.name, "game_integration": False}
    (PREVIEW / "manifest.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print("ROOT_TREE_RESULT " + json.dumps(summary))


if __name__ == "__main__":
    main()
