"""Trial hip-led staff swings in the refined catalog; leave the source intact.

Run in Blender with magicians_animation_catalog_refined.blend open.
Writes magicians_animation_catalog_waist_trial.blend, without exporting game GLBs.
After rebuilding, run fix_magician_staff_clearance.py on the trial to restore its safe staff path.
"""
from pathlib import Path
from math import radians

import bpy
from mathutils import Quaternion


PERIOD = 38
# Hips prepare first, deliver the strike, then settle before the loop seam.
TURN = ((0, 0), (8, 6), (18, -8), (26, -3), (34, 0), (38, 0))
WAIST = {'hips': (1.0, 0), 'spine': (0.3, 2), 'chest': (0.4, 3)}
LEGS = ('upperleg.l', 'upperleg.r')
FEET = ('foot.l', 'foot.r')


def curves(action):
    if action.is_action_legacy:
        yield from action.fcurves
    else:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves


def turn_at(frame):
    frame %= PERIOD
    for (a, start), (b, end) in zip(TURN, TURN[1:]):
        if frame <= b:
            t = (frame - a) / (b - a)
            return radians(start + (end - start) * t * t * (3 - 2 * t))
    return 0.0


def write_channels(action, path, samples):
    channels = {f.array_index: f for f in curves(action) if f.data_path == path}
    assert len(channels) == len(samples[0]), f'Missing channels: {path}'
    for index, f in channels.items():
        f.keyframe_points.clear()
        for frame, value in enumerate(samples):
            slope = (samples[(frame + 1) % PERIOD][index]
                     - samples[(frame - 1) % PERIOD][index]) / 2
            key = f.keyframe_points.insert(frame, value[index])
            key.interpolation = 'BEZIER'
            key.handle_left_type = key.handle_right_type = 'FREE'
            key.handle_left = (frame - 1 / 3, value[index] - slope / 3)
            key.handle_right = (frame + 1 / 3, value[index] + slope / 3)
        if not any(m.type == 'CYCLES' for m in f.modifiers):
            f.modifiers.new('CYCLES')
        f.update()


scene = bpy.context.scene
source_path = Path(bpy.data.filepath)
assert source_path.stem in ('magicians_animation_catalog_refined',
                            'magicians_animation_catalog_waist_trial')
rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE' and '_Attack_Rig' in o.name]
assert len(rigs) == 5, 'Expected the five-character attack catalog'
assert all(t.mute for r in rigs for t in r.animation_data.nla_tracks), 'Unexpected NLA blending'
for rig in rigs:
    current = rig.animation_data.action
    source = bpy.data.actions[current['waist_source']] if 'waist_source' in current else current
    assert tuple(source.frame_range) == (0.0, 38.0)
    assert all(not rig.pose.bones[n].constraints for n in (*WAIST, *LEGS, *FEET))
    rig.animation_data.action = source
    # Sample before writing keys, so previous modified frames cannot feed back.
    rotations = {n: [] for n in (*WAIST, *LEGS)}
    locations = {n: [] for n in LEGS}
    for frame in range(PERIOD + 1):
        scene.frame_set(frame)
        leg_matrices = {n: rig.pose.bones[n].matrix.copy() for n in LEGS}
        for name, (strength, delay) in WAIST.items():
            bone = rig.pose.bones[name]
            bone.rotation_quaternion = (bone.rotation_quaternion.normalized()
                                        @ Quaternion((0, 1, 0), strength * turn_at(frame - delay)))
        bpy.context.view_layer.update()
        # Counter the hip turn at each thigh, retaining the original running
        # stride and foot positions while the upper body supports the swing.
        for name in LEGS:
            bone = rig.pose.bones[name]
            basis = bone.bone.convert_local_to_pose(
                leg_matrices[name], bone.bone.matrix_local,
                parent_matrix=bone.parent.matrix,
                parent_matrix_local=bone.parent.bone.matrix_local, invert=True)
            bone.matrix_basis = basis
            locations[name].append(tuple(bone.location))
        for name, values in rotations.items():
            q = rig.pose.bones[name].rotation_quaternion.normalized()
            if values and Quaternion(values[-1]).dot(q) < 0:
                q.negate()
            values.append(tuple(q))
    action = source.copy()
    action.name = source.name + '_WaistTrial'
    action['waist_source'] = source.name
    source.use_fake_user = True
    for name, samples in rotations.items():
        samples[-1] = samples[0]
        write_channels(action, f'pose.bones["{name}"].rotation_quaternion', samples)
    for name, samples in locations.items():
        samples[-1] = samples[0]
        write_channels(action, f'pose.bones["{name}"].location', samples)
    action.use_cyclic = True
    action.frame_start, action.frame_end = 0, PERIOD
    # Compare actual evaluated feet, including interpolation and later cycles.
    frames = [t / 2 for t in range(PERIOD * 2 + 1)] + [50.5, 76, 94.5]
    original_feet, original_hips = {}, {}
    for test_action, targets in ((source, original_feet), (action, None)):
        rig.animation_data.action = test_action
        max_drift = 0.0
        max_turn = 0.0
        for frame in frames:
            scene.frame_set(int(frame), subframe=frame % 1)
            hips = rig.pose.bones['hips'].rotation_quaternion.normalized()
            if targets is not None:
                targets[frame] = [rig.pose.bones[n].matrix.copy() for n in FEET]
                original_hips[frame] = hips.copy()
            else:
                max_turn = max(max_turn, original_hips[frame].rotation_difference(hips).angle)
                for name, before in zip(FEET, original_feet[frame]):
                    after = rig.pose.bones[name].matrix
                    max_drift = max(max_drift, *(abs(after[i][j] - before[i][j])
                                                 for i in range(4) for j in range(4)))
        if targets is None:
            assert max_drift < 0.002, (rig.name, 'foot drift', max_drift)
            assert radians(7.5) < max_turn < radians(8.5), (rig.name, 'hip turn', max_turn)
    for f in curves(action):
        assert abs(f.evaluate(0) - f.evaluate(PERIOD)) < 1e-5, f.data_path
    print(f'{rig.name}: 8-degree hip turn; max foot matrix drift {max_drift:.6f}; loop verified')

scene.frame_start, scene.frame_end = 0, PERIOD - 1
scene.frame_set(18)
output = source_path.with_name('magicians_animation_catalog_waist_trial.blend')
bpy.ops.wm.save_as_mainfile(filepath=str(output))
print('Saved waist trial:', output)
