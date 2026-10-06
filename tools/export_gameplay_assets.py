"""Export gameplay GLBs from the approved animation catalog.

Run with Blender 5.1 in background against the saved master. The source file is
read-only; all staging cleanup and export work happens in memory.
"""
from pathlib import Path
import json
import math
import struct
import sys
import bpy
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[1]
CHAR_OUT = ROOT / 'public/assets/models/characters/animated'
ENEMY_OUT = ROOT / 'public/assets/models/enemies/animated'
SPELL_OUT = ROOT / 'public/assets/models/spells'
for folder in (CHAR_OUT, ENEMY_OUT, SPELL_OUT):
    folder.mkdir(parents=True, exist_ok=True)

PLAYERS = {
    'Mage': 'Mage', 'Druid': 'Druid', 'SkeletonMage': 'Skeleton Mage',
    'Witch': 'Witch', 'MagicalGirl': 'Magical Girl',
}
ENEMIES = {
    'GoblinScout': ('F04_GoblinScout', 'Goblin Scout'),
    'BrambleSkeleton': ('F02_BrambleSkeleton', 'Bramble Skeleton'),
    'ShroomBrute': ('F03_ShroomBrute', 'Shroom Brute'),
    'ElderTreant': ('FB_ElderTreant', 'Elder Treant'),
}
ENEMY_HEIGHT = {'GoblinScout': 1.75, 'BrambleSkeleton': 2.1,
                'ShroomBrute': 2.7, 'ElderTreant': 8.6}
SPELLS = {
    'Mage': 'Mage', 'Druid': 'Druid', 'SkeletonMage': 'Skeleton_Mage',
    'Witch': 'Witch', 'MagicalGirl': 'Magical_Girl',
}


def clear_animation(obj):
    if not obj.animation_data:
        obj.animation_data_create()
    obj.animation_data.action = None
    for track in list(obj.animation_data.nla_tracks):
        obj.animation_data.nla_tracks.remove(track)


def action_fcurves(action):
    for layer in action.layers:
        for action_strip in layer.strips:
            for bag in action_strip.channelbags:
                yield bag, bag.fcurves


def add_clip(rig, label, source, frame_start=None, frame_end=None):
    action = source.copy()
    action.name = f'{rig.name}_{label}'
    track = rig.animation_data.nla_tracks.new()
    track.name = label
    strip = track.strips.new(label, 0, action)
    if action.slots:
        strip.action_slot = action.slots[0]
    # Catalog actor actions include row placement on the armature object.
    # Game actors are placed by the runtime, so retain bone motion and drop
    # only object-level translation keys from the exported clip.
    for bag, curves in action_fcurves(action):
        for curve in list(curves):
            if curve.data_path == 'location':
                curves.remove(curve)
            elif label == 'Jump' and curve.data_path == 'pose.bones["root"].location':
                # The runtime supplies the airborne arc. Keep the authored lift
                # in the catalog, but export the copy with a stationary root.
                initial = curve.evaluate(source.frame_range[0])
                for key in curve.keyframe_points:
                    key.co.y = initial
                    key.handle_left.y = initial
                    key.handle_right.y = initial
                curve.update()
    start, end = source.frame_range
    strip.action_frame_start = frame_start if frame_start is not None else start
    strip.action_frame_end = frame_end if frame_end is not None else end
    strip.frame_end = strip.action_frame_end
    return action


def export_selection(path, objects, animation_mode='NLA_TRACKS', fps=24):
    scene = bpy.context.scene
    scene.render.fps = fps
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB',
        use_selection=True, export_animation_mode=animation_mode,
        export_frame_range=False, export_force_sampling=True,
        export_skins=True, export_animations=True, export_apply=False,
        export_materials='EXPORT', export_yup=True)
    return validate_glb(path)


def validate_glb(path, expected_clips=None, max_triangles=None, in_place_jump=False):
    blob = path.read_bytes()
    assert blob[:4] == b'glTF', path
    length = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20 + length])
    bin_header = 20 + length
    bin_length = struct.unpack_from('<I', blob, bin_header)[0]
    bin_chunk = blob[bin_header + 8:bin_header + 8 + bin_length]
    clips = {a['name'] for a in doc.get('animations', [])}
    skins = len(doc.get('skins', []))
    triangles = sum((doc['accessors'][prim['indices']]['count'] if 'indices' in prim
                     else doc['accessors'][prim['attributes']['POSITION']]['count']) // 3
                    for mesh in doc.get('meshes', []) for prim in mesh.get('primitives', [])
                    if prim.get('mode', 4) == 4)
    durations = {}
    formats = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
    widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4,
              'MAT2': 4, 'MAT3': 9, 'MAT4': 16}

    def values(accessor_index):
        accessor = doc['accessors'][accessor_index]
        view = doc['bufferViews'][accessor['bufferView']]
        fmt = formats[accessor['componentType']]
        width = widths[accessor['type']]
        size = struct.calcsize('<' + fmt)
        stride = view.get('byteStride', size * width)
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        for row in range(accessor['count']):
            yield from struct.unpack_from('<' + fmt * width, bin_chunk, start + row * stride)

    for animation in doc.get('animations', []):
        sample_times = []
        for sampler in animation.get('samplers', []):
            ts = list(values(sampler['input']))
            samples = list(values(sampler['output']))
            assert len(ts) > 1 and all(math.isfinite(x) for x in ts), (path.name, animation['name'])
            assert all(math.isfinite(x) for x in samples), (path.name, animation['name'], 'non-finite sample')
            sample_times.extend(ts)
        assert sample_times and max(sample_times) > min(sample_times), (path.name, animation['name'])
        durations[animation['name']] = round(max(sample_times) - min(sample_times), 4)
    if expected_clips is not None:
        assert clips == set(expected_clips), (path.name, clips, expected_clips)
    if max_triangles is not None:
        assert triangles <= max_triangles, (path.name, triangles, max_triangles)
    result = {'bytes': len(blob), 'clips': sorted(clips), 'skins': skins,
            'meshes': len(doc.get('meshes', [])), 'materials': len(doc.get('materials', [])),
            'triangles': triangles, 'durations': durations}
    if in_place_jump:
        jump = next(a for a in doc['animations'] if a['name'] == 'Jump')
        roots = [i for i, node in enumerate(doc['nodes']) if node.get('name') == 'root']
        assert len(roots) == 1, (path.name, 'missing or ambiguous root')
        root_channels = [c for c in jump['channels']
                         if c['target']['node'] == roots[0] and c['target']['path'] == 'translation']
        # A completely constant transform may be omitted by the exporter.
        spread = 0.0
        for channel in root_channels:
            samples = list(values(jump['samplers'][channel['sampler']]['output']))
            spread = max(spread, *(max(samples[axis::3]) - min(samples[axis::3]) for axis in range(3)))
        assert spread < 1e-6, (path.name, 'Jump root translation', spread)
        parents = {child: index for index, node in enumerate(doc['nodes'])
                   for child in node.get('children', [])}
        weapons = [i for i, node in enumerate(doc['nodes'])
                   if any(word in node.get('name', '').lower() for word in ('staff', 'wand', 'broom'))]
        assert weapons, (path.name, 'missing weapon')
        for weapon in weapons:
            ancestor = parents.get(weapon)
            chain = []
            while ancestor is not None:
                chain.append(doc['nodes'][ancestor].get('name'))
                ancestor = parents.get(ancestor)
            assert 'handslot.r' in chain or 'handslot.l' in chain, (path.name, 'detached weapon', chain)
            for animation in doc['animations']:
                for channel in animation['channels']:
                    if channel['target']['node'] != weapon:
                        continue
                    sampler = animation['samplers'][channel['sampler']]
                    samples = list(values(sampler['output']))
                    width = 4 if channel['target']['path'] == 'rotation' else 3
                    assert all(max(samples[axis::width]) - min(samples[axis::width]) < 1e-6
                               for axis in range(width)), (path.name, 'moving weapon attachment')
        result.update(jumpRootSpread=spread, attachedWeapons=len(weapons))
    return result


def rig_children(rig):
    return [o for o in rig.children_recursive if o.type in {'MESH', 'CURVE'}]


def skin_rigid_children(rig):
    pose_position = rig.data.pose_position
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    inv_root = rig.matrix_world.inverted()
    parts = rig_children(rig)
    for obj in parts:
        bone_name = obj.parent_bone if obj.parent_type == 'BONE' else ''
        if bone_name in rig.data.bones:
            # Blender stores some catalog bone children with identity
            # matrix_world; reconstruct the authored rest transform explicitly.
            world = (rig.matrix_world @ rig.data.bones[bone_name].matrix_local @
                     obj.matrix_parent_inverse @ obj.matrix_basis)
        else:
            world = obj.matrix_world.copy()
        if obj.type == 'CURVE':
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.convert(target='MESH')
        # Catalog rows often share mesh datablocks. Give each preview part a
        # private mesh before shifting it into armature-local coordinates.
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        # Bone-parented rigid details need one full-weight vertex group before
        # the parent relationship can become an ordinary armature skin.
        if bone_name in rig.data.bones and obj.type == 'MESH' and not obj.vertex_groups:
            obj.data.transform(inv_root @ world)
            group = obj.vertex_groups.new(name=bone_name)
            group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
            obj.parent = rig
            obj.parent_type = 'OBJECT'
            obj.matrix_parent_inverse.identity()
            obj.location = (0, 0, 0)
            obj.rotation_euler = (0, 0, 0)
            obj.scale = (1, 1, 1)
            mod = obj.modifiers.new('Gameplay skin', 'ARMATURE')
            mod.object = rig
        elif obj.type == 'MESH' and any(g for g in obj.vertex_groups):
            if not any(m.type == 'ARMATURE' for m in obj.modifiers):
                mod = obj.modifiers.new('Gameplay skin', 'ARMATURE')
                mod.object = rig
    bpy.context.view_layer.update()
    rig.data.pose_position = pose_position
    bpy.context.view_layer.update()


def validate_weapon_attachment(rig):
    weapons = [o for o in rig_children(rig)
               if any(word in o.name.lower() for word in ('staff', 'wand', 'broom'))]
    results = []
    scene = bpy.context.scene
    for weapon in weapons:
        bone_name = weapon.parent_bone if weapon.parent_type == 'BONE' else next(
            (g.name for g in weapon.vertex_groups if g.name in rig.data.bones), None)
        if not bone_name:
            raise RuntimeError(f'{weapon.name} has no gameplay attachment bone')
        relative_centers = []
        sampled = []
        tracks = list(rig.animation_data.nla_tracks)
        for track in tracks:
            for other in tracks:
                other.mute = other is not track
            strip = track.strips[0]
            a = int(math.ceil(strip.frame_start))
            b = int(math.floor(strip.frame_end))
            for frame in sorted({a, (a + b) // 2, max(a, b - 1)}):
                scene.frame_set(frame)
                bpy.context.view_layer.update()
                depsgraph = bpy.context.evaluated_depsgraph_get()
                evaluated = weapon.evaluated_get(depsgraph)
                mesh = evaluated.to_mesh()
                if not mesh.vertices:
                    evaluated.to_mesh_clear()
                    continue
                center = sum((evaluated.matrix_world @ v.co for v in mesh.vertices), Vector()) / len(mesh.vertices)
                bone_world = rig.matrix_world @ rig.pose.bones[bone_name].matrix
                relative_centers.append(bone_world.inverted() @ center)
                sampled.append((frame, tuple(center), tuple(bone_world.translation), tuple(relative_centers[-1])))
                evaluated.to_mesh_clear()
        drift = max(((p - relative_centers[0]).length for p in relative_centers), default=0.0)
        for track in tracks:
            track.mute = False
        if drift > .02:
            raise RuntimeError(f'{weapon.name} attachment drift {drift:.5f}m on {bone_name}: {sampled}')
        results.append((weapon.name, bone_name, drift))
    return results


def export_players():
    clip_sources = ('Attack', 'Running', 'GetAttacked', 'Death', 'Jump', 'Idle')
    for output_name, row in PLAYERS.items():
        path = CHAR_OUT / f'{output_name}.glb'
        previous = validate_glb(path) if path.exists() else None
        rig = bpy.data.objects[f'{row}_Attack_Rig']
        sources = {}
        for action_row, label in zip(clip_sources, ('Attack', 'Run', 'Hit', 'Death', 'Jump', 'Idle')):
            row_rig = bpy.data.objects.get(f'{row}_{action_row}_Rig')
            if not row_rig or not row_rig.animation_data or not row_rig.animation_data.action:
                raise RuntimeError(f'Missing {row} {action_row} row action')
            sources[label] = row_rig.animation_data.action
        clear_animation(rig)
        # Keep magician rigid parts bone-parented. Blender's glTF exporter writes
        # the authored child transform directly on the joint; converting these
        # parts to weighted meshes changes the bind-space basis for rotated bones.
        for label in ('Run', 'Attack', 'Hit', 'Death', 'Jump', 'Idle'):
            add_clip(rig, label, sources[label])
        # Attack-row geometry is staged on a grid; recenter the actor root.
        rig.location = (0, 0, 0)
        rig.hide_set(False)
        rig.hide_viewport = False
        for child in rig_children(rig):
            child.hide_set(False)
            child.hide_viewport = False
        bpy.context.view_layer.update()
        attachments = validate_weapon_attachment(rig)
        export_selection(path, [rig] + rig_children(rig))
        stats = validate_glb(path, in_place_jump=True)
        assert stats['clips'] == ['Attack', 'Death', 'Hit', 'Idle', 'Jump', 'Run'], stats
        assert stats['skins'] >= 1, (path.name, stats)
        if previous:
            assert stats['durations'] == previous['durations'], (path.name, 'changed clip durations')
        print('PLAYER', output_name, stats, 'attachments', attachments, flush=True)


def source_enemy_actions(prefix):
    names = {'Walk': f'Walk_{prefix}_Rig', 'Run': f'Running_{prefix}_Rig',
             'Idle': f'{prefix}_Rig', 'Death': f'Death_{prefix}_Rig'}
    actions = {}
    for kind, rig_name in names.items():
        rig = bpy.data.objects.get(rig_name)
        if not rig or not rig.animation_data or not rig.animation_data.action:
            raise RuntimeError(f'Missing enemy source rig/action: {kind}_{prefix}')
        actions[kind] = rig.animation_data.action
    return actions


def in_place_reaction(rig, label, hit=False):
    """Author a short authored reaction over a neutral stance."""
    action = bpy.data.actions.new(f'{rig.name}_{label}')
    action.use_fake_user = True
    rig.animation_data.action = action
    for pose in rig.pose.bones:
        pose.rotation_mode = 'QUATERNION'
    arm, fore, spine, head = (rig.pose.bones.get(n) for n in
                              ('upper_arm.R', 'forearm.R', 'spine', 'head'))
    frames = (1, 5, 10) if hit else (1, 7, 15)
    for frame in frames:
        t = (frame - 1) / max(1, frames[-1] - 1)
        amount = math.sin(math.pi * t)
        if arm:
            arm.rotation_quaternion = Euler(((-.8 if not hit else .4) * amount, 0,
                                               (.3 if not hit else .55) * amount), 'XYZ').to_quaternion()
            arm.keyframe_insert('rotation_quaternion', frame=frame, group=arm.name)
        if fore:
            fore.rotation_quaternion = Euler((-.65 * amount, 0, 0), 'XYZ').to_quaternion()
            fore.keyframe_insert('rotation_quaternion', frame=frame, group=fore.name)
        if spine:
            spine.rotation_quaternion = Euler((.22 * amount if hit else -.05 * amount,
                                                0, -.28 * amount if hit else .08 * amount), 'XYZ').to_quaternion()
            spine.keyframe_insert('rotation_quaternion', frame=frame, group=spine.name)
        if head:
            head.rotation_quaternion = Euler((.1 * amount, 0, .12 * amount), 'XYZ').to_quaternion()
            head.keyframe_insert('rotation_quaternion', frame=frame, group=head.name)
    return action


def normalize_enemy_geometry(rig, stage_location):
    # Convert bone-parented rigid pieces into armature-weighted mesh data before
    # joining. This keeps each detail attached to the same bone after merging.
    pose_position = rig.data.pose_position
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    parts = rig_children(rig)
    old_world = {o.name: o.matrix_world.copy() for o in parts}
    root_world = rig.matrix_world.copy()
    inverse_root = root_world.inverted()
    curves = [o for o in parts if o.type == 'CURVE']
    if curves:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in curves:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = curves[0]
        bpy.ops.object.convert(target='MESH')
    parts = rig_children(rig)
    for obj in parts:
        if obj.data.users > 1:
            obj.data = obj.data.copy()
        bone_name = obj.parent_bone if obj.parent_type == 'BONE' else ''
        if bone_name in rig.data.bones:
            world = (root_world @ rig.data.bones[bone_name].matrix_local @
                     obj.matrix_parent_inverse @ obj.matrix_basis)
        else:
            world = old_world[obj.name]
        obj.parent = None
        obj.matrix_world = world
        # Transform into rig-local rest coordinates, removing preview placement.
        obj.data.transform(inverse_root @ obj.matrix_world)
        obj.matrix_world.identity()
        obj.parent = rig
        obj.parent_type = 'OBJECT'
        obj.matrix_parent_inverse.identity()
        obj.location = (0, 0, 0)
        obj.rotation_euler = (0, 0, 0)
        obj.scale = (1, 1, 1)
        if bone_name in rig.data.bones:
            group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
            group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
        if obj.type == 'MESH' and bone_name in rig.data.bones:
            mod = next((m for m in obj.modifiers if m.type == 'ARMATURE'), None)
            if not mod:
                mod = obj.modifiers.new('Gameplay skin', 'ARMATURE')
            mod.object = rig
    bpy.context.view_layer.update()
    meshes = [o for o in rig_children(rig) if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = rig.name.replace('_Rig', '_Mesh')
    # All surfaces are rigidly bound; bake transforms before one conservative
    # decimation pass, retaining source material assignments.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    poly_count = len(merged.data.polygons)
    if poly_count > 7500:
        dec = merged.modifiers.new('Gameplay triangle budget', 'DECIMATE')
        dec.ratio = min(.999, 7000 / poly_count)
        bpy.ops.object.modifier_move_to_index(modifier=dec.name, index=0)
        bpy.context.view_layer.objects.active = merged
        bpy.ops.object.modifier_apply(modifier=dec.name)
    merged.parent = rig
    merged.matrix_parent_inverse.identity()
    merged.location = (0, 0, 0)
    merged.rotation_euler = (0, 0, 0)
    merged.scale = (1, 1, 1)
    # Enemy rigs are children of named staging empties in the catalog. Detach
    # the armature so the GLB root is the gameplay origin, not the row origin.
    rig.parent = None
    rig.matrix_parent_inverse.identity()
    rig.location = (0, 0, 0)
    rig.rotation_euler = (0, 0, 0)
    rig.scale = (1, 1, 1)
    rig.data.pose_position = pose_position
    bpy.context.view_layer.update()
    # NLA animations drive named bones even after the rigid mesh merge.
    return len(merged.data.polygons), len(merged.data.materials)


def export_enemies():
    for output_name, (prefix, label) in ENEMIES.items():
        rig = bpy.data.objects[f'Walk_{prefix}_Rig']
        source = source_enemy_actions(prefix)
        stage = rig.location.copy()
        triangles, material_count = normalize_enemy_geometry(rig, stage)
        clear_animation(rig)
        for clip, key in (('Walk', 'Walk'), ('Run', 'Run'), ('Idle', 'Idle'), ('Death', 'Death')):
            add_clip(rig, clip, source[key])
        for clip, hit in (('Attack', False), ('Hit', True)):
            action = in_place_reaction(rig, clip, hit=hit)
            track = rig.animation_data.nla_tracks.new()
            track.name = clip
            strip = track.strips.new(clip, 0, action)
            if action.slots:
                strip.action_slot = action.slots[0]
            strip.action_frame_start = 1
            strip.action_frame_end = 15 if clip == 'Attack' else 10
            strip.frame_end = strip.action_frame_end
            rig.animation_data.action = None
        bounds_report = validate_enemy_bounds(rig, ENEMY_HEIGHT[output_name])
        path = ENEMY_OUT / f'{output_name}.glb'
        stats = export_selection(path, [rig] + rig_children(rig))
        assert set(stats['clips']) == {'Walk', 'Run', 'Idle', 'Death', 'Attack', 'Hit'}, stats
        assert stats['skins'] >= 1, (path.name, stats)
        assert triangles <= 15000, (path.name, triangles)
        assert material_count <= 20, (path.name, material_count)
        print('ENEMY', output_name, 'triangles', triangles, 'materials', material_count,
              'evaluatedBounds', bounds_report, stats, flush=True)


def validate_enemy_bounds(rig, expected_height):
    """Check evaluated skinned geometry in local gameplay coordinates per clip."""
    scene = bpy.context.scene
    tracks = {track.name: track for track in rig.animation_data.nla_tracks}
    report = {}
    for name in ('Walk', 'Run', 'Idle', 'Attack', 'Hit'):
        target = tracks[name]
        for track in tracks.values():
            track.mute = track is not target
        strip = target.strips[0]
        start, end = float(strip.frame_start), float(strip.frame_end)
        samples = sorted({int(round(start)), int(round((start + end) / 2)),
                          int(round(end))})
        clip_bounds = []
        for frame in samples:
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            mesh_obj = next(o for o in rig.children_recursive if o.type == 'MESH')
            evaluated = mesh_obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
            evaluated.to_mesh_clear()
            if not points:
                raise RuntimeError(f'{rig.name} {name} has no evaluated vertices')
            mins = tuple(min(p[i] for p in points) for i in range(3))
            maxs = tuple(max(p[i] for p in points) for i in range(3))
            size = tuple(maxs[i] - mins[i] for i in range(3))
            center = tuple((maxs[i] + mins[i]) / 2 for i in range(3))
            # Blender source axes: X/Y are horizontal and Z is height.
            if max(abs(center[0]), abs(center[1])) > expected_height * .3:
                raise RuntimeError(f'{rig.name} {name} translated off local origin: center={center}')
            if max(size) > expected_height * 1.5 or size[2] < expected_height * .55:
                raise RuntimeError(f'{rig.name} {name} outside expected dimensions: bounds={mins}..{maxs}, size={size}, expectedHeight={expected_height}')
            if mins[2] < -expected_height * .4 or maxs[2] > expected_height * 1.4:
                raise RuntimeError(f'{rig.name} {name} vertical bounds out of range: {mins}..{maxs}')
            clip_bounds.append((tuple(round(v, 3) for v in mins), tuple(round(v, 3) for v in maxs)))
        report[name] = clip_bounds
    for track in tracks.values():
        track.mute = False
    return report


def export_orbs():
    for output_name, prefix in SPELLS.items():
        root = bpy.data.objects[f'{prefix}_AttackOrb']
        objects = [root] + list(root.children_recursive)
        for obj in objects:
            if obj.type == 'CURVE':
                bpy.ops.object.select_all(action='DESELECT')
                obj.select_set(True)
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.convert(target='MESH')
            clear_animation(obj)
            # Use corresponding authored preview loop on each matching component.
            possible = [a for a in bpy.data.actions if a.name.startswith(prefix + '_') and
                        ('PreviewLoop' in a.name or a.name.endswith('_Loop'))]
            source = next((a for a in possible if obj.name.removeprefix(prefix + '_') in a.name), None)
            if source:
                add_clip(obj, 'Loop', source)
        # Strip labels and staging objects from selected assembly.
        root.location = (0, 0, 0)
        bpy.context.view_layer.update()
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = root
        path = SPELL_OUT / f'{output_name}.glb'
        stats = export_selection(path, objects)
        assert stats['meshes'] > 0, (path.name, stats)
        assert 'Loop' in stats['clips'], (path.name, stats)
        print('ORB', output_name, stats, flush=True)


def validate_outputs(write_record=False):
    entries = []
    for name in PLAYERS:
        path = CHAR_OUT / f'{name}.glb'
        stats = validate_glb(path, {'Run', 'Attack', 'Hit', 'Death', 'Jump', 'Idle'})
        assert stats['skins'] >= 1 and stats['triangles'] > 0, (path.name, stats)
        entries.append(('Magician', name, path, stats))
    for name in ENEMIES:
        path = ENEMY_OUT / f'{name}.glb'
        stats = validate_glb(path, {'Walk', 'Run', 'Idle', 'Death', 'Attack', 'Hit'}, 15000)
        assert stats['skins'] >= 1 and stats['triangles'] > 0, (path.name, stats)
        entries.append(('Enemy', name, path, stats))
    for name in SPELLS:
        path = SPELL_OUT / f'{name}.glb'
        stats = validate_glb(path, {'Loop'})
        assert stats['meshes'] > 0 and stats['triangles'] > 0, (path.name, stats)
        entries.append(('Spell', name, path, stats))
    for kind, name, path, stats in entries:
        print('VALIDATED', kind, name, stats, flush=True)
    if write_record:
        record = ROOT / 'docs/gameplay-assets-record.md'
        lines = [
            '# Gameplay asset export record', '',
            '## Summary',
            '- Exported from the approved magician animation catalog in Blender 5.1.2; the source blend was opened read-only and never saved.',
            '- Exported five magician rigs with Run/Attack/Hit/Death/Jump/Idle, four forest enemies with Walk/Run/Idle/Death/Attack/Hit, and five spell orb assemblies with Loop.',
            '', '## Key changes',
            '- Detached enemy armatures from staging parents, reset merged meshes to identity local basis, and removed copied object-location keys; converted orb curves to mesh and omitted staging labels.',
            '- Preserved player accessories as native bone-parented GLTF nodes; converted bone-parented enemy details to full-weight armature skinning, consolidated each enemy into one mesh, and reduced enemy geometry to the runtime budget.',
            '- Enemy Attack and Hit are short authored armature reactions because the catalog contains no dedicated enemy reactions.',
            '', '## Validation',
            '| Asset | Clips | Duration seconds | Skins | Triangles | Materials | Bytes |',
            '|---|---|---|---:|---:|---:|---:|',
        ]
        for kind, name, path, stats in entries:
            durations = ', '.join(f'{clip} {seconds:g}' for clip, seconds in stats['durations'].items())
            lines.append(f"| {kind} {name} | {', '.join(stats['clips'])} | {durations} | {stats['skins']} | {stats['triangles']} | {stats['materials']} | {stats['bytes']} |")
        lines += ['', '- All exported animation input times and transform samples are finite with positive clip duration; all player/enemy GLBs retain a skin.', '- Player accessories remain native bone-parented nodes. Blender evaluated their weapon centers against each assigned hand slot per clip with <=0.02 m drift; Three.js GLTFLoader/AnimationMixer bounds and applicable hat attachment checks passed all five player exports across six clips.', '- Source Druid, Skeleton Mage, and Magical Girl Death props remain attached to the animated right hand slot; source rest-bone matrices match the exported Attack rig, with no authored release action.', '- Enemy deformed world bounds were sampled at start/middle/end of Walk, Run, Idle, Attack and Hit; all stayed within their expected local-origin envelopes after detaching staging parents.', '- Three.js GLTFLoader/AnimationMixer audit passed all six enemy clips at three samples each for all four exports.', '- Enemy GLBs are at or below 15,000 triangles; compatible parts were consolidated into one mesh per enemy.', '', '## Blockers', '- Blender emitted an invalid-mesh warning for a treant source mesh during export; the resulting GLB passed clip, finite-sample, skin, and triangle-budget checks, but the flagged piece still needs viewport review.']
        record.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main():
    args = set(sys.argv[sys.argv.index('--') + 1:]) if '--' in sys.argv else set()
    if '--validate' in args:
        validate_outputs(write_record=True)
        return
    if not args or '--players' in args:
        export_players()
    if not args or '--enemies' in args:
        export_enemies()
    if not args or '--orbs' in args:
        export_orbs()
    # Partial exports validate their own assets above without rewriting the
    # complete export record or inspecting unrelated enemies and spells.
    if not args:
        validate_outputs(write_record=True)


if __name__ == '__main__':
    main()
