"""Natural rockfall hazards for the trail, built whole per hazard (never from repeated lane modules).

Imported by tools/build_trail_obstacles_catalog.py (catalog) and tools/export_trail_obstacles.py (game GLBs).
Authored 1:1 in game units, Blender Z up, ground at Z=0, long axis X, travel axis Y.

Why it looks natural rather than tiled:
  - every rock is the convex hull of random points, so it has a few large flat fractures instead of
    an icosphere's even facets; archetypes (boulder, slab, shard, chunk) give different silhouettes
  - one height profile per hazard (one or two crests, never one per lane) sets rock sizes, so the
    pile has a dominant mass and tapers to rubble at the ends
  - rocks overlap, sink into the ground and tilt; a rubble skirt spills forward and back
  - each rock takes its own tone; undersides go dark and some tops carry moss
The height stays under `MAX_HEIGHT` so the jump (clearance 1.2) never reads as clipping.
"""

import math
import random

import bmesh
from mathutils import Matrix, Vector

LANE_WIDTH = 2.4
MAX_HEIGHT = 1.12
CORE_DEPTH = 1.5
SPILL = .22  # how far rubble may reach past the occupied lanes

# Material slots of a stone hazard mesh, in order.
STONE_SLOTS = ["stone", "stoneMid", "stoneDark", "stoneWarm", "leafsGreen", "dirtDark", "grass"]
STONE, MID, DARK, WARM, MOSS, BED, GRASS = range(len(STONE_SLOTS))
TONES = (STONE, STONE, MID, MID, WARM)

# Points per archetype and how each is squashed: (points, width, depth, height) multipliers.
ARCHETYPES = {
    "boulder": (22, 1.0, .9, .85),
    "chunk": (14, 1.0, .8, .7),
    "slab": (12, 1.25, 1.0, .42),
    "shard": (10, .6, .55, 1.0),
    "pebble": (8, 1.0, .85, .6),
}

# Per variant: crests as (x as fraction of half span, height, spread as fraction of span), moss chance.
LAYOUTS = {
    "A": ([(-.45, 1.0, .32), (.5, .62, .22)], .25),
    "B": ([(.15, .92, .45)], .15),
    "C": ([(-.7, .55, .2), (.05, .78, .25), (.68, 1.0, .2)], .3),
}


def hull_rock(rng, size, archetype):
    """Local-space convex hull of random points; flat base at z=0, returns a temp bmesh."""
    count, mw, md, mh = ARCHETYPES[archetype]
    width, depth, height = size[0] * mw, size[1] * md, size[2] * mh
    points = []
    # Weathered rocks are blunt: a cut plane shears off the crown (lower on one side) so tops are flat
    # fractures, not the apex an evenly sampled sphere hull tends to make.
    cap, cap_tilt = height / 2 * rng.uniform(.62, .85), Vector((rng.uniform(-.25, .25), rng.uniform(-.25, .25), 0))
    for _ in range(count):
        u, a = rng.uniform(-1, 1), rng.uniform(0, math.tau)
        r = math.sqrt(1 - u * u)
        reach = rng.uniform(.84, 1.0)
        p = Vector((r * math.cos(a) * width / 2 * reach, r * math.sin(a) * depth / 2 * reach, u * height / 2 * reach))
        p.z = min(max(p.z, -height * .18), cap + p.x * cap_tilt.x + p.y * cap_tilt.y)
        points.append(p)
    # A few base points keep the footprint wide so the rock sits rather than balances.
    for k in range(4):
        a = k * math.tau / 4 + rng.uniform(-.4, .4)
        points.append(Vector((math.cos(a) * width * .42, math.sin(a) * depth * .42, -height * .18)))
    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in points]
    hull = bmesh.ops.convex_hull(bm, input=verts)
    unused = list({g for g in hull["geom_interior"] + hull["geom_unused"] if isinstance(g, bmesh.types.BMVert)})
    bmesh.ops.delete(bm, geom=unused, context="VERTS")
    # Random reach shrinks the hull; stretch it back so the rock is exactly as tall as asked.
    low = min(v.co.z for v in bm.verts)
    stretch = height / max(max(v.co.z for v in bm.verts) - low, 1e-6)
    for v in bm.verts:
        v.co.z = (v.co.z - low) * stretch
    return bm


def place_rock(bm, rng, centre, size, archetype, tone, moss=0.0, tilt=0.0, sink=0.0):
    """Hull rock turned, tilted and sunk into `bm`; faces get tone, dark undersides and maybe moss."""
    rock = hull_rock(rng, size, archetype)
    turn = Matrix.Rotation(rng.uniform(0, math.tau), 4, "Z")
    lean = Matrix.Rotation(tilt, 4, Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)).normalized())
    move = Matrix.Translation((centre[0], centre[1], centre[2] - sink))
    transform = move @ lean @ turn
    made = {v: bm.verts.new(transform @ v.co) for v in rock.verts}
    top = max(v.co.z for v in made.values())
    # Moss is per rock, never per face: a mossy rock gets its whole upward cap, a single green facet reads as a decal.
    mossy = rng.random() < moss
    for face in rock.faces:
        new = bm.faces.new([made[v] for v in face.verts])
        new.normal_update()
        if new.normal.z < -.15:
            new.material_index = DARK
        elif mossy and new.normal.z > .55 and new.calc_center_median().z > top * .5:
            new.material_index = MOSS
        else:
            new.material_index = tone
    rock.free()
    return top


def crest_height(x, half, crests):
    """Pile height at x from the variant's crests; never below a low rubble floor."""
    h = .32
    for cx, ch, spread in crests:
        d = (x - cx * half) / (spread * half * 2)
        h = max(h, ch * MAX_HEIGHT * math.exp(-d * d))
    return h


def add_blade(bm, base, lean, height, radius):
    rings = []
    for frac, r in ((0, radius), (.55, radius * .7), (1, radius * .12)):
        centre = base + Vector((lean.x * frac * frac, lean.y * frac * frac, height * frac))
        rings.append([bm.verts.new(centre + Vector((math.cos(a) * r, math.sin(a) * r, 0)))
                      for a in (0, math.tau / 3, 2 * math.tau / 3)])
    for lower, upper in zip(rings, rings[1:]):
        for k in range(3):
            bm.faces.new((lower[k], lower[(k + 1) % 3], upper[(k + 1) % 3], upper[k])).material_index = GRASS


def add_bed(bm, rng, half):
    """Low irregular soil mound under the pile so it sits in the trail instead of on it."""
    ring = []
    steps = 22
    for i in range(steps):
        a = i * math.tau / steps
        rx = (half + .35) * rng.uniform(.94, 1.04)
        ry = (CORE_DEPTH / 2 + .45) * rng.uniform(.85, 1.08)
        ring.append(bm.verts.new((math.cos(a) * rx, math.sin(a) * ry, .0)))
    inner = [bm.verts.new((v.co.x * .82, v.co.y * .7, rng.uniform(.05, .09))) for v in ring]
    for k in range(steps):
        bm.faces.new((ring[k], ring[(k + 1) % steps], inner[(k + 1) % steps], inner[k])).material_index = BED
    bm.faces.new(list(inner)).material_index = BED


def build_stone_hazard(lane_count, variant, seed):
    """One whole rockfall spanning `lane_count` lanes. Returns a bmesh in STONE_SLOTS order."""
    rng = random.Random(seed)
    crests, moss = LAYOUTS[variant]
    half = lane_count * LANE_WIDTH / 2
    bm = bmesh.new()
    add_bed(bm, rng, half)

    # Core: walk across the span; rock size follows the crest profile, gaps are always covered.
    x = -half - .05
    while x < half + .05:
        h = crest_height(x, half, crests) * rng.uniform(.82, 1.0)
        tall = h > .75 * MAX_HEIGHT
        archetype = rng.choice(("boulder", "boulder", "shard") if tall else ("boulder", "chunk", "slab", "chunk"))
        width = max(.6, h * rng.uniform(1.25, 1.85)) if archetype != "shard" else max(.45, h * .7)
        size = (width, rng.uniform(.75, 1.05) * CORE_DEPTH * (.7 if archetype == "shard" else .85), h / ARCHETYPES[archetype][3])
        tilt = rng.uniform(.18, .38) if archetype in ("shard", "slab") else rng.uniform(0, .14)
        place_rock(bm, rng, (x + width * .4, rng.uniform(-.18, .18), 0), size, archetype, rng.choice(TONES),
                   moss=moss if h > .5 else 0, tilt=tilt, sink=rng.uniform(.03, .12))
        x += width * rng.uniform(.62, .82)

    # Second rank: smaller rocks leaning on the front and back faces, so the pile has depth.
    for side in (-1, 1):
        for _ in range(lane_count + rng.randint(0, 2)):
            px = rng.uniform(-half * .9, half * .9)
            h = crest_height(px, half, crests) * rng.uniform(.4, .62)
            place_rock(bm, rng, (px, side * rng.uniform(.5, .72), 0), (h * 1.5, h * 1.3, h / .7), "chunk",
                       rng.choice(TONES), tilt=rng.uniform(.1, .3), sink=.04)

    # Rubble skirt: pebbles spilling outward, thicker under the crests and past the ends.
    for _ in range(9 * lane_count):
        px = rng.uniform(-half - .3, half + .3)
        side = rng.choice((-1, 1))
        py = side * rng.uniform(.7, 1.15) * (1 + .25 * crest_height(px, half, crests) / MAX_HEIGHT)
        s = rng.uniform(.12, .3)
        place_rock(bm, rng, (px, py, 0), (s * 1.3, s, s), "pebble", rng.choice((STONE, MID, DARK, WARM)),
                   tilt=rng.uniform(0, .4), sink=s * .2)

    # Grass where the rubble meets the trail edges.
    for end in (-1, 1):
        for _ in range(rng.randint(2, 3)):
            base = Vector((end * (half + rng.uniform(-.2, .25)), rng.uniform(-.9, .9), 0))
            for _ in range(3):
                lean = Vector((rng.uniform(-.15, .15), rng.uniform(-.15, .15), 0))
                add_blade(bm, base + Vector((rng.uniform(-.07, .07), rng.uniform(-.07, .07), 0)), lean,
                          rng.uniform(.22, .4), .035)

    # Nothing may spill more than SPILL into a neighbouring lane, or the open lane stops reading as open.
    lo, hi = min(v.co.x for v in bm.verts), max(v.co.x for v in bm.verts)
    squeeze = min(1.0, 2 * (half + SPILL) / (hi - lo))
    for v in bm.verts:
        v.co.x = (v.co.x - (lo + hi) / 2) * squeeze
    top = max(v.co.z for v in bm.verts)
    if top > MAX_HEIGHT:
        for v in bm.verts:
            v.co.z *= MAX_HEIGHT / top
    for v in bm.verts:
        v.co.z = max(v.co.z, -.15)
    return bm
