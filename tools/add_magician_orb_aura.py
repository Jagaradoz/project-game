"""Add one soft aura and one short tapered trail per existing minimal orb."""
import json
import math

import bpy


def loop_action(obj):
    action = obj.animation_data.action
    action.name = obj.name + '_Loop'
    action.use_cyclic = True
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        valid = {i.identifier for i in key.bl_rna.properties['interpolation'].enum_items}
                        assert 'LINEAR' in valid
                        key.interpolation = 'LINEAR'
                    cycle = curve.modifiers.new('CYCLES')
                    valid = {i.identifier for i in cycle.bl_rna.properties['mode_after'].enum_items}
                    assert 'REPEAT' in valid
                    cycle.mode_before = cycle.mode_after = 'REPEAT'


def aura_material(name, color):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, .15)
    valid = {i.identifier for i in mat.bl_rna.properties['surface_render_method'].enum_items}
    assert 'BLENDED' in valid
    mat.surface_render_method = 'BLENDED'
    mat.use_transparency_overlap = False
    mat.use_backface_culling = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = (*color, 1)
    emission.inputs['Strength'].default_value = 1.15
    fresnel = nodes.new('ShaderNodeFresnel')
    fresnel.inputs['IOR'].default_value = 1.2
    strength = nodes.new('ShaderNodeMath')
    valid = {i.identifier for i in strength.bl_rna.properties['operation'].enum_items}
    assert 'MULTIPLY' in valid
    strength.operation = 'MULTIPLY'
    strength.inputs[1].default_value = .38
    mix = nodes.new('ShaderNodeMixShader')
    links.new(fresnel.outputs[0], strength.inputs[0])
    links.new(strength.outputs[0], mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs[0])
    return mat


assert bpy.data.filepath.endswith('magicians_animation_catalog_refined.blend')
gallery = bpy.data.collections['Magician Attack Orbs']
order = ('Mage', 'Druid', 'Skeleton Mage', 'Witch', 'Magical Girl')
roots = sorted([o for o in gallery.objects if o.get('character')],
               key=lambda o: order.index(o['character']))
assert len(roots) == 5
for obj in tuple(gallery.objects):
    if obj.get('orb_aura_trail'):
        data = obj.data
        action = obj.animation_data.action if obj.animation_data else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if action and action.users == 0:
            bpy.data.actions.remove(action)
        if data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            else:
                bpy.data.curves.remove(data)

for i, root in enumerate(roots):
    tag = root['character'].replace(' ', '_')
    accent_mat = bpy.data.materials['Orb_' + tag + '_Accent']
    node = next(n for n in accent_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    color = tuple(node.inputs['Base Color'].default_value[:3])
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=.52)
    aura = bpy.context.object
    aura.name = tag + '_SoftAura'
    for col in tuple(aura.users_collection):
        col.objects.unlink(aura)
    gallery.objects.link(aura)
    aura.parent = root
    aura.location = (0, 0, 0)
    aura['orb_aura_trail'] = True
    aura.data.materials.append(aura_material('Orb_' + tag + '_Aura', color))
    for face in aura.data.polygons:
        face.use_smooth = True

    mat = bpy.data.materials.get('Orb_' + tag + '_Trail') or bpy.data.materials.new('Orb_' + tag + '_Trail')
    mat.use_nodes = True
    node = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Emission Color'].default_value = (*color, 1)
    node.inputs['Emission Strength'].default_value = .5
    node.inputs['Roughness'].default_value = .3
    mat.diffuse_color = (*color, 1)
    data = bpy.data.curves.new(tag + '_Trail', 'CURVE')
    valid = {i.identifier for i in data.bl_rna.properties['dimensions'].enum_items}
    assert '3D' in valid
    data.dimensions = '3D'
    data.bevel_depth = .034
    data.bevel_resolution = 1
    valid = {i.identifier for i in bpy.types.Spline.bl_rna.properties['type'].enum_items}
    assert 'POLY' in valid
    spline = data.splines.new('POLY')
    spline.points.add(20)
    for j, point in enumerate(spline.points):
        t = j / 20
        point.co = (.4 + t*.95, .06*math.sin(t*math.tau + i),
                    .075*math.sin(t*math.pi*1.5 + i)*t, 1)
        point.radius = (1-t)**.8
    trail = bpy.data.objects.new(tag + '_ShortTrail', data)
    gallery.objects.link(trail)
    trail.parent = root
    trail['orb_aura_trail'] = True
    trail['travel_direction'] = '-X; tail points +X'
    data.materials.append(mat)

    for frame in range(39):
        angle = frame*math.tau/38 + i*math.tau/5
        aura.scale = (1 + .055*math.sin(angle),)*3
        aura.keyframe_insert(data_path='scale', frame=frame)
        trail.scale.x = 1 + .12*math.sin(angle)
        trail.rotation_euler.x = .3*math.sin(angle)
        trail.keyframe_insert(data_path='scale', index=0, frame=frame)
        trail.keyframe_insert(data_path='rotation_euler', index=0, frame=frame)
    loop_action(aura)
    loop_action(trail)

bpy.context.scene.frame_set(0)
bpy.ops.object.select_all(action='DESELECT')
print(json.dumps({'auras':5, 'trails':5, 'gallery_objects':len(gallery.objects),
                  'trail_length_world':.95*.65, 'core_radius_world':.44*.65}))
