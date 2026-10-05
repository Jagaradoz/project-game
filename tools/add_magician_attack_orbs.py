"""Five minimal attack orbs in one row left of the magician lineup."""
import json
import math
from pathlib import Path
import runpy
import bpy
from mathutils import Vector

COLLECTION = 'Magician Attack Orbs'
CHARACTERS = ('Mage', 'Druid', 'Skeleton Mage', 'Witch', 'Magical Girl')
COLORS = ((.08,.38,.9),(.16,.6,.12),(.08,.65,.55),(.5,.06,.7),(.95,.15,.4))
ACCENTS = ((.4,.8,1),(.65,.9,.25),(.55,.95,.85),(.95,.4,.08),(1,.75,.2))

def material(name, color, emission=.3):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    node = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = .35
    node.inputs['Metallic'].default_value = 0
    node.inputs['Emission Color'].default_value = (*color, 1)
    node.inputs['Emission Strength'].default_value = emission
    return mat

def link(obj, mat=None, parent=None):
    for col in tuple(obj.users_collection):
        col.objects.unlink(obj)
    gallery.objects.link(obj)
    obj.parent = parent
    if mat:
        obj.data.materials.append(mat)
    return obj

def accent_mesh(name, vertices, faces, mat, parent):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    return link(bpy.data.objects.new(name, data), mat, parent)

def arc(name, mat, parent, start=0, end=math.tau, tilt=0):
    data = bpy.data.curves.new(name, 'CURVE')
    assert '3D' in {i.identifier for i in data.bl_rna.properties['dimensions'].enum_items}
    data.dimensions = '3D'
    data.bevel_depth = .016
    data.bevel_resolution = 1
    assert 'POLY' in {i.identifier for i in bpy.types.Spline.bl_rna.properties['type'].enum_items}
    spline = data.splines.new('POLY')
    spline.points.add(32)
    for i, point in enumerate(spline.points):
        angle = start + (end - start) * i / 32
        point.co = (.6*math.cos(angle), .6*math.sin(angle)*math.sin(tilt),
                    .6*math.sin(angle)*math.cos(tilt), 1)
    spline.use_cyclic_u = end - start == math.tau
    return link(bpy.data.objects.new(name, data), mat, parent)

def label(name, body, position, size):
    data = bpy.data.curves.new(name, 'FONT')
    data.body = body
    data.size = size
    assert 'CENTER' in {i.identifier for i in data.bl_rna.properties['align_x'].enum_items}
    data.align_x = 'CENTER'
    obj = link(bpy.data.objects.new(name, data), white)
    obj.location = position
    obj.rotation_euler = (math.pi/2, 0, 0)


def refine_orbs(roots):
    """Smaller glossy balls, seamless hovering, and one moving accent each."""
    period = 38
    for i, root in enumerate(roots):
        root.scale = (.65, .65, .65)
        root['preview_loop_frames'] = period
        ball = next(o for o in root.children if o.name.endswith('_EnergyBall'))
        accent = next(o for o in root.children if o != ball and not o.get('orb_aura_trail'))
        if len(ball.data.polygons) < 1280:
            old_mesh = ball.data
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=.44)
            temporary = bpy.context.object
            ball.data = temporary.data
            bpy.data.objects.remove(temporary, do_unlink=True)
            if old_mesh.users == 0:
                bpy.data.meshes.remove(old_mesh)
        for face in ball.data.polygons:
            face.use_smooth = True
        for obj in (ball, accent):
            mat = obj.data.materials[0] if obj.data.materials else None
            if obj == ball and mat is None:
                mat = bpy.data.materials['Orb_' + root['character'].replace(' ', '_') + '_Core']
                obj.data.materials.append(mat)
            node = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            node.inputs['Roughness'].default_value = .2 if obj == ball else .25
            node.inputs['Metallic'].default_value = .08
            node.inputs['Coat Weight'].default_value = .25
            node.inputs['Coat Roughness'].default_value = .16
            node.inputs['Emission Strength'].default_value = .03 if obj == ball else .15
        # Sample one complete period without changing the catalog's existing range.
        phase = i * math.tau / 5
        for obj in (root, accent):
            if obj.animation_data:
                previous = obj.animation_data.action
                obj.animation_data_clear()
                if previous and previous.users == 0:
                    bpy.data.actions.remove(previous)
        axis = 0 if i == 0 else 1
        for frame in range(period + 1):
            angle = frame * math.tau / period
            root.location = (-22 + i*2.2 + .12*math.sin(angle + phase),
                             0, 1.25 + .16*math.sin(angle + phase))
            root.keyframe_insert(data_path='location', index=0, frame=frame)
            root.keyframe_insert(data_path='location', index=2, frame=frame)
            accent.rotation_euler[axis] = (.32*math.sin(angle + phase)
                                           if i == 1 else angle*(-1 if i == 3 else 1))
            accent.keyframe_insert(data_path='rotation_euler', index=axis, frame=frame)
        for obj in (root, accent):
            action = obj.animation_data.action
            action.name = obj.name + '_PreviewLoop'
            action.use_cyclic = True
            for layer in action.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        for curve in bag.fcurves:
                            for key in curve.keyframe_points:
                                valid = {v.identifier for v in key.bl_rna.properties['interpolation'].enum_items}
                                assert 'LINEAR' in valid
                                key.interpolation = 'LINEAR'
                            cycle = curve.modifiers.new('CYCLES')
                            valid = {v.identifier for v in cycle.bl_rna.properties['mode_after'].enum_items}
                            assert 'REPEAT' in valid
                            cycle.mode_before = cycle.mode_after = 'REPEAT'

assert bpy.data.filepath.endswith('magicians_animation_catalog_refined.blend')
old = bpy.data.collections.get(COLLECTION)
if old:
    for obj in tuple(old.objects):
        data = obj.data
        action = obj.animation_data.action if obj.animation_data else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if action and action.users == 0:
            bpy.data.actions.remove(action)
        if data and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Curve):
                bpy.data.curves.remove(data)
    bpy.data.collections.remove(old)
gallery = bpy.data.collections.new(COLLECTION)
bpy.context.scene.collection.children.link(gallery)
white = material('Orb Label Ivory', (.8,.85,.95), .1)
roots = []

for i, character in enumerate(CHARACTERS):
    tag = character.replace(' ', '_')
    core = material('Orb_'+tag+'_Core', COLORS[i])
    accent = material('Orb_'+tag+'_Accent', ACCENTS[i], .5)
    root = link(bpy.data.objects.new(tag+'_AttackOrb', None))
    root.location = (-22+i*2.2, 0, 1.25)
    root.empty_display_size = .1
    root['character'] = character
    root['effect'] = ('Arcane ring', 'Leaf', 'Soul wisp', 'Hex crescent', 'Star')[i]
    roots.append(root)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=.44)
    ball = bpy.context.object
    ball.name = tag+'_EnergyBall'
    ball.location = (0,0,0)
    link(ball, core, root)
    for face in ball.data.polygons:
        face.use_smooth = True
    if i == 0:
        arc(tag+'_ArcaneRing', accent, root, tilt=.45)
    elif i == 1:
        accent_mesh(tag+'_Leaf',
                    [(.1,-.39,.25),(.36,-.45,.34),(.52,-.3,.59),
                     (.23,-.31,.53),(.3,-.48,.45)],
                    [(0,1,4),(1,2,4),(2,3,4),(3,0,4)], accent, root)
    elif i == 2:
        arc(tag+'_SoulWisp', accent, root, start=.1, end=4.9, tilt=-.3)
    elif i == 3:
        arc(tag+'_HexCrescent', accent, root, start=1.6, end=4.7)
    else:
        vertices = []
        for j in range(10):
            angle = math.pi/2+j*math.tau/10
            radius = .18 if j%2 == 0 else .075
            vertices.append((radius*math.cos(angle),-.445,radius*math.sin(angle)))
        accent_mesh(tag+'_Star', vertices, [tuple(range(9,-1,-1))], accent, root)
    label(tag+'_OrbOwner', character, (-22+i*2.2,0,2.15), .24)
label('Attack_Orb_Gallery_Header', 'ATTACK ORBS', (-17.6,0,3), .4)
refine_orbs(roots)
runpy.run_path(str(Path(bpy.data.filepath).parents[5] / 'tools' / 'add_magician_orb_aura.py'))
bpy.ops.object.select_all(action='DESELECT')
roots[0].select_set(True)
bpy.context.view_layer.objects.active = roots[0]
bpy.context.scene.frame_set(23)
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        space = area.spaces.active
        space.region_3d.view_location = (-9,10,1.5)
        space.region_3d.view_distance = 35
        space.region_3d.view_rotation = Vector((0,-42,24)).to_track_quat('Z','Y')
        assert 'ORTHO' in {i.identifier for i in space.region_3d.bl_rna.properties['view_perspective'].enum_items}
        space.region_3d.view_perspective = 'ORTHO'
        space.overlay.show_extras = False
print(json.dumps({'gallery_objects':len(gallery.objects),
                  'orbs':[(o.name,list(o.location),o['effect']) for o in roots]}))
