"""Repair inherited Running keys in the five catalog Jump actions.

Run Blender in background with the refined catalog and --python this_file,
followed by -- --repair, --validate, or --record-exports. No live session is used.
"""
from datetime import datetime
from pathlib import Path
import importlib.util
import json
import math
import shutil
import sys

import bpy

ROOT = Path(__file__).resolve().parents[1]
ROWS = ('Mage', 'Druid', 'Skeleton Mage', 'Witch', 'Magical Girl')
RECORD = ROOT / 'docs/jump-assets-record.md'
SUBSTEPS = 8


def curves(action):
    return [curve for layer in action.layers for strip in layer.strips
            for bag in strip.channelbags for curve in bag.fcurves]


def integer_key(key):
    return abs(key.co.x - round(key.co.x)) < 1e-4


def signature(action):
    return [(curve.data_path, curve.array_index,
             [(tuple(key.co), tuple(key.handle_left), tuple(key.handle_right),
               key.interpolation, key.handle_left_type, key.handle_right_type)
              for key in curve.keyframe_points]) for curve in curves(action)]


def repair_action(action):
    before = {(c.data_path, c.array_index): [tuple(k.co) for k in c.keyframe_points if integer_key(k)]
              for c in curves(action)}
    removed = 0
    held_channels = 0
    for curve in curves(action):
        for index in range(len(curve.keyframe_points) - 1, -1, -1):
            if not integer_key(curve.keyframe_points[index]):
                curve.keyframe_points.remove(curve.keyframe_points[index], fast=True)
                removed += 1
        # Untouched controls only retain equal boundary keys. Their intervening
        # Running keys are removed too, making these channels a stable hold.
        points = curve.keyframe_points
        if len(points) == 2 and abs(points[0].co.y - points[1].co.y) < 1e-6:
            held_channels += 1
        for key in points:
            key.interpolation = 'BEZIER'
            key.handle_left_type = 'AUTO_CLAMPED'
            key.handle_right_type = 'AUTO_CLAMPED'
        curve.update()
        assert [tuple(k.co) for k in points] == before[(curve.data_path, curve.array_index)]
    return removed, held_channels


def validate_source(rig):
    # Hidden catalog rows do not update rigid child world matrices. Enable only
    # this actor while sampling, then restore its exact visibility settings.
    objects = [rig] + list(rig.children_recursive)
    visibility = [(obj, obj.hide_get(), obj.hide_viewport) for obj in objects]
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
    try:
        return validate_visible_source(rig)
    finally:
        for obj, hidden, viewport_hidden in visibility:
            obj.hide_set(hidden)
            obj.hide_viewport = viewport_hidden


def validate_visible_source(rig):
    action = rig.animation_data.action
    fcurves = curves(action)
    assert tuple(action.frame_range) == (0.0, 19.0), (rig.name, action.frame_range)
    assert all(integer_key(k) for c in fcurves for k in c.keyframe_points), rig.name
    assert all(k.interpolation == 'BEZIER' and k.handle_left_type == 'AUTO_CLAMPED'
               and k.handle_right_type == 'AUTO_CLAMPED'
               for c in fcurves for k in c.keyframe_points), rig.name
    max_curve_step = 0.0
    for curve in fcurves:
        samples = [curve.evaluate(i / SUBSTEPS) for i in range(19 * SUBSTEPS + 1)]
        assert all(math.isfinite(value) for value in samples), (rig.name, curve.data_path)
        max_curve_step = max(max_curve_step, *(abs(b - a) for a, b in zip(samples, samples[1:])))
    assert max_curve_step < .2, (rig.name, 'curve step', max_curve_step)
    weapons = [obj for obj in rig.children_recursive
               if any(word in obj.name.lower() for word in ('staff', 'wand', 'broom'))]
    assert weapons and all(obj.parent_type == 'BONE' and obj.parent_bone in ('handslot.r', 'handslot.l')
                           for obj in weapons), (rig.name, 'source weapon parent')
    previous = None
    initial_attachments = {}
    max_position_step = max_rotation_step = attachment_drift = 0.0
    root_heights = []
    scene = bpy.context.scene
    for index in range(19 * SUBSTEPS + 1):
        time = index / SUBSTEPS
        scene.frame_set(int(time), subframe=time % 1)
        bpy.context.view_layer.update()
        pose = {bone.name: (bone.matrix.translation.copy(), bone.matrix.to_quaternion())
                for bone in rig.pose.bones}
        assert all(math.isfinite(value) for bone in rig.pose.bones
                   for row in bone.matrix for value in row), rig.name
        if previous:
            for name, (position, rotation) in pose.items():
                old_position, old_rotation = previous[name]
                max_position_step = max(max_position_step, (position - old_position).length)
                angle = 2 * math.acos(min(1.0, abs(rotation.normalized().dot(old_rotation.normalized()))))
                max_rotation_step = max(max_rotation_step, angle)
        previous = pose
        root_heights.append(pose['root'][0].z)
        for weapon in weapons:
            bone_world = rig.matrix_world @ rig.pose.bones[weapon.parent_bone].matrix
            relative = bone_world.inverted() @ weapon.matrix_world
            initial = initial_attachments.setdefault(weapon.name, relative.copy())
            attachment_drift = max(attachment_drift, max(abs(relative[r][c] - initial[r][c])
                                                       for r in range(4) for c in range(4)))
    assert max_position_step < .2 and max_rotation_step < .35, (
        rig.name, 'subframe displacement', max_position_step, max_rotation_step)
    assert attachment_drift < 1e-4, (rig.name, 'attachment drift', attachment_drift)
    lift = max(root_heights) - min(root_heights)
    assert lift > .5, (rig.name, 'source lift removed', lift)
    return {'keys': sum(len(c.keyframe_points) for c in fcurves),
            'samples': 19 * SUBSTEPS + 1, 'curveStep': max_curve_step,
            'bonePositionStep': max_position_step, 'boneRotationStep': max_rotation_step,
            'weaponMatrixDrift': attachment_drift, 'rootLift': lift}


def record_exports():
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location('gameplay_export', ROOT / 'tools/export_gameplay_assets.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    lines = ['', '- Export validation: all five retain six clips, skins and finite transform samples; export compared every clip duration with its previous GLB.', '',
             '| Player | Jump duration (s) | Root translation spread | Weapons attached | Skins |',
             '|---|---:|---:|---:|---:|']
    for name in module.PLAYERS:
        stats = module.validate_glb(module.CHAR_OUT / f'{name}.glb',
                                    {'Attack', 'Run', 'Hit', 'Death', 'Jump', 'Idle'}, in_place_jump=True)
        assert stats['skins'] >= 1
        lines.append(f"| {name} | {stats['durations']['Jump']} | {stats['jumpRootSpread']:.2g} | {stats['attachedWeapons']} | {stats['skins']} |")
        print('EXPORT_VALIDATED', name, json.dumps(stats), flush=True)
    lines += ['', '- Blender evaluated exported weapon centers across all six clips with attachment drift below 0.02 m; GLB weapons remain descendants of a hand slot with static local transforms.',
              '- Enemies, spells and their execution record were not exported or rewritten.',
              '- Blockers: live Blender viewport and gameplay visual review are handled by the supervisor.']
    with RECORD.open('a', encoding='utf-8') as handle:
        handle.write('\n'.join(lines) + '\n')


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if '--record-exports' in args:
        record_exports()
        return
    repair = '--repair' in args
    scene = bpy.context.scene
    frame, subframe = scene.frame_current, scene.frame_subframe
    backup = None
    untouched = {(row, kind): signature(bpy.data.objects[f'{row}_{kind}_Rig'].animation_data.action)
                 for row in ROWS for kind in ('Running', 'Idle')}
    if repair:
        source = Path(bpy.data.filepath)
        expected = ROOT / 'public/assets/models/blender/magicians/magicians_animation_catalog_refined.blend'
        assert source.resolve() == expected.resolve(), ('Unexpected repair source', source)
        backup_folder = Path.home() / '.codex/backups/project-game'
        backup_folder.mkdir(parents=True, exist_ok=True)
        backup = backup_folder / f'{source.stem}-{datetime.now():%Y%m%d-%H%M%S}.blend'
        shutil.copy2(source, backup)
    reports = []
    try:
        for row in ROWS:
            rig = bpy.data.objects[f'{row}_Jump_Rig']
            removed, held = repair_action(rig.animation_data.action) if repair else (0, 0)
            stats = validate_source(rig)
            reports.append((row, removed, held, stats))
            print('SOURCE_VALIDATED', row, removed, held, json.dumps(stats), flush=True)
        assert all(signature(bpy.data.objects[f'{row}_{kind}_Rig'].animation_data.action) == original
                   for (row, kind), original in untouched.items()), 'Running or Idle changed'
    finally:
        scene.frame_set(frame, subframe=subframe)
    if repair:
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
        lines = ['# Jump asset execution record', '', f'- Preserved original source: `{backup}`.',
                 '- Repaired only five Jump actions: removed inherited fractional Running keys, retained every integer pose and frame range 0-19, and applied Bezier AUTO_CLAMPED handles.',
                 '- Untouched control channels now hold their equal boundary values; source root lift remains for catalog preview. Running and Idle action signatures are unchanged.',
                 '- Source validation: 153 samples per character at 1/8-frame spacing; all transforms finite, bone displacement below 0.2 m and rotation below 0.35 rad per sample; weapon attachment drift below 0.0001.',
                 '', '| Character | Removed keys | Held channels | Retained keys | Max bone step (m) | Max rotation step (rad) | Source lift (m) |',
                 '|---|---:|---:|---:|---:|---:|---:|']
        for row, removed, held, stats in reports:
            lines.append(f"| {row} | {removed} | {held} | {stats['keys']} | {stats['bonePositionStep']:.5f} | {stats['boneRotationStep']:.5f} | {stats['rootLift']:.5f} |")
        RECORD.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        print('BACKUP', str(backup), flush=True)


if __name__ == '__main__':
    main()
