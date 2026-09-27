"""Run in Blender against magicians_animation_catalog.blend.

Preserve the running legs; retime upper-body strikes and repair quaternion
hemisphere flips that otherwise interpolate through collapsed rotations.
Writes a separate reviewable catalog, leaving the input scene intact.
"""
from pathlib import Path
import bpy
from mathutils import Quaternion


def curves(action):
    if action.is_action_legacy:
        yield from action.fcurves
    else:
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    yield from bag.fcurves


# Two running strides per attack. Deliberate preparation, quick delivery,
# readable extension, then a relaxed return to the starting pose.
TIMING = ((0, 0), (10, 5), (14, 8), (20, 10), (28, 14), (38, 19))
UPPER = {'spine', 'chest', 'head', 'upperarm.l', 'lowerarm.l', 'wrist.l',
         'hand.l', 'handslot.l', 'upperarm.r', 'lowerarm.r', 'wrist.r',
         'hand.r', 'handslot.r'}


def source_time(frame):
    for (start, a), (end, b) in zip(TIMING, TIMING[1:]):
        if frame <= end:
            t = (frame - start) / (end - start)
            return a + (b - a) * t
    return 19


def smooth_loop(values, period):
    """Soften the baked seam without changing the middle of the strike."""
    original = values[:period]
    result = original.copy()
    for t in range(period):
        distance = min(t, period - t)
        if distance >= 4:
            continue
        strength = (1 - distance / 4) ** 2
        filtered = sum(original[(t + offset) % period] * weight
                       for offset, weight in ((-2, 1), (-1, 4), (0, 6), (1, 4), (2, 1))) / 16
        result[t] += strength * (filtered - original[t])
    return [result[t % period] for t in range(39)]


scene = bpy.context.scene
rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE' and '_Attack_Rig' in o.name]
assert len(rigs) == 5, 'Expected the five-character attack catalog'
for rig in rigs:
    original = rig.animation_data.action
    action = original.copy()
    action.name = original.name + '_Clear'
    fs = list(curves(action))
    # Fix signs at the source keyframes before evaluating between them.
    groups = {}
    for f in fs:
        if f.data_path.endswith('rotation_quaternion'):
            groups.setdefault(f.data_path, {})[f.array_index] = f
    for path, channels in groups.items():
        assert len(channels) == 4
        times = sorted({k.co.x for f in channels.values() for k in f.keyframe_points})
        values = []
        previous = None
        for t in times:
            q = Quaternion([channels[i].evaluate(t) for i in range(4)]).normalized()
            if previous is not None and previous.dot(q) < 0:
                q.negate()
            values.append((t, q.copy()))
            previous = q
        for i, f in channels.items():
            f.keyframe_points.clear()
            for t, q in values:
                k = f.keyframe_points.insert(t, q[i])
                k.interpolation = 'LINEAR'
            f.update()
    sampled = []
    for f in fs:
        bone = f.data_path.split('"')[1] if 'pose.bones[' in f.data_path else ''
        values = [f.evaluate(source_time(t) if bone in UPPER else t % 19)
                  for t in range(39)]
        sampled.append(smooth_loop(values, 38 if bone in UPPER else 19))
    for f, values in zip(fs, sampled):
        f.keyframe_points.clear()
        values[-1] = values[0]
        for t, value in enumerate(values):
            k = f.keyframe_points.insert(t, value)
            # Periodic central differences give the first and last keys the
            # same velocity. Explicit handles also smooth subframe playback.
            slope = (values[(t + 1) % 38] - values[(t - 1) % 38]) / 2
            k.interpolation = 'BEZIER'
            k.handle_left_type = 'FREE'
            k.handle_right_type = 'FREE'
            k.handle_left = (t - 1 / 3, value - slope / 3)
            k.handle_right = (t + 1 / 3, value + slope / 3)
        if not any(m.type == 'CYCLES' for m in f.modifiers):
            f.modifiers.new('CYCLES')
        f.update()
    action.use_cyclic = True
    action.frame_start = 0
    action.frame_end = 38
    rig.animation_data.action = action
    assert tuple(action.frame_range) == (0.0, 38.0)
    for f in fs:
        first, last = f.keyframe_points[0], f.keyframe_points[-1]
        assert abs(first.co.y - last.co.y) < 1e-6
        incoming = (last.co.y - last.handle_left.y) / (last.co.x - last.handle_left.x)
        outgoing = (first.handle_right.y - first.co.y) / (first.handle_right.x - first.co.x)
        assert abs(incoming - outgoing) < 1e-4, f.data_path
    print('Refined:', rig.name, len(fs), 'curves; seamless 38-frame attack')

scene.frame_start = 0
# One complete attack period; omit the duplicated endpoint during playback.
scene.frame_end = 37
scene.frame_set(14)
output = Path(bpy.data.filepath).with_name('magicians_animation_catalog_refined.blend')
bpy.ops.wm.save_as_mainfile(filepath=str(output))
print('Saved:', output)
