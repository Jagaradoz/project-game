"""Export the approved Blender catalog as game-ready Run/Attack GLBs.

Run with Blender --background magicians_animation_catalog_refined.blend
--python tools/export_magician_game_clips.py. The source blend is never saved.
"""
from pathlib import Path
import json
import struct
import bpy

root = Path(bpy.data.filepath).resolve().parents[3]
output = root / 'public/assets/models/characters/animated'
output.mkdir(parents=True, exist_ok=True)
characters = ('Mage', 'Druid', 'Skeleton Mage', 'Witch', 'Magical Girl')
scene = bpy.context.scene
scene.frame_start = 0
scene.frame_end = 38

for name in characters:
    rig = bpy.data.objects[name + '_Attack_Rig']
    run = bpy.data.objects[name + '_Running_Rig'].animation_data.action
    attack = rig.animation_data.action
    data = rig.animation_data
    data.action = None
    for track in list(data.nla_tracks):
        data.nla_tracks.remove(track)
    for label, source in (('Run', run), ('Attack', attack)):
        action = source.copy()
        action.name = name.replace(' ', '') + '_' + label
        track = data.nla_tracks.new()
        track.name = label
        strip = track.strips.new(label, 0, action)
        if action.slots:
            strip.action_slot = action.slots[0]
        strip.action_frame_start = 0
        strip.action_frame_end = 19 if label == 'Run' else 38
        strip.frame_end = strip.action_frame_end
    rig.location = (0, 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    rig.hide_set(False)
    rig.hide_viewport = False
    rig.select_set(True)
    for child in rig.children_recursive:
        if not child.hide_render:
            child.hide_set(False)
            child.select_set(True)
    bpy.context.view_layer.objects.active = rig
    scene.frame_set(0)
    path = output / (name.replace(' ', '') + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB',
        use_selection=True, export_animation_mode='NLA_TRACKS',
        export_frame_range=False, export_force_sampling=True,
        export_skins=True, export_animations=True)
    blob = path.read_bytes()
    length = struct.unpack_from('<I', blob, 12)[0]
    document = json.loads(blob[20:20 + length])
    clips = {a['name'] for a in document.get('animations', [])}
    assert clips == {'Run', 'Attack'}, (name, clips)
    assert document.get('skins'), name
    print('Verified export:', path.name, sorted(clips), len(blob), 'bytes')
