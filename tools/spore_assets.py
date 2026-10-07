"""Poison spore cloud puffs.

Imported by tools/build_trail_obstacles_catalog.py (catalog) and tools/export_trail_obstacles.py (game GLBs).
Authored 1:1 in game units, Blender Z up, ground at Z=0.

  - spore_puff_{A,B,C}: one closed lumpy blob, radius ~1. The game instances it many times and tints each
    instance, so it carries a single neutral material (`sporePuff`) and no colour of its own.
"""

import random

import bmesh
from mathutils import Vector

PUFF_SLOTS = ["sporePuff"]

# Balls per variant as (x, y, z, radius): a big core with smaller billows round the top and sides, like cumulus.
PUFF_BALLS = {
    "A": [(0, 0, 0, 1.0), (.75, .1, .2, .72), (-.7, -.15, .1, .66), (.2, .3, .62, .62), (-.25, -.2, .55, .52)],
    "B": [(0, 0, 0, .9), (.85, 0, -.05, .6), (-.85, .1, -.05, .58), (.35, -.2, .5, .6), (-.35, .25, .48, .55),
          (0, 0, .85, .4)],
    "C": [(0, 0, 0, .95), (.6, -.25, .35, .7), (-.6, .25, .3, .62), (0, .5, -.05, .55)],
}
PUFF_RESOLUTION = .3  # metaball cell size; coarse on purpose so the billows come out as big facets


def build_spore_puff(variant, seed):
    """Metaball cumulus, polygonised coarsely and flattened underneath. Returns a bmesh, radius ~1."""
    import bpy
    rng = random.Random(seed)
    data = bpy.data.metaballs.new(f"spore_puff_{variant}_tmp")
    data.resolution = data.render_resolution = PUFF_RESOLUTION
    data.threshold = .6
    for x, y, z, r in PUFF_BALLS[variant]:
        ball = data.elements.new()
        ball.co = (x + rng.uniform(-.08, .08), y + rng.uniform(-.08, .08), z)
        ball.radius = r * 1.2
    obj = bpy.data.objects.new(data.name, data)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated)
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.metaballs.remove(data)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bpy.data.meshes.remove(mesh)
    bmesh.ops.dissolve_limit(bm, angle_limit=.09, verts=bm.verts[:], edges=bm.edges[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    centre = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
    for v in bm.verts:
        v.co -= centre
        if v.co.z < -.3:
            v.co.z = -.3 + (v.co.z + .3) * .4
    # Normalise to radius ~1 so the game's size range means the same thing for every variant.
    reach = max(v.co.length for v in bm.verts)
    for v in bm.verts:
        v.co /= reach
    return bm
