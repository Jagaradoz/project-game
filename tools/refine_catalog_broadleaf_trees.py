"""Refine four catalog trees in place; call main() in the open catalog scene.

Uses Root Oak's geometry vocabulary and existing materials. Never imports GLBs,
saves files, or invokes the Root Oak builder's standalone main().
"""

import importlib.util
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


STEMS = ("tree_oak", "tree_plateau", "tree_simple", "tree_thin")
BARK = ("ochre", "warm", "shade", "ridge")
LEAVES = ("forest", "deep", "sun", "middle")
HEIGHT = 2.8
WIDTH_CAP = 3.4


def builder():
    path = Path(__file__).with_name("build_root_obstacle_tree.py")
    spec = importlib.util.spec_from_file_location("catalog_root_oak_geometry", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def descendants(anchor):
    pending, result = list(anchor.children), []
    while pending:
        obj = pending.pop()
        result.append(obj)
        pending.extend(obj.children)
    return result


def triangles(objects):
    return sum(len(face.vertices) - 2 for obj in objects if obj.type == "MESH"
               for face in obj.data.polygons)


def recalculate(mesh):
    topology = bmesh.new()
    topology.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(topology, faces=list(topology.faces))
    topology.to_mesh(mesh)
    topology.free()
    mesh.update()


def fuse(parts, anchor, bark, stem):
    """A bounded union keeps major bough junctions continuous and solid."""
    bpy.ops.object.select_all(action="DESELECT")
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    wood = bpy.context.object
    wood.name = stem + " | continuous branched wood"
    union = wood.modifiers.new("Joined buttress and branch skin", "REMESH")
    union.mode = "VOXEL"
    union.voxel_size = .024
    union.use_smooth_shade = False
    bpy.ops.object.modifier_apply(modifier=union.name)
    soften = wood.modifiers.new("Soft branch junctions", "SMOOTH")
    soften.factor, soften.iterations = .45, 2
    bpy.ops.object.modifier_apply(modifier=soften.name)
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
    assert components, "Empty wood union: " + stem
    largest = max(components, key=len)
    fragments = [v for component in components if component is not largest for v in component]
    if fragments:
        bmesh.ops.delete(topology, geom=fragments, context="VERTS")
    topology.to_mesh(wood.data)
    topology.free()
    wood.data.update()
    reduction = wood.modifiers.new("Broad wood facets", "DECIMATE")
    reduction.ratio = min(1, 1450 / max(1, triangles([wood])))
    bpy.ops.object.modifier_apply(modifier=reduction.name)
    wood.data.materials.clear()
    for mat in bark:
        wood.data.materials.append(mat)
    recalculate(wood.data)
    for face in wood.data.polygons:
        p = face.center
        grain = math.sin(math.atan2(p.y, p.x) * 7 + p.z * .3)
        face.material_index = 2 if grain < -.72 else 1 if grain > .8 else 0
        face.use_smooth = False
    wood.parent = anchor
    wood["role"] = "continuous trunk, connected boughs and short buttress roots"
    return wood


def details(root, wood, bark, coll, anchor, stem):
    """Small reliefs sampled directly from the fused trunk avoid floating bark."""
    for index in range(8):
        angle = index * 2.399
        direction = Vector((math.cos(angle), math.sin(angle), 0))
        center_z = .24 + (index % 5) * .16
        points = []
        for dz in (-.1, -.04, .04, .1):
            hit, point, normal, _ = wood.ray_cast(direction * 2 + Vector((0, 0, center_z + dz)), -direction)
            if hit:
                points.append(tuple(point + normal * .003))
        if len(points) == 4:
            root.tube(stem + " | bark ridge %02d" % index, points,
                      [.002, .009, .007, .002], [bark[index % 3]], coll, anchor, sides=5)
    hit, center, normal, _ = wood.ray_cast(Vector((0, -2, .61)), Vector((0, 1, 0)))
    if hit:
        across = normal.cross(Vector((0, 0, 1))).normalized()
        up = across.cross(normal).normalized()
        vertices, faces = [], []
        for factor, depth in ((1, .002), (.7, .009), (.35, .003)):
            for index in range(12):
                angle = index * math.tau / 12
                vertices.append(tuple(center + normal * depth + across * (.041 * math.cos(angle) * factor)
                                      + up * (.068 * math.sin(angle) * factor)))
        for ring in range(2):
            for index in range(12):
                a, b = ring * 12 + index, ring * 12 + (index + 1) % 12
                faces.append((a, b, b + 12, a + 12))
        faces.extend((tuple(reversed(range(12))), tuple(range(24, 36))))
        root.mesh_object(stem + " | weathered knot", vertices, faces, [bark[2], bark[0]], coll, anchor)


def design(stem):
    """Authored primary crowns: round, flat, upright and separated respectively."""
    if stem == "tree_oak":
        trunk = [(0, 0, -.04), (-.04, .01, .5), (.035, -.02, 1.05), (.02, .04, 1.62), (.1, .03, 2.22)]
        crowns = [((x, y, z), scale) for x, y, z, scale in [
            (0, .03, 2.29, (.7, .63, .57)), (-.58, .06, 2.03, (.62, .55, .48)),
            (.58, .08, 2.11, (.63, .54, .5)), (-.1, .55, 2.13, (.61, .54, .49)),
            (-.02, -.55, 2.08, (.63, .52, .48)), (-.57, -.46, 1.91, (.48, .44, .38)),
            (.55, -.43, 1.94, (.48, .44, .39)), (.53, .48, 2.06, (.5, .44, .41)),
            (-.54, .48, 2.01, (.49, .44, .4)), (.27, -.18, 2.43, (.48, .46, .42)),
            (-.29, -.2, 2.36, (.51, .43, .42)), (.08, .34, 2.4, (.52, .44, .43)),
            (-.86, -.08, 1.82, (.4, .37, .33)), (.88, -.03, 1.94, (.4, .36, .34))]]
        spread = 1.01
    elif stem == "tree_plateau":
        trunk = [(0, 0, -.04), (.02, .01, .54), (.13, .01, 1.11), (.14, .06, 1.68), (.03, .08, 2.08)]
        crowns = [((x, y, z), scale) for x, y, z, scale in [
            (-1.02, .03, 2.21, (.6, .48, .31)), (-.51, -.05, 2.31, (.64, .53, .33)),
            (.12, .05, 2.35, (.68, .55, .35)), (.73, .08, 2.25, (.63, .52, .32)),
            (1.05, .18, 2.2, (.46, .44, .29)), (-.78, .46, 2.22, (.56, .43, .31)),
            (-.15, .56, 2.29, (.63, .43, .32)), (.55, .49, 2.22, (.58, .45, .3)),
            (-.76, -.45, 2.15, (.55, .44, .29)), (-.09, -.51, 2.24, (.6, .43, .32)),
            (.61, -.43, 2.16, (.59, .44, .29)), (-.47, .13, 2.43, (.57, .42, .27)),
            (.42, .11, 2.43, (.58, .43, .27)), (-.75, -.1, 1.15, (.37, .33, .27)),
            (-1.02, -.06, 1.25, (.29, .28, .22))]]
        spread = 1.12
    elif stem == "tree_simple":
        trunk = [(0, 0, -.04), (-.035, .02, .55), (.03, 0, 1.12), (.01, .015, 1.75), (.055, .03, 2.38)]
        crowns = [((x, y, z), scale) for x, y, z, scale in [
            (.02, .02, 2.41, (.41, .4, .54)), (-.3, .01, 2.16, (.39, .38, .48)),
            (.32, .06, 2.1, (.38, .38, .46)), (-.01, .33, 2.15, (.38, .34, .49)),
            (.02, -.32, 2.08, (.39, .35, .46)), (-.25, -.24, 1.84, (.36, .33, .39)),
            (.3, -.24, 1.78, (.36, .33, .39)), (.28, .26, 1.87, (.35, .34, .4)),
            (-.29, .28, 1.94, (.36, .34, .41)), (-.08, -.05, 1.66, (.45, .41, .42)),
            (-.35, .07, 1.51, (.32, .31, .31)), (.34, .07, 1.56, (.32, .3, .32)),
            (-.13, -.08, 2.53, (.32, .31, .4)), (.2, .12, 2.42, (.3, .29, .39))]]
        spread = .53
    else:
        trunk = [(0, 0, -.04), (.02, .01, .62), (-.04, .015, 1.22), (.025, .02, 1.88), (.09, .03, 2.46)]
        crowns = [((x, y, z), scale) for x, y, z, scale in [
            (.07, .03, 2.5, (.32, .29, .39)), (.31, .03, 2.39, (.27, .25, .3)),
            (-.42, .07, 2.07, (.34, .31, .3)), (-.67, .12, 1.94, (.29, .26, .27)),
            (.53, .01, 1.78, (.34, .31, .28)), (.76, .05, 1.7, (.28, .26, .25)),
            (-.47, -.09, 1.28, (.3, .28, .25)), (-.69, -.03, 1.35, (.27, .24, .24)),
            (.22, .45, 2.18, (.3, .28, .29)), (.37, .61, 2.1, (.27, .24, .25)),
            (.24, -.45, 1.96, (.29, .26, .28)), (.4, -.56, 1.88, (.26, .24, .25))]]
        spread = .78
    return trunk, crowns, spread


def author(root, stem, anchor, coll, bark, leaves, seed):
    root.RNG = random.Random(seed)
    trunk, crowns, spread = design(stem)
    slim = stem == "tree_thin"
    radii = [.16, .139, .108, .075, .024] if slim else [.23, .18, .137, .096, .032]
    parts = [root.tube(stem + " | trunk", trunk, radii, bark, coll, anchor, sides=18)]
    for index in range(6):
        angle = index * math.tau / 6 + .24
        length = (.47 if slim else .61) + .055 * math.sin(index * 1.7)
        path = [(0, 0, 0)] + [(math.cos(angle + frac * .13) * length * frac,
                                        math.sin(angle + frac * .13) * length * frac, 0)
                                       for frac in (.3, .67, 1)]
        parts.append(root.root_mesh(stem + " | short root %02d" % index, path,
                                    [.13, .105, .065, .015], [.26, .14, .055, .008], bark, coll, anchor))
    for index, (position, scale) in enumerate(crowns):
        end = Vector(position)
        if math.hypot(end.x, end.y) < .23:
            continue
        # Low plateau shoot and thin tree tiers attach directly to the trunk.
        start_z = max(.62, min(1.8, end.z - (.46 if slim else .65)))
        start = Vector((.02, .015, start_z))
        middle = start.lerp(end, .53)
        middle.z -= .045
        radius = .061 if slim else .088
        parts.append(root.tube(stem + " | bough %02d" % index,
                               [tuple(start), tuple(middle), tuple(end)],
                               [radius, radius * .67, .017], bark, coll, anchor, sides=10))
        fork = end + Vector((scale[0] * .32, -scale[1] * .22, scale[2] * .38))
        parts.append(root.tube(stem + " | fork %02d" % index,
                               [tuple(middle), tuple(end), tuple(fork)],
                               [radius * .46, .023, .008], bark, coll, anchor, sides=7))
    wood = fuse(parts, anchor, bark, stem)
    details(root, wood, bark, coll, anchor, stem)
    for index, (position, scale) in enumerate(crowns):
        obj = root.foliage(position, scale, index, coll, anchor, leaves)
        obj.name = stem + " | layered crown %02d" % index
    for index in range(16):
        if slim:
            position, scale = crowns[index % len(crowns)]
            angle = index * 2.399
            pos = (position[0] + math.cos(angle) * scale[0] * .73,
                   position[1] + math.sin(angle) * scale[1] * .73,
                   position[2] + .1 * math.sin(index * 1.3))
            size = .13 + .035 * math.sin(index * 1.9) ** 2
        else:
            angle = index * 2.399
            z = 2.22 + .12 * math.sin(angle * 2) if stem == "tree_plateau" else 1.91 + .21 * math.sin(angle * 2)
            if stem == "tree_simple":
                z = 1.66 + .69 * (index % 5) / 4
            pos = (math.cos(angle) * spread, math.sin(angle) * spread * .7, z)
            size = .19 + .045 * math.sin(index * 1.9) ** 2
        obj = root.foliage(pos, (size * 1.3, size, size * .82), index + 40, coll, anchor, leaves, small=True)
        obj.name = stem + " | scalloped leaf spray %02d" % index


def fit(objects, tile):
    bpy.context.view_layer.update()
    matrices = {obj: obj.matrix_world.copy() for obj in objects}
    points = [matrices[obj] @ vertex.co for obj in objects for vertex in obj.data.vertices]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    factor = HEIGHT / (high.z - low.z)
    horizontal = min(factor, WIDTH_CAP / max(high.x - low.x, high.y - low.y))
    center = (low + high) / 2
    target = tile.matrix_world.translation + Vector((0, .25, 0))
    for obj in objects:
        for vertex in obj.data.vertices:
            p = matrices[obj] @ vertex.co
            vertex.co = ((p.x - center.x) * horizontal + target.x,
                         (p.y - center.y) * horizontal + target.y, (p.z - low.z) * factor)
        obj.matrix_world = Matrix.Identity(4)
        recalculate(obj.data)
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ v.co for obj in objects for v in obj.data.vertices]
    bounds = [max(p[i] for p in points) - min(p[i] for p in points) for i in range(3)]
    assert abs(bounds[2] - HEIGHT) < 1e-4, bounds
    assert max(bounds[:2]) <= WIDTH_CAP + 1e-4, bounds
    assert abs(min(p.z for p in points)) < 1e-4, "Tree base is not grounded"
    return bounds


def remove_objects(objects):
    for obj in reversed(objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def airy_foliage(objects, stem):
    """Open space between rounded tufts without changing any wood geometry."""
    retained = {
        "tree_oak": {0, 1, 2, 3, 4, 5, 7, 9, 12},
        "tree_plateau": {0, 1, 2, 3, 5, 7, 8, 10, 13, 14},
        "tree_simple": {0, 1, 2, 3, 5, 7, 8, 10, 12},
        "tree_thin": {0, 2, 4, 6, 8, 10},
    }
    crowns = [obj for obj in objects if " | layered crown " in obj.name]
    if crowns and all(obj.get("airy_canopy") for obj in crowns):
        return list(objects)
    assert crowns, "No authored crown clusters for " + stem
    bpy.context.view_layer.update()
    original = [obj.matrix_world @ v.co for obj in crowns for v in obj.data.vertices]
    low = Vector(tuple(min(p[i] for p in original) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in original) for i in range(3)))
    canopy_center = (low + high) / 2
    removed = []
    for obj in objects:
        if " | scalloped leaf spray " in obj.name:
            removed.append(obj)
        elif " | layered crown " in obj.name:
            index = int(obj.name.split(" | layered crown ")[1].split(".")[0])
            if index not in retained[stem]:
                removed.append(obj)
                continue
            points = [obj.matrix_world @ v.co for v in obj.data.vertices]
            center = Vector(tuple((min(p[i] for p in points) + max(p[i] for p in points)) / 2
                                  for i in range(3)))
            puff_center = canopy_center + Vector(((center.x - canopy_center.x) * 1.12,
                                                  (center.y - canopy_center.y) * 1.12,
                                                  (center.z - canopy_center.z) * 1.10))
            inverse = obj.matrix_world.inverted()
            for vertex, point in zip(obj.data.vertices, points):
                offset = point - center
                vertex.co = inverse @ (puff_center + Vector((offset.x * .9, offset.y * .9,
                                                             offset.z * 1.12)))
            obj["airy_canopy"] = "separated rounded tufts v2"
    kept = [obj for obj in objects if obj not in removed]
    remove_objects(removed)
    # Keep the catalog height and canopy floor while opening horizontal gaps.
    crowns = [obj for obj in kept if " | layered crown " in obj.name]
    points = [obj.matrix_world @ v.co for obj in crowns for v in obj.data.vertices]
    new_low, new_high = min(p.z for p in points), max(p.z for p in points)
    for obj in crowns:
        inverse = obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            point.z = low.z + (point.z - new_low) * (high.z - low.z) / (new_high - new_low)
            vertex.co = inverse @ point
        obj.data.update()
    return kept


def refine_existing_foliage():
    summaries = []
    for stem in STEMS:
        anchor = next(obj for obj in bpy.context.scene.objects if obj.type == "EMPTY"
                      and obj.get("source_glb") == "nature/" + stem + ".glb")
        meshes = airy_foliage([obj for obj in descendants(anchor) if obj.type == "MESH"], stem)
        count = triangles(meshes)
        anchor["triangles"] = count
        anchor["authored_refinement"] = "Root Oak broadleaf craftsmanship v2 / airy foliage"
        bpy.data.objects["triangles | " + stem].data.body = f"{count:,} tris"
        summaries.append({"name": stem, "triangles": count,
                          "leaf_tufts": sum(" | layered crown " in obj.name for obj in meshes)})
    bpy.context.view_layer.update()
    print("AIRY_FOLIAGE " + json.dumps(summaries))
    return summaries


def main():
    root = builder()
    bark = [bpy.data.materials["Bark | " + name] for name in BARK]
    leaves = [bpy.data.materials["Leaf | " + name] for name in LEAVES]
    targets = {}
    for stem in STEMS:
        matches = [obj for obj in bpy.context.scene.objects if obj.type == "EMPTY"
                   and str(obj.get("source_glb", "")).replace("\\", "/") == "nature/" + stem + ".glb"]
        assert len(matches) == 1, (stem, [obj.name for obj in matches])
        assert matches[0].type == "EMPTY", "Expected an import anchor: " + stem
        targets[stem] = (matches[0], bpy.data.objects["display tile | " + stem],
                         bpy.data.objects["triangles | " + stem])
    assert len(targets) == 4
    assert all(label.type == "FONT" for _, _, label in targets.values())
    previous_selection = [obj.name for obj in bpy.context.selected_objects]
    previous_active = bpy.context.view_layer.objects.active
    previous_active_name = previous_active.name if previous_active else None
    staged, summaries = [], []
    try:
        # Validate every new asset before deleting any existing descendants.
        for index, stem in enumerate(STEMS):
            anchor, tile, label = targets[stem]
            old = descendants(anchor)
            coll = bpy.data.collections.new(stem + " | authored refinement")
            bpy.context.scene.collection.children.link(coll)
            staged.append((coll, anchor, old, label))
            author(root, stem, anchor, coll, bark, leaves, 146 + index * 37)
            meshes = [obj for obj in coll.objects if obj.type == "MESH"]
            bounds = fit(meshes, tile)
            meshes = airy_foliage(meshes, stem)
            count = triangles(meshes)
            assert 1800 <= count <= 10000, (stem, count)
            summaries.append({"name": stem, "triangles": count, "height": round(bounds[2], 4)})
        for (coll, anchor, old, label), summary in zip(staged, summaries):
            remove_objects(old)
            anchor["authored_refinement"] = "Root Oak broadleaf craftsmanship v2 / airy foliage"
            anchor["refinement_script"] = "tools/refine_catalog_broadleaf_trees.py"
            anchor["display_height"] = HEIGHT
            anchor["triangles"] = summary["triangles"]
            label.data.body = f"{summary['triangles']:,} tris"
            for obj in coll.objects:
                obj["original_source_glb"] = anchor["source_glb"]
                obj["authored_refinement"] = "cluster canopy; no individual leaf expansion"
    except Exception:
        for coll, _, _, _ in staged:
            remove_objects(list(coll.objects))
            bpy.data.collections.remove(coll)
        raise
    finally:
        bpy.ops.object.select_all(action="DESELECT")
        for name in previous_selection:
            obj = bpy.context.scene.objects.get(name)
            if obj:
                obj.select_set(True)
        if previous_active_name:
            bpy.context.view_layer.objects.active = bpy.context.scene.objects.get(previous_active_name)
    print("BROADLEAF_REFINEMENT " + json.dumps(summaries))
    return summaries


if __name__ == "__main__":
    main()
