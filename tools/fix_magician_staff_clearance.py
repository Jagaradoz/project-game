"""Keep staff attacks outside the character silhouette in the waist trial.

Run after add_magician_waist_motion.py, with the waist trial open in Blender.
The staff remains attached to the hand; arm lengths and lower-body motion stay
unchanged. Retains the uncorrected actions for comparison and repeatable runs.
"""
from pathlib import Path
from math import acos, degrees, pi, radians, sin, cos, sqrt

import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree


PERIOD = 38
SAMPLE_RATE = 2
ARM = tuple(f'{bone}.{side}' for side in ('r', 'l')
            for bone in ('upperarm', 'lowerarm', 'wrist', 'hand'))
SWING = ((0, 0), (8, -1), (14, 1), (18, 0.75), (26, 0.2), (38, 0))
GRIP_SPACING = 0.18


def curves(action):
    if action.is_action_legacy:
        yield from action.fcurves
    else:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves


def swing_at(frame):
    frame %= PERIOD
    for (a, start), (b, end) in zip(SWING, SWING[1:]):
        if frame <= b:
            t = (frame - a) / (b - a)
            return start + (end - start) * t * t * (3 - 2 * t)
    return 0.0


def set_matrix(bone, matrix):
    bone.matrix_basis = bone.bone.convert_local_to_pose(
        matrix, bone.bone.matrix_local,
        parent_matrix=bone.parent.matrix,
        parent_matrix_local=bone.parent.bone.matrix_local, invert=True)
    bpy.context.view_layer.update()


def aim(bone, direction, endpoint=None):
    rotation = ((bone.tail if endpoint is None else endpoint) - bone.head).rotation_difference(direction)
    matrix = rotation.to_matrix().to_4x4() @ bone.matrix
    matrix.translation = bone.head
    set_matrix(bone, matrix)


def solve_arm(rig, side, target):
    upper, lower, wrist, hand = (rig.pose.bones[f'{name}.{side}']
                                for name in ('upperarm', 'lowerarm', 'wrist', 'hand'))
    shoulder = upper.head.copy()
    delta = target - shoulder
    distance = delta.length
    direction = delta.normalized()
    a = (lower.head - upper.head).length
    b = (wrist.head - lower.head).length + (hand.head - wrist.head).length
    assert abs(a - b) < distance < a + b, (rig.name, side, 'Unreachable grip', distance, a+b)
    along = (a * a - b * b + distance * distance) / (2 * distance)
    center = shoulder + direction * along
    radius = sqrt(max(0, a * a - along * along))
    up = Vector((-0.4 if side == 'r' else 0.4, 0, 1))
    pole = (up - direction * up.dot(direction)).normalized()
    elbow = center + radius * pole
    aim(upper, elbow - shoulder, endpoint=lower.head)
    aim(lower, target - lower.head, endpoint=wrist.head)
    aim(wrist, target - wrist.head, endpoint=hand.head)
    assert (hand.head - target).length < 1e-4


def secondary_grip(rig, weapon):
    matrix = rig.matrix_world.inverted() @ weapon.matrix_world
    sign = -1 if 'Witch_' in weapon.name else 1
    return matrix @ Vector((0, 0, -weapon['staff_grip_shift'] + sign * GRIP_SPACING))


def pose_clear_swing(rig, weapon, frame):
    # Start from a fixed arm orientation, avoiding a full roll inherited from
    # the old one-handed action and its quaternion discontinuity at the seam.
    for name in ARM:
        rig.pose.bones[name].rotation_quaternion = Quaternion()
    bpy.context.view_layer.update()
    swing = swing_at(frame)
    shoulder = rig.pose.bones['upperarm.r'].head.copy()
    # Two-handed casting: draw back and turn up to charge, then snap both
    # hands forward as the staff swings down and points at the target.
    target = shoulder + Vector((0.26 + 0.12 * swing,
                                -0.23 - 0.05 * swing, -0.23 + 0.06 * swing))
    yaw = radians(-25 * swing)
    tilt = radians(10 - 15 * swing)
    strike_axis = Vector((sin(yaw) * cos(tilt), -cos(yaw) * cos(tilt), sin(tilt)))
    axis = strike_axis * (-1 if 'Witch_' in weapon.name else 1)
    solve_arm(rig, 'r', target)
    side = (Vector((1, 0, 0)) - axis * axis.x).normalized()
    if 'Witch_' in weapon.name:
        side.negate()
    desired = Matrix((side, axis.cross(side), axis)).transposed().to_quaternion()
    actual = (rig.matrix_world.inverted() @ weapon.matrix_world).to_quaternion()
    hand = rig.pose.bones['hand.r']
    matrix = (desired @ actual.conjugated()).to_matrix().to_4x4() @ hand.matrix
    matrix.translation = hand.head
    set_matrix(hand, matrix)
    # The support hand stays locked to a second point on the shaft for the
    # entire wind-up, release, recoil, and recovery.
    support = rig.pose.bones['hand.l']
    socket = rig.pose.bones['handslot.l']
    socket_offset = support.matrix.inverted() @ socket.head
    point = secondary_grip(rig, weapon)
    support_rotation = hand.matrix.to_quaternion() @ Quaternion((0, 1, 0), pi)
    approach = (point - rig.pose.bones['upperarm.l'].head).normalized()
    support_rotation = (support_rotation @ socket_offset).rotation_difference(approach) @ support_rotation
    target = point - support_rotation @ socket_offset
    solve_arm(rig, 'l', target)
    matrix = support_rotation.to_matrix().to_4x4()
    matrix.translation = support.head
    set_matrix(support, matrix)
    assert (socket.head - secondary_grip(rig, weapon)).length < 1e-4


def write_rotations(action, name, samples):
    path = f'pose.bones["{name}"].rotation_quaternion'
    channels = {f.array_index: f for f in curves(action) if f.data_path == path}
    assert len(channels) == 4, path
    assert Quaternion(samples[0]).dot(Quaternion(samples[-1])) > 0.999
    samples[-1] = samples[0]
    count = PERIOD * SAMPLE_RATE
    for index, curve in channels.items():
        curve.keyframe_points.clear()
        for sample, value in enumerate(samples):
            frame = sample / SAMPLE_RATE
            slope = (samples[(sample + 1) % count][index]
                     - samples[(sample - 1) % count][index]) / 2
            key = curve.keyframe_points.insert(frame, value[index])
            key.interpolation = 'BEZIER'
            key.handle_left_type = key.handle_right_type = 'FREE'
            key.handle_left = (frame - 1 / (3 * SAMPLE_RATE), value[index] - slope / 3)
            key.handle_right = (frame + 1 / (3 * SAMPLE_RATE), value[index] + slope / 3)
        if not any(m.type == 'CYCLES' for m in curve.modifiers):
            curve.modifiers.new('CYCLES')
        curve.update()


def mesh_tree(obj, rig, depsgraph, forearm_only=False):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    matrix = rig.matrix_world.inverted() @ evaluated.matrix_world
    polygons = [list(p.vertices) for p in mesh.polygons]
    if forearm_only:
        assert len(mesh.vertices) == len(obj.data.vertices)
        groups = [obj.vertex_groups[max(v.groups, key=lambda g: g.weight).group].name
                  for v in obj.data.vertices]
        polygons = [p for p in polygons if all(groups[i].split('.')[0] in ('upperarm', 'lowerarm') for i in p)]
    tree = BVHTree.FromPolygons([matrix @ v.co for v in mesh.vertices], polygons, epsilon=0.003)
    evaluated.to_mesh_clear()
    return tree


scene = bpy.context.scene
path = Path(bpy.data.filepath)
assert path.stem == 'magicians_animation_catalog_waist_trial'
rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE' and '_Attack_Rig' in o.name]
assert len(rigs) == 5
rigs.sort(key=lambda rig: 'Witch_' not in rig.name)
for rig in rigs:
    current = rig.animation_data.action
    source = bpy.data.actions[current['staff_source']] if 'staff_source' in current else current
    rig.animation_data.action = source
    assert all(not rig.pose.bones[n].constraints for n in ARM)
    weapons = [o for o in rig.children_recursive if o.type == 'MESH'
               and o.parent_bone == 'handslot.r' and not o.hide_render]
    assert len(weapons) == 1, rig.name
    weapon = weapons[0]
    # Grip near the shaft's end so the butt cannot sweep through the body.
    # The witch grips the handle end and swings the broom head forward.
    if 'staff_grip_original_location' not in weapon:
        weapon['staff_grip_original_location'] = list(weapon.location)
    grip_shift = -1.02 if 'Witch_' in weapon.name else -min(v.co.z for v in weapon.data.vertices) - 0.025
    weapon['staff_grip_shift'] = grip_shift
    weapon.location = (Vector(weapon['staff_grip_original_location'])
                       + weapon.matrix_basis.to_3x3() @ Vector((0, 0, grip_shift)))
    samples = {name: [] for name in ARM}
    for sample in range(PERIOD * SAMPLE_RATE + 1):
        frame = sample / SAMPLE_RATE
        scene.frame_set(int(frame), subframe=frame % 1)
        pose_clear_swing(rig, weapon, frame)
        for name, values in samples.items():
            q = rig.pose.bones[name].rotation_quaternion.normalized()
            if values and Quaternion(values[-1]).dot(q) < 0:
                q.negate()
            values.append(tuple(q))
    action = source.copy()
    action.name = source.name + '_StaffClear'
    action['staff_source'] = source.name
    action['staff_solver'] = 'two_handed_cast_v3'
    source.use_fake_user = True
    for name, values in samples.items():
        write_rotations(action, name, values)
    rig.animation_data.action = action
    # Holding-hand contact is intentional; also check the gripping forearm.
    obstacles = [o for o in rig.children_recursive if o.type == 'MESH'
                 and not o.hide_render and o != weapon]
    hits = []
    max_grip_error = 0.0
    for quarter_frame in range(PERIOD * 4):
        scene.frame_set(quarter_frame // 4, subframe=(quarter_frame % 4) / 4)
        dg = bpy.context.evaluated_depsgraph_get()
        staff = mesh_tree(weapon, rig, dg)
        max_grip_error = max(max_grip_error,
                             (rig.pose.bones['handslot.l'].head - secondary_grip(rig, weapon)).length)
        for obj in obstacles:
            if staff.overlap(mesh_tree(obj, rig, dg, forearm_only='ArmRight' in obj.name or 'ArmLeft' in obj.name)):
                hits.append((quarter_frame / 4, obj.name))
    assert not hits, (rig.name, 'Staff intersections', hits[:10])
    assert max_grip_error < 0.005, (rig.name, 'Support hand slipped', max_grip_error)
    # Measure the evaluated motion, not merely the planned target values.
    axes, hands = [], []
    for frame in (8, 14):
        scene.frame_set(frame)
        matrix = rig.matrix_world.inverted() @ weapon.matrix_world
        axes.append((matrix.to_3x3() @ Vector((0, 0, 1))).normalized())
        hands.append(rig.pose.bones['hand.r'].head.copy())
    sweep = degrees(acos(max(-1, min(1, axes[0].dot(axes[1])))))
    travel = (hands[1] - hands[0]).length
    assert sweep > 45 and travel > 0.17, (rig.name, 'Cast lost', sweep, travel)
    for f in curves(action):
        assert abs(f.evaluate(0) - f.evaluate(PERIOD)) < 1e-5
    print(rig.name, f'{sweep:.1f}-degree cast, {travel:.2f}m hand travel; support grip error {max_grip_error:.4f}; 152 clearance checks passed')

scene.frame_set(9)
bpy.ops.wm.save_as_mainfile(filepath=str(path))
print('Saved:', path)
