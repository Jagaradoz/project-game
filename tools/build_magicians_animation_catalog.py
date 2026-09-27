"""Build a three-row Blender preview for the magician character animations.

Run with Blender, not regular Python:
  blender --background public/assets/models/magicians_scene.blend \
    --python tools/build_magicians_animation_catalog.py
"""

from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(bpy.data.filepath).resolve().parents[3]
OUTPUT = ROOT / "public" / "assets" / "models" / "magicians_animation_catalog.blend"

CHARACTERS = (
    ("Rig.001", "Mage"),
    ("Rig_Medium", "Druid"),
    ("Rig", "Skeleton Mage"),
    ("Rig_Medium.001", "Witch"),
    ("Rig_Medium.002", "Magical Girl"),
)

ROW_SPACING = 6.5

ROWS = (
    ("Idle", "Idle_Staff_", 0.0),
    ("Running", "Running_Staff_", ROW_SPACING),
    ("Attack", "Attack_Staff_", ROW_SPACING * 2),
)


def action_for(row_prefix: str, rig_name: str):
    action = bpy.data.actions.get(f"{row_prefix}{rig_name}")
    if action is None:
        raise RuntimeError(f"Missing action: {row_prefix}{rig_name}")
    return action


def iter_action_fcurves(action):
    """Yield F-curves from both legacy and layered Blender actions."""
    if action.is_action_legacy:
        yield from action.fcurves
        return

    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                yield from channelbag.fcurves


def make_action_loop(action):
    """Repeat animated curves before and after their authored keyframe range."""
    action.use_cyclic = True

    for fcurve in iter_action_fcurves(action):
        if len(fcurve.keyframe_points) < 2:
            continue
        cycles = next(
            (modifier for modifier in fcurve.modifiers if modifier.type == "CYCLES"),
            None,
        )
        if cycles is None:
            cycles = fcurve.modifiers.new("CYCLES")
        cycles.mode_before = "REPEAT"
        cycles.mode_after = "REPEAT"


def duplicate_character(source_rig, name: str, y_offset: float, collection):
    rig = source_rig.copy()
    rig.data = source_rig.data.copy()
    rig.name = name
    collection.objects.link(rig)
    rig.location = source_rig.location + Vector((0.0, y_offset, 0.0))

    for source_child in tuple(source_rig.children):
        child = source_child.copy()
        child.data = source_child.data
        child.name = f"{name}_{source_child.name}"
        collection.objects.link(child)
        child.parent = rig

        for modifier in child.modifiers:
            if modifier.type == "ARMATURE" and modifier.object == source_rig:
                modifier.object = rig

    return rig


def assign_action(rig, action):
    make_action_loop(action)
    rig.animation_data_create()
    rig.animation_data.action = action


def add_label(text: str, location, size: float, collection):
    curve = bpy.data.curves.new(f"{text}_Label", "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = 0.015

    label = bpy.data.objects.new(f"{text}_Label", curve)
    collection.objects.link(label)
    label.location = location
    label.rotation_euler.x = 1.57079632679
    return label


catalog = bpy.data.collections.get("Animation Catalog")
if catalog is None:
    catalog = bpy.data.collections.new("Animation Catalog")
    bpy.context.scene.collection.children.link(catalog)

source_rigs = {rig_name: bpy.data.objects[rig_name] for rig_name, _ in CHARACTERS}

for rig_name, character_name in CHARACTERS:
    source = source_rigs[rig_name]
    source.name = f"{character_name}_Idle_Rig"
    assign_action(source, action_for("Idle_Staff_", rig_name))

    running = duplicate_character(source, f"{character_name}_Running_Rig", ROW_SPACING, catalog)
    assign_action(running, action_for("Running_Staff_", rig_name))

    attack = duplicate_character(source, f"{character_name}_Attack_Rig", ROW_SPACING * 2, catalog)
    assign_action(attack, action_for("Attack_Staff_", rig_name))

for label, _prefix, y in ROWS:
    add_label(label.upper(), (-6.8, y, 1.2), 0.55, catalog)

for rig_name, character_name in CHARACTERS:
    x = source_rigs[rig_name].location.x
    add_label(character_name, (x, -0.55, 2.55), 0.32, catalog)

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 70
scene.frame_set(1)

for workspace in bpy.data.workspaces:
    for screen in workspace.screens:
        for area in screen.areas:
            if area.type != "VIEW_3D":
                continue
            region = area.spaces.active.region_3d
            region.view_location = (0.0, ROW_SPACING, 1.3)
            region.view_distance = 19.0

bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
print(f"Saved animation catalog: {OUTPUT}")
