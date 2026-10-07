"""Author the trail obstacles (logs, stone barriers, river) inside the environment catalog.

Run inside the open catalog (live Blender) or headless:
  blender --background public/assets/models/blender/environment/environment_resource_catalog.blend --python tools/build_trail_obstacles_catalog.py

Adds section "04 Trail obstacles" below the plants, in the catalog's tile style. Re-running rebuilds the
section from scratch. Models are authored 1:1 in game units (Blender Z is up, ground at Z=0):
  - logs:      long axis X, lane-aligned lengths (2 lanes = 4.8, 3 lanes = 7.2)
  - rockfalls: one whole pile per hazard spanning its lanes (tools/trail_stone_hazards.py)
  - spores:    puffs built here (build_spore_puff) but shown in 05 Clouds (tools/build_clouds_catalog.py)
  - river:     runs along X, 2.6 deep along the travel axis Y, banks wobble so the edge is not a ruler line
Materials use the nature kit's names so the game's biome palette recolours them.
"""

import importlib.util
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(r"D:\Engineering Works\project-game")
LOG_SCRIPT = ROOT / "tools/build_trail_logs.py"

LANE_WIDTH = 2.4
RIVER_DEPTH = 2.6
SHOULDER = 1.5  # flat ground kept beside each bank so the river reads as a slab in the catalog
SLAB_BASE = -.56
ASSET_COLLECTION = "ASSETS | Trail obstacles"
DISPLAY_COLLECTION = "DISPLAY | Trail obstacles"

KIT = {
    "woodBark": "765033", "woodBarkDark": "493322", "woodBarkWarm": "805b3b", "woodInner": "d3a36b",
    "wood": "b9864a", "leafsGreen": "537d3f", "leafsDark": "2e5433", "colorTan": "e7c395",
    "colorRed": "fe6601", "colorWhite": "fff3e2", "stone": "b8b1a2", "stoneDark": "726b60",
    "dirt": "a98055", "dirtDark": "715338", "water": "5e9ea5", "grass": "63834a",
}
# Darker water for the channel centre; the game palette has no key for it, so the exporter maps it to `water`.
KIT["waterDeep"] = "3f7f89"
KIT["waterLight"] = "86c3c6"
# Extra stone tones so a rockfall is not one flat colour; the game palette carries the same keys.
KIT.update({"stoneMid": "958e80", "stoneWarm": "c6b498"})
# Spores. The game swaps `sporePuff` for its own translucent material and tints every puff instance, so its
# colour here is only for the catalog.
KIT.update({"sporePuff": "c9b2e0"})


def srgb_to_linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def material(name):
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    color = KIT[name]
    rgb = [srgb_to_linear(int(color[i:i + 2], 16) / 255) for i in (0, 2, 4)]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = .4 if name.startswith("water") else .95
    return mat


def mesh_object(name, bm, material_names):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for material_name in material_names:
        mesh.materials.append(material(material_name))
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    return obj


# --- rocks -----------------------------------------------------------------

def add_rock(bm, centre, size, seed, moss=0.0, slots=(0, 1, 2), detail=2):
    """Faceted boulder: jittered icosphere, flat base on Z=0. `slots` = material slots for stone, stoneDark, moss."""
    rng = random.Random(seed)
    verts = bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=1.0)["verts"]
    width, depth, height = size
    spin = rng.uniform(0, math.tau)
    cos, sin = math.cos(spin), math.sin(spin)
    for v in verts:
        jitter = rng.uniform(.82, 1.14)
        x, y, z = v.co.x * width / 2 * jitter, v.co.y * depth / 2 * jitter, v.co.z * height / 2 * jitter
        z = max(z, -height * .22)
        v.co = Vector((x * cos - y * sin, x * sin + y * cos, z))
    low = min(v.co.z for v in verts)
    for v in verts:
        v.co += Vector((centre[0], centre[1], -low + centre[2]))
    faces = {f for v in verts for f in v.link_faces}
    top = max(v.co.z for v in verts)
    for face in faces:
        mid = face.calc_center_median().z
        face.material_index = slots[1] if mid < centre[2] + height * .22 else slots[0]
        if moss and face.normal.z > .72 and mid > top - height * .45 and rng.random() < moss:
            face.material_index = slots[2]
    return verts


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


STONES = load_module("trail_stone_hazards", ROOT / "tools/trail_stone_hazards.py")
SPORES = load_module("spore_assets", ROOT / "tools/spore_assets.py")
# Seeds per (lanes, variant); shared with the exporter so the game ships what the catalog shows.
HAZARD_SEEDS = {(2, "A"): 121, (2, "B"): 122, (2, "C"): 123, (3, "A"): 134, (3, "B"): 135, (3, "C"): 136}
PUFF_SEEDS = {"A": 7, "B": 8, "C": 9}


def build_stone_hazard(lanes, variant):
    name = f"stone_hazard_{('two', 'three')[lanes - 2]}_lane_{variant}"
    return mesh_object(name, STONES.build_stone_hazard(lanes, variant, HAZARD_SEEDS[lanes, variant]), STONES.STONE_SLOTS)


def build_spore_puff(variant):
    obj = mesh_object(f"spore_puff_{variant}", SPORES.build_spore_puff(variant, PUFF_SEEDS[variant]), SPORES.PUFF_SLOTS)
    # Smooth normals: the game's mist shader fades each puff's silhouette by how squarely it faces the
    # camera, and flat normals would turn that fade into visible facets.
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


# --- river -----------------------------------------------------------------

def edge_wobble(x, side):
    return .11 * math.sin(x * .85 + side * 1.7) + .06 * math.sin(x * 2.1 + side * .4)


def add_strip(bm, rows, mat_index):
    """Quad strip from consecutive rows of vertices (rows[i][k] joins rows[i+1][k]); winding faces +Z."""
    cols = len(rows[0])
    made = [[bm.verts.new(p) for p in row] for row in rows]
    for i in range(len(made) - 1):
        for k in range(cols - 1):
            face = bm.faces.new((made[i][k], made[i + 1][k], made[i + 1][k + 1], made[i][k + 1]))
            face.material_index = mat_index(i, k)
            if face.normal.z < 0:
                face.normal_flip()


def add_blade(bm, base, lean, height, radius, material_index):
    """Tapered three-sided blade bending along `lean`."""
    rings = []
    for step, (frac, r) in enumerate(((0, radius), (.55, radius * .7), (1, radius * .12))):
        centre = base + Vector((lean.x * frac * frac, lean.y * frac * frac, height * frac))
        ring = [bm.verts.new(centre + Vector((math.cos(a) * r, math.sin(a) * r, 0)))
                for a in (0, math.tau / 3, 2 * math.tau / 3)]
        rings.append(ring)
    for lower, upper in zip(rings, rings[1:]):
        for k in range(3):
            face = bm.faces.new((lower[k], lower[(k + 1) % 3], upper[(k + 1) % 3], upper[k]))
            face.material_index = material_index
    return rings


def add_cattail(bm, top, radius=.05, length=.24):
    ring = [bm.verts.new(top + Vector((math.cos(a) * radius, math.sin(a) * radius, 0))) for a in
            [math.tau * i / 5 for i in range(5)]]
    cap = [bm.verts.new(top + Vector((math.cos(a) * radius, math.sin(a) * radius, length))) for a in
           [math.tau * i / 5 for i in range(5)]]
    for k in range(5):
        bm.faces.new((ring[k], ring[(k + 1) % 5], cap[(k + 1) % 5], cap[k])).material_index = 6
    tip = bm.verts.new(top + Vector((0, 0, length + .07)))
    for k in range(5):
        bm.faces.new((cap[k], cap[(k + 1) % 5], tip)).material_index = 6


def add_reeds(bm, x, y, side, rng):
    outward = Vector((0, side, 0))
    for _ in range(rng.randint(4, 6)):
        base = Vector((x + rng.uniform(-.18, .18), y + rng.uniform(-.1, .1), -.02))
        lean = outward * rng.uniform(.05, .3) + Vector((rng.uniform(-.2, .2), 0, 0))
        height = rng.uniform(.75, 1.25)
        rings = add_blade(bm, base, lean, height, .028, 2)
        if rng.random() < .35:
            tip = rings[1][0].co.copy()
            add_cattail(bm, tip + Vector((0, 0, height * .12)))


def add_tuft(bm, x, y, rng):
    for _ in range(3):
        base = Vector((x + rng.uniform(-.08, .08), y + rng.uniform(-.08, .08), 0))
        lean = Vector((rng.uniform(-.14, .14), rng.uniform(-.14, .14), 0))
        add_blade(bm, base, lean, rng.uniform(.22, .36), .035, 2)


def add_lily_pad(bm, x, y, radius, z):
    centre = bm.verts.new((x, y, z))
    ring = [bm.verts.new((x + math.cos(a) * radius, y + math.sin(a) * radius, z))
            for a in [math.tau * i / 8 + .3 for i in range(8)]]
    for k in range(8):
        # Notch one wedge so it reads as a pad, not a coin.
        if k == 0:
            continue
        bm.faces.new((centre, ring[k], ring[(k + 1) % 8])).material_index = 2



PROFILE_PATH = ROOT / "tools/data/valley_profile.json"
RIVER_SLOTS = ["dirt", "dirtDark", "leafsGreen", "water", "waterDeep", "colorWhite", "woodBark", "stone", "stoneDark", "waterLight"]
MUD, SOIL, REED, WATER, DEEP, FOAM, BARK, STONE, STONE_DARK, SHALLOW = range(10)
PREVIEW_BASE = -.7


def load_profile():
    import json
    return json.loads(PROFILE_PATH.read_text(encoding="utf-8"))


def profile_sampler(profile, column):
    """Linear lookup of the game's valley profile (column 1 = ground, 2 = ground shifted by the trail-edge reach)."""
    table = profile["samples"]

    def at(x):
        d = abs(x)
        for (x0, *v0), (x1, *v1) in zip(table, table[1:]):
            if d <= x1:
                t = 0 if x1 == x0 else (d - x0) / (x1 - x0)
                return v0[column - 1] + (v1[column - 1] - v0[column - 1]) * t
        return table[-1][column]
    return at


def build_river_production(name, half_width=512.0, preview=False, seed=11):
    """The game's river: a channel cut into the road that follows the real valley profile.

    The game discards terrain within +-riverRadius of a river's z, so the walls sit exactly there and the
    water fills the hole. Everything outside that band is scenery. Materials: see RIVER_SLOTS.
    Blender Y is the travel axis (glTF -Z); the river is centred on Y=0 and symmetric.
    """
    profile = load_profile()
    R = profile["riverRadius"]
    ground, ground_edge = profile_sampler(profile, 1), profile_sampler(profile, 2)
    positive = [row[0] for row in profile["samples"] if row[0] <= half_width]
    if positive[-1] < half_width:
        positive.append(half_width)
    xs = [-x for x in reversed(positive[1:])] + positive
    rng = random.Random(seed)
    bm = bmesh.new()

    # Water. Beyond the visible stretch it is a plain three-band strip; within it, a faceted surface:
    # vertices jitter a little (flat shading turns that into ripples), a meandering deep channel grades
    # through mid water to pale shallows at the banks, and thin pale streaks run with the current.
    near_limit = min(24.0, half_width)
    far = [x for x in xs if abs(x) >= near_limit]
    left_far = [x for x in far if x < 0] + ([-near_limit] if far else [])
    right_far = ([near_limit] if far else []) + [x for x in far if x > 0]
    for run in (left_far, right_far):
        if len(run) > 1:
            rows = [[(x, -R, ground(x) - .035), (x, -R * .42, ground(x) - .035), (x, R * .42, ground(x) - .035),
                     (x, R, ground(x) - .035)] for x in run]
            add_strip(bm, rows, lambda i, k: DEEP if k == 1 else WATER)
    # Low-poly surface: five coarse bands whose inner edges meander, so the channel reads as a few big facets.
    columns = [-1, -.6, -.2, .2, .6, 1]
    grid_x = [i * 1.5 for i in range(-16, 17) if abs(i * 1.5) <= near_limit]
    if grid_x[-1] < near_limit:
        grid_x.append(near_limit)
    rows = []
    for gi, x in enumerate(grid_x):
        row = []
        for ci, c in enumerate(columns):
            shift = 0.0 if ci in (0, len(columns) - 1) else .16 * math.sin(x * .55 + ci * 1.4)
            row.append((x, c * R + shift, ground(x) - .035))
        rows.append(row)
    add_strip(bm, rows, lambda i, k: (SHALLOW, WATER, DEEP, WATER, SHALLOW)[k])

    # Vertical banks at the terrain cut. The cut itself is a straight line (the game's terrain mask), so the
    # visible edge is a wobbling mud lip laid over it: it overhangs the water by a varying amount.
    def overhang(x, side):
        return max(.04, .17 + .1 * math.sin(x * .9 + side * 1.3) + .07 * math.sin(x * 2.3 + side * .5)
                   + .04 * math.sin(x * 5.1 + side))

    def outer(x, side):
        return R + .45 + .2 * math.sin(x * .7 + side * 2.1) + .12 * math.sin(x * 1.9 + side) + .06 * math.sin(x * 4.3)

    limit = min(24.0, half_width)
    fine = [i * .6 for i in range(-40, 41) if abs(i * .6) <= limit]   # coarse 0.6 spacing: angular low-poly curves
    for side in (-1, 1):
        wall = [[(x, side * R, ground_edge(x) + .015), (x, side * R, ground(x) - .7)] for x in xs]
        add_strip(bm, wall, lambda i, k: SOIL)
        lip = [[(x, side * outer(x, side), ground(x) + .02),
                (x, side * (R + (outer(x, side) - R) * .35 - overhang(x, side) * .2), ground(x) + .02),
                (x, side * (R - overhang(x, side)), ground(x) + .02)] for x in fine]
        add_strip(bm, lip, lambda i, k: SOIL)
        # Shadowed underside of the lip, so the edge has thickness over the water.
        fascia = [[(x, side * (R - overhang(x, side)), ground(x) + .02), (x, side * (R - overhang(x, side)), ground(x) - .04)]
                  for x in fine]
        add_strip(bm, fascia, lambda i, k: SOIL)
        # Foam: tapering patches that follow the curved lip. Width comes from overlapping waves, so it swells and
        # pinches to nothing instead of ending in square cuts.
        phase = side * 1.7
        widths = []
        for x in fine:
            wave = math.sin(x * 1.9 + phase) + .7 * math.sin(x * 4.1 + phase * 2) + .35 * math.sin(x * 8.3 + phase)
            widths.append(max(0.0, wave - .55) * .16)
        for j in range(len(fine) - 1):
            if widths[j] <= 0 and widths[j + 1] <= 0:
                continue
            x0, x1 = fine[j], fine[j + 1]
            e0, e1 = R - overhang(x0, side), R - overhang(x1, side)
            quad = [(x0, side * e0, ground(x0) - .03), (x1, side * e1, ground(x1) - .03),
                    (x1, side * (e1 - widths[j + 1]), ground(x1) - .03), (x0, side * (e0 - widths[j]), ground(x0) - .03)]
            face = bm.faces.new([bm.verts.new(q) for q in quad])
            face.material_index = FOAM
            if face.normal.z < 0:
                face.normal_flip()

    # Scenery: a few reed clumps and tufts on the mud, pads on the water, two settled rocks per bank.
    for side in (-1, 1):
        for x in sorted(rng.sample(range(-8, 9), 4)):
            x += rng.uniform(-.4, .4)
            start = len(bm.verts)
            add_reeds(bm, x, side * (R + .25), side, rng)
            for v in list(bm.verts)[start:]:
                v.co.z += ground(x) + .02
        for _ in range(7):
            x = rng.uniform(-9, 9)
            start = len(bm.verts)
            add_tuft(bm, x, side * (R + rng.uniform(.3, .6)), rng)
            for v in list(bm.verts)[start:]:
                v.co.z += ground(x) + .02
    for x, y, r in ((-3.2, .55, .27), (-2.7, .38, .2), (4.3, -.62, .26), (4.7, -.5, .19), (1.2, .7, .22)):
        add_lily_pad(bm, x, y, r, ground(x) - .025)
    for side, picks in ((-1, ((-4.6, .85, .5), (3.4, .6, .3))), (1, ((5.2, .8, .45), (-2.6, .6, .28)))):
        for index, (x, w, h) in enumerate(picks):
            add_rock(bm, (x, side * (R + .85), ground(x)), (w, w * .85, h),
                     seed * 17 + index + (5 if side > 0 else 0), slots=(STONE, STONE_DARK, REED))

    if preview:
        # Catalog cut-away only (never exported): ground either side, a floor and closed ends.
        for side in (-1, 1):
            rows = [[(x, side * (R + .03), ground(x)), (x, side * (R + 2.4), ground(x))] for x in xs]
            add_strip(bm, rows, lambda i, k: MUD)
        floor = [[(x, -R, ground(x) - .7), (x, R, ground(x) - .7)] for x in xs]
        add_strip(bm, floor, lambda i, k: SOIL)
        for x in (xs[0], xs[-1]):
            outline = [(x, -(R + 2.4), ground(x)), (x, -R, ground_edge(x) + .015), (x, -R, ground(x) - .7),
                       (x, R, ground(x) - .7), (x, R, ground_edge(x) + .015), (x, R + 2.4, ground(x)),
                       (x, R + 2.4, PREVIEW_BASE), (x, -(R + 2.4), PREVIEW_BASE)]
            bm.faces.new([bm.verts.new(q) for q in outline]).material_index = SOIL
        for side in (-1, 1):
            wall = [[(x, side * (R + 2.4), ground(x)), (x, side * (R + 2.4), PREVIEW_BASE)] for x in xs]
            add_strip(bm, wall, lambda i, k: SOIL)
    return mesh_object(name, bm, RIVER_SLOTS)


# --- log variants -------------------------------------------------------------

MOSS, MUSH_STEM, MUSH_CAP = 5, 6, 7


def append_mesh(bm, mesh, matrix, drop_materials=(), remap=None):
    """Copy `mesh` into `bm` through `matrix`, skipping faces whose material is in `drop_materials`."""
    remap = remap or {}
    kept = [p for p in mesh.polygons if p.material_index not in drop_materials]
    made = {}
    for polygon in kept:
        for i in polygon.vertices:
            if i not in made:
                made[i] = bm.verts.new(matrix @ mesh.vertices[i].co)
        face = bm.faces.new([made[i] for i in polygon.vertices])
        face.material_index = remap.get(polygon.material_index, polygon.material_index)


def build_stump(radius=.42, height=.5):
    """Cut stump: bark sides, pale growth-ring top. Slots follow the log slot order."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=11, radius1=radius * 1.08,
                          radius2=radius, depth=height)
    for v in bm.verts:
        v.co.z += height / 2
        v.co.x *= 1 + .06 * math.sin(v.co.y * 13)
    for face in bm.faces:
        face.material_index = 3 if face.normal.z > .9 else (1 if face.calc_center_median().z < height * .25 else 0)
    # Inner ring: a slightly smaller darker disc of the same cut face.
    top = next(f for f in bm.faces if f.normal.z > .9)
    inset = bmesh.ops.inset_region(bm, faces=[top], thickness=radius * .38, depth=-.012)
    for face in inset["faces"]:
        face.material_index = 4
    mesh = bpy.data.meshes.new("stump_tmp")
    bm.to_mesh(mesh)
    bm.free()
    return mesh


LOG_VARIANTS = {
    # name: (main yaw deg, main pitch deg, mushrooms, [(kind, x as fraction of length, y, yaw deg, scale)])
    "A": (5, 0, False, [("log", .27, -1.05, 26, .45), ("log", -.30, 1.0, -12, .34)]),
    "B": (-6, 1.5, False, [("stump", -.33, 1.05, 0, 1.0), ("stump", .36, -1.0, 0, .7)]),
    "C": (3, 0, True, [("log", .30, 1.0, -20, .42), ("log", .36, 1.28, 8, .3), ("stump", -.34, -1.0, 0, .8)]),
}


def build_log_variant(log_module, scene, name, length, variant):
    yaw, pitch, mushrooms, extras = LOG_VARIANTS[variant]
    materials = [material(n) for n in ("woodBark", "woodBarkDark", "woodBarkWarm", "woodInner", "wood",
                                       "leafsGreen", "colorTan", "colorRed")]
    bm = bmesh.new()
    drop = () if mushrooms else (MUSH_STEM, MUSH_CAP)
    main = log_module.build_log(scene, name + "_main", length, materials)
    transform = Matrix.Rotation(math.radians(yaw), 4, "Z") @ Matrix.Rotation(math.radians(pitch), 4, "Y")
    # Moss is dropped (kept as bark) per request; mushrooms only where the variant asks for them.
    append_mesh(bm, main.data, transform, drop, {MOSS: 0})
    for kind, fx, y, extra_yaw, scale in extras:
        place = Matrix.Translation((fx * length, y, 0)) @ Matrix.Rotation(math.radians(extra_yaw), 4, "Z")
        if kind == "log":
            piece = log_module.build_log(scene, name + "_piece", 3.4, materials)
            append_mesh(bm, piece.data, place @ Matrix.Diagonal((scale, scale, scale, 1)), (MUSH_STEM, MUSH_CAP), {MOSS: 0})
            piece_mesh = piece.data
            bpy.data.objects.remove(piece, do_unlink=True)
            bpy.data.meshes.remove(piece_mesh)
        else:
            stump = build_stump()
            append_mesh(bm, stump, place @ Matrix.Diagonal((scale, scale, scale, 1)))
            bpy.data.meshes.remove(stump)
    main_mesh = main.data
    bpy.data.objects.remove(main, do_unlink=True)
    bpy.data.meshes.remove(main_mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return mesh_object(name, bm, ["woodBark", "woodBarkDark", "woodBarkWarm", "woodInner", "wood",
                                  "leafsGreen", "colorTan", "colorRed"])



# --- catalog layout ---------------------------------------------------------

def load_log_module():
    return load_module("build_trail_logs", LOG_SCRIPT)


def clear_section():
    for name in (ASSET_COLLECTION, DISPLAY_COLLECTION):
        collection = bpy.data.collections.get(name)
        if not collection:
            continue
        for obj in list(collection.objects):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and data.users == 0:
                pool = {bpy.types.Mesh: bpy.data.meshes, bpy.types.Camera: bpy.data.cameras,
                        bpy.types.TextCurve: bpy.data.curves}.get(type(data))
                if pool is not None:
                    pool.remove(data)
        bpy.data.collections.remove(collection)


def new_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def triangle_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def copy_object(source, name, collection, location, data_copy=False):
    obj = source.copy()
    if data_copy and source.data:
        obj.data = source.data.copy()
    obj.name = name
    obj.location = location
    collection.objects.link(obj)
    return obj


def shift_floor(extra):
    floor = bpy.data.objects["display floor"]
    if floor.get("trail_obstacles_extra"):
        extra -= floor["trail_obstacles_extra"]
    floor.dimensions = (floor.dimensions.x, floor.dimensions.y + extra, floor.dimensions.z)
    floor.location.y -= extra / 2
    floor["trail_obstacles_extra"] = (floor.get("trail_obstacles_extra") or 0) + extra


def place_asset(obj, name, centre, tile_size, assets, display, tile_source, label_source, tri_source, base=0.0):
    anchor = bpy.data.objects.new(name + ".anchor", None)
    anchor.empty_display_type = "PLAIN_AXES"
    anchor.empty_display_size = .3
    anchor.location = (centre[0], centre[1], -.04 - base)
    anchor["obstacle_asset"] = name
    assets.objects.link(anchor)
    assets.objects.link(obj)
    obj.parent = anchor
    obj.location = (0, 0, 0)
    tile = copy_object(tile_source, "display tile | " + name, display, (centre[0], centre[1], -.14))
    tile.scale = (tile_size[0] / tile_source.dimensions.x, tile_size[1] / tile_source.dimensions.y, 1)
    left = centre[0] - tile_size[0] / 2 + .22
    bottom = centre[1] - tile_size[1] / 2
    label = copy_object(label_source, "label | " + name, display, (left, bottom + .335, .04), data_copy=True)
    label.data.body = name
    tris = copy_object(tri_source, "triangles | " + name, display, (left, bottom + .055, .04), data_copy=True)
    tris.data.body = f"{triangle_count(obj)} tris"
    return anchor


def main():
    scene = bpy.context.scene
    clear_section()
    tile_source = bpy.data.objects["display tile | flower_purpleB"]
    label_source = bpy.data.objects["label | flower_purpleB"]
    tri_source = bpy.data.objects["triangles | flower_purpleB"]
    title_source = bpy.data.objects["03 Plants and details"]

    assets, display = new_collection(ASSET_COLLECTION), new_collection(DISPLAY_COLLECTION)
    shift_floor(22.0)

    log_module = load_log_module()
    entries = []
    for row, (lane_name, length, tile_w, xs) in enumerate((
            ("log_two_lane", 4.8, 6.6, (-11.2, -4.4, 2.4)),
            ("log_three_lane", 7.2, 9.0, (-10.0, -0.8, 8.4)))):
        for variant, x in zip("ABC", xs):
            name = f"{lane_name}_{variant}"
            obj = build_log_variant(log_module, scene, name, length, variant)
            entries.append((obj, name, (x, 8.4 - row * 4.4), (tile_w, 3.8)))

    # Spore puffs live in section 05 Clouds (tools/build_clouds_catalog.py).
    for variant in "ABC":
        obj = build_stone_hazard(2, variant)
        entries.append((obj, obj.name, (-11.4 + "ABC".index(variant) * 6.6, -.6), (6.0, 3.2)))
    for variant in "ABC":
        obj = build_stone_hazard(3, variant)
        entries.append((obj, obj.name, (-10.0 + "ABC".index(variant) * 9.4, -4.6), (8.6, 3.2)))
    entries.append((build_river_production("river_crossing", 9.0, preview=True), "river_crossing", (-5.6, -11.2), (19.6, 8.2)))

    for obj, name, centre, tile in entries:
        place_asset(obj, name, centre, tile, assets, display, tile_source, label_source, tri_source,
                    base=PREVIEW_BASE if name == "river_crossing" else 0.0)

    title = copy_object(title_source, "04 Trail obstacles", display, (title_source.location.x, 11.6, title_source.location.z),
                        data_copy=True)
    title.data.body = "04  TRAIL OBSTACLES / LOGS, ROCKFALLS, RIVER"

    camera_source = bpy.data.objects["CAMERA | Plants and details"]
    camera = copy_object(camera_source, "CAMERA | Trail obstacles", display,
                         (camera_source.location.x, camera_source.location.y - 29, camera_source.location.z), data_copy=True)
    print("TRAIL_OBSTACLES", [(name, triangle_count(obj)) for obj, name, *_ in entries])


if __name__ != "trail_obstacles_import":
    main()
