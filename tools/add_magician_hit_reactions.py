"""Add a running-compatible hit reaction row to the open magician catalog.

Run inside Blender against magicians_animation_catalog_refined.blend.
Only copied upper-body rotation curves change; the running feet, hips, root,
staff attachment and original actions remain intact.
"""
from datetime import datetime
from math import radians
from pathlib import Path
import shutil
import sys

import bpy
from mathutils import Euler, Quaternion, Vector


CHARACTERS = ('Mage', 'Druid', 'Skeleton Mage', 'Witch', 'Magical Girl')
PERIOD = 38
OFFSETS = {
    'spine': (-24, 8, -4),
    'chest': (-28, 10, -4),
    'head': (18, -8, 3),
    'upperarm.l': (24, 0, -34),
    'lowerarm.l': (0, 0, -45),
    'upperarm.r': (16, 0, 18),
    'lowerarm.r': (0, 0, 24),
}
TIMING = ((0, 0), (2, 0), (4, 1), (5, 1), (7, .8),
          (10, .2), (13, -.12), (16, 0), (38, 0))


def curves(action):
    if action.is_action_legacy:
        yield from action.fcurves
    else:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves


def strength(frame):
    for (start, a), (end, b) in zip(TIMING, TIMING[1:]):
        if frame <= end:
            t = (frame - start) / (end - start)
            return a + (b - a) * t * t * (3 - 2 * t)
    return 0


def bake_reaction(source, rig):
    """Always sample the original run, so refinements do not accumulate offsets."""
    action = rig.animation_data.action
    original = {(f.data_path, f.array_index): f for f in curves(source.animation_data.action)}
    target = {(f.data_path, f.array_index): f for f in curves(action)}
    for bone, angles in OFFSETS.items():
        path = f'pose.bones["{bone}"].rotation_quaternion'
        samples = []
        previous = None
        for step in range(PERIOD * 2 + 1):
            frame = step / 2
            base = Quaternion([original[path, i].evaluate(frame) for i in range(4)]).normalized()
            offset = Euler(tuple(radians(v) * strength(frame) for v in angles)).to_quaternion()
            q = (base @ offset).normalized()
            if previous is not None and previous.dot(q) < 0:
                q.negate()
            samples.append(q.copy())
            previous = q
        assert abs(samples[0].dot(samples[-1])) > .99999
        for i in range(4):
            f = target[path, i]
            f.keyframe_points.clear()
            for step, q in enumerate(samples):
                key = f.keyframe_points.insert(step / 2, q[i], options={'FAST'})
                key.interpolation = 'LINEAR'
            for modifier in list(f.modifiers):
                f.modifiers.remove(modifier)
            cycle = f.modifiers.new('CYCLES')
            cycle.mode_before = 'REPEAT'
            cycle.mode_after = 'REPEAT'
            f.update()
    action.use_cyclic = True
    action.use_frame_range = True
    action.frame_start = 0
    action.frame_end = PERIOD
    action['description'] = 'Sharp impact, pronounced upper-body recoil, small recovery overshoot over the unchanged running stride.'


def validate_reactions():
    scene = bpy.context.scene
    previous_frame = scene.frame_current
    for name in CHARACTERS:
        source = bpy.data.objects[name + '_Running_Rig']
        rig = bpy.data.objects[name + '_GetAttacked_Rig']
        source_curves = {(f.data_path, f.array_index): f for f in curves(source.animation_data.action)}
        hit_curves = {(f.data_path, f.array_index): f for f in curves(rig.animation_data.action)}
        assert source_curves.keys() == hit_curves.keys()
        assert tuple(rig.animation_data.action.frame_range) == (0.0, 38.0)
        max_unchanged_error = 0
        for key, f in hit_curves.items():
            is_reaction = any(key[0] == f'pose.bones["{bone}"].rotation_quaternion' for bone in OFFSETS)
            if not is_reaction:
                error = max(abs(f.evaluate(t / 4) - source_curves[key].evaluate(t / 4))
                            for t in range(PERIOD * 4 + 1))
                max_unchanged_error = max(max_unchanged_error, error)
                assert error < 1e-6, (name, key, error)
        for bone in OFFSETS:
            path = f'pose.bones["{bone}"].rotation_quaternion'
            hit_peak = Quaternion([hit_curves[path, i].evaluate(5) for i in range(4)]).normalized()
            running_peak = Quaternion([source_curves[path, i].evaluate(5) for i in range(4)]).normalized()
            assert abs(hit_peak.dot(running_peak)) < .999, (name, bone, 'missing recoil')
            for frame in (0, 2, 16, 19, 38, 54, 76):
                actual = Quaternion([hit_curves[path, i].evaluate(frame) for i in range(4)]).normalized()
                expected = Quaternion([source_curves[path, i].evaluate(frame) for i in range(4)]).normalized()
                assert abs(actual.dot(expected)) > .99999, (name, bone, frame)
        # Check evaluated lower-body bones, not just copied curve values.
        for frame in (0, 5, 9, 16, 19, 38, 43, 76):
            scene.frame_set(frame)
            for bone in ('root', 'hips', 'upperleg.l', 'lowerleg.l', 'foot.l',
                         'upperleg.r', 'lowerleg.r', 'foot.r'):
                a, b = source.pose.bones[bone].matrix, rig.pose.bones[bone].matrix
                assert max(abs(a[i][j] - b[i][j]) for i in range(4) for j in range(4)) < 1e-5
        for child in rig.children:
            for modifier in child.modifiers:
                if modifier.type == 'ARMATURE':
                    assert modifier.object == rig
            if child.parent_type == 'BONE':
                assert child.parent == rig and child.parent_bone in rig.pose.bones
        print('VALIDATED', name, 'running stride unchanged;', len(hit_curves),
              'curves; transition endpoints and repeated cycles verified')
    scene.frame_set(previous_frame)


def build_row():
    blend_path = Path(bpy.data.filepath)
    assert blend_path.name == 'magicians_animation_catalog_refined.blend', blend_path
    assert not any(name + '_GetAttacked_Rig' in bpy.data.objects for name in CHARACTERS), 'Row already exists'
    backup = blend_path.parent / 'backups' / ('magicians_before_hit_reactions_' + datetime.now().strftime('%Y%m%d_%H%M%S') + '.blend')
    backup.parent.mkdir(exist_ok=True)
    shutil.copy2(blend_path, backup)
    if bpy.data.is_dirty:
        bpy.ops.wm.save_as_mainfile(filepath=str(backup), copy=True)
    scene = bpy.context.scene
    collection = bpy.data.collections['Animation Catalog']
    row_y = max(bpy.data.objects[name + '_Death_Rig'].location.y for name in CHARACTERS) + 6.5
    for name in CHARACTERS:
        source = bpy.data.objects[name + '_Running_Rig']
        rig = source.copy()
        rig.data = source.data.copy()
        rig.name = name + '_GetAttacked_Rig'
        collection.objects.link(rig)
        rig.location.y = row_y
        # Each duplicated rig plays only its new action.
        for track in list(rig.animation_data.nla_tracks):
            rig.animation_data.nla_tracks.remove(track)
        action = source.animation_data.action.copy()
        action.name = 'GetAttacked_Running_' + name.replace(' ', '_')
        rig.animation_data.action = action
        rig.animation_data.action_slot = action.slots[0]
        for child_source in source.children_recursive:
            child = child_source.copy()
            child.name = rig.name + '_' + child_source.name.split('_Running_Rig_')[-1]
            collection.objects.link(child)
            # The inspected magician hierarchy has direct mesh and bone children.
            assert child_source.parent == source
            child.parent = rig
            for modifier in child.modifiers:
                if modifier.type == 'ARMATURE' and modifier.object == source:
                    modifier.object = rig
        bake_reaction(source, rig)
        rig['animation_role'] = 'get_attacked_while_running'
    label_source = bpy.data.objects['RUNNING_Label']
    label = label_source.copy()
    label.data = label_source.data.copy()
    label.name = 'GET_ATTACKED_Label'
    label.data.body = 'GET ATTACKED'
    label.data.size = .38
    label.location.y = row_y
    collection.objects.link(label)
    validate_reactions()
    scene.frame_set(5)
    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    for name in CHARACTERS:
        bpy.data.objects[name + '_GetAttacked_Rig'].select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects['Mage_GetAttacked_Rig']
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_location = Vector((0, row_y, 1.1))
                area.spaces.active.region_3d.view_distance = 15
                area.spaces.active.overlay.show_extras = False
                area.spaces.active.overlay.show_relationship_lines = False
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    print('SAVED', blend_path, 'NEW ROW Y', row_y, 'BACKUP', backup)


if __name__ == '__main__':
    if '--validate-only' in sys.argv:
        validate_reactions()
    else:
        build_row()
