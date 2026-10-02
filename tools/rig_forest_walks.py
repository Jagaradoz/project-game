"""Rig the four forest characters and author looping in-place Walk actions.
Run: blender --background public/assets/models/forest_selected_characters.blend --python tools/rig_forest_walks.py
Source blend and hidden original Goblin collection are preserved.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/models/forest_characters_rigged_walk.blend'
PREVIEW = ROOT / 'public/assets/models/forest_walk_preview'
PREVIEW.mkdir(exist_ok=True)
CONFIGS = [
 dict(root='F02_BrambleSkeleton', label='Bramble Skeleton', period=32, hip=(0,0,.92), neck=1.57, top=2.1, leg=[(.13,0,.9),(.14,-.05,.5),(.14,-.02,.09)], arms=[[(.3,.02,1.49),(.42,-.05,1.17),(.4,-.4,1.1)],[(-.3,.02,1.49),(-.37,0,1.13),(-.4,-.12,.79)]], stride=.13,lift=.09,sway=.017,bob=.017),
 dict(root='F03_ShroomBrute', label='Shroom Brute', period=40, hip=(0,0,.59), neck=1.61, top=2.7, leg=[(.32,-.02,.60),(.35,-.07,.34),(.37,-.14,.13)], arms=[[(.6,-.02,1.12),(.98,-.12,.82),(1,-.55,.66)],[(-.6,-.02,1.12),(-.95,-.1,.8),(-1.03,-.32,.42)]],stride=.11,lift=.08,sway=.045,bob=.018),
 dict(root='F04_GoblinScout', label='Goblin Scout', period=28, hip=(0,0,.51), neck=1.055, top=1.75, leg=[(.12,0,.51),(.12,-.035,.345),(.12,-.01,.17)], arms=[[(.216,.005,.963),(.304,-.008,.769),(.412,-.193,.906)],[(-.216,0,.963),(-.292,-.008,.769),(-.312,-.114,.56)]],stride=.095,lift=.075,sway=.012,bob=.012),
 dict(root='FB_ElderTreant', label='Elder Treant', period=56, hip=(0,0,1.7), neck=4.7, top=8.6, leg=[(.5,0,1.7),(.72,-.2,.95),(.82,-.25,.32)], arms=[[(.95,.05,4.25),(2.1,-.25,3),(2.25,-.9,2)],[(-.95,.05,4.25),(-2.1,-.25,3),(-2.25,-.9,2)]],stride=.25,lift=.16,sway=.07,bob=.03),
]

def center(o, root):
    return sum((root.matrix_world.inverted() @ o.matrix_world @ Vector(c) for c in o.bound_box),Vector()) / 8

def curves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves

def bind_bone(o, rig, name):
    world = o.matrix_world.copy()
    o.parent = rig
    o.parent_type = 'BONE'
    o.parent_bone = name
    bpy.context.view_layer.update()
    o.matrix_world = world
    o['rig_binding'] = name


def classify(o, root, c):
    n = o.name.lower()
    p = center(o,root)
    side = '.L' if p.x < 0 else '.R'
    kind = c['root']
    if any(w in n for w in ('club','spear','socketrivet','grip')):
        return 'hand.R'
    if kind == 'F02_BrambleSkeleton':
        if '_thorns' in n: return 'deform_thorns'
        if 'vineshin' in n: return 'shin'+side
        if 'vinethigh' in n: return 'thigh'+side
        if 'vinearm' in n: return ('upper_arm' if p.z>1.15 else 'forearm')+side
        if 'vinetrail' in n: return 'hand.L'
        if 'vineneck' in n: return 'head'
        if any(w in n for w in ('metatarsal','toe','heel','mossfoot')): return 'foot'+side
        if any(w in n for w in ('tibia','fibula','kneecap')): return 'shin'+side
        if 'femur' in n: return 'thigh'+side
        if any(w in n for w in ('ilium','pelvis','hipsocket')): return 'hips'
        if any(w in n for w in ('humerus','mossshoulder')): return 'upper_arm'+side
        if any(w in n for w in ('radius','ulna')): return 'forearm'+side
        if any(w in n for w in ('finger','thumb','palm','wrist','hand')): return 'hand'+side
        return 'head' if p.z > 1.58 else 'spine'
    if kind == 'F03_ShroomBrute':
        if any(w in n for w in ('foot','toe','mycelium')): return 'foot'+side
        if '_leg' in n: return 'deform_leg'+side
        if '_arm' in n: return ('forearm' if '_fore' in n else 'upper_arm')+side
        if any(w in n for w in ('fist','knuckle')): return 'hand'+side
        if any(w in n for w in ('cap','gill','wart','babya','babyb','babyc')): return 'canopy'
        return 'spine'
    if kind == 'F04_GoblinScout':
        if any(w in n for w in ('boot','lace','cuff upper','toe seam')): return 'foot'+side
        if '_leg' in n: return 'deform_leg'+side
        if '_knee' in n: return 'shin'+side
        if any(w in n for w in ('upperarm','shoulder leather','shoulder cap','shoulder small')): return 'upper_arm'+side
        if any(w in n for w in ('forearm','bracer','elbow')): return 'forearm'+side
        if any(w in n for w in ('finger','thumb','relaxedhand')): return 'hand'+side
        if any(w in n for w in ('belt','buckle','pouch','skirt','panel scalloped')): return 'hips'
        if any(w in n for w in ('tunic','vest','mantle','neckline','torso','leafvein','oakleaf')): return 'spine'
        return 'head' if p.z > 1.045 else 'spine'
    if any(w in n for w in ('_foot','_root')): return 'foot'+side
    if '_legupper' in n: return 'thigh'+side
    if any(w in n for w in ('leglower','kneeknot')): return 'shin'+side
    if any(w in n for w in ('finger','thumb','palm')): return 'hand'+side
    if any(w in n for w in ('_arm','elbow','shoulder','_twig','_toad')):
        return ('forearm' if p.z < 3.05 else 'upper_arm')+side
    if any(w in n for w in ('canopy','branch','vine','firefly')): return 'canopy'
    return 'spine'


def skin_thorns(o, rig, root, c, parts):
    # Each thorn is a disconnected component: bind the complete thorn rigidly
    # to its nearest named vine, so the combined mesh follows every host limb.
    targets=[(center(v,root),classify(v,root,c)) for v in parts if '_vine' in v.name.lower()]
    transform=rig.matrix_world.inverted() @ o.matrix_world
    adjacent={v.index:[] for v in o.data.vertices}
    for e in o.data.edges:
        a,b=e.vertices;adjacent[a].append(b);adjacent[b].append(a)
    remaining=set(adjacent)
    groups={}
    while remaining:
        seed=remaining.pop();component=[seed];stack=[seed]
        while stack:
            for n in adjacent[stack.pop()]:
                if n in remaining:remaining.remove(n);component.append(n);stack.append(n)
        mid=sum((transform @ o.data.vertices[i].co for i in component),Vector())/len(component)
        name=min(targets,key=lambda t:(mid-t[0]).length_squared)[1]
        if name not in groups:groups[name]=o.vertex_groups.new(name=name)
        groups[name].add(component,1.0,'REPLACE')
    mod=o.modifiers.new('Thorns follow host vines','ARMATURE');mod.object=rig
    o['rig_binding']='Rigid thorn islands: '+', '.join(sorted(groups))


def rig_character(c):
    root = bpy.data.objects[c['root']]
    parts = [o for o in root.children_recursive if o.type in {'MESH','CURVE'} and not o.hide_get() and not o.hide_render]
    rest = {o.name:o.matrix_world.copy() for o in parts}
    ad = bpy.data.armatures.new(c['root']+'_Skeleton')
    rig = bpy.data.objects.new(c['root']+'_Rig',ad)
    root.users_collection[0].objects.link(rig)
    rig.parent = root
    rig.show_in_front = True
    rig.display_type = 'WIRE'
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    def bone(name, head, tail, parent=None):
        b=ad.edit_bones.new(name); b.head=head; b.tail=tail
        if parent: b.parent=ad.edit_bones[parent]
        return b
    hip=Vector(c['hip']); neck=c['neck']
    bone('root',(0,0,0),(0,0,.15))
    bone('hips',hip,hip+Vector((0,0,.15)),'root')
    bone('spine',hip,(0,0,neck),'hips')
    bone('head',(0,0,neck),(0,0,neck+.25),'spine')
    bone('canopy',(0,0,neck),(0,0,c['top']),'head')
    for s,sign in [('.R',1),('.L',-1)]:
        leg=[Vector((p[0]*sign,p[1],p[2])) for p in c['leg']]
        bone('thigh'+s,leg[0],leg[1],'hips')
        bone('shin'+s,leg[1],leg[2],'thigh'+s)
        bone('foot'+s,leg[2],leg[2]+Vector((0,-.15,0)),'shin'+s)
        arm=list(map(Vector,c['arms'][0 if sign==1 else 1]))
        bone('upper_arm'+s,arm[0],arm[1],'spine')
        bone('forearm'+s,arm[1],arm[2],'upper_arm'+s)
        bone('hand'+s,arm[2],arm[2]+Vector((0,-.09,-.05)),'forearm'+s)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()
    counts={}
    for o in parts:
        name=classify(o,root,c)
        counts[name]=counts.get(name,0)+1
        if name == 'deform_thorns':
            skin_thorns(o, rig, root, c, parts)
        elif name.startswith('deform_leg'):
            s=name[-2:]; knee=c['leg'][1][2]; width=.12 if 'Shroom' in c['root'] else .07
            high=o.vertex_groups.new(name='thigh'+s); low=o.vertex_groups.new(name='shin'+s)
            transform=rig.matrix_world.inverted() @ o.matrix_world
            for v in o.data.vertices:
                z=(transform @ v.co).z
                w=max(0,min(1,(z-knee)/width+.5))
                if w: high.add([v.index],w,'REPLACE')
                if w<1: low.add([v.index],1-w,'REPLACE')
            mod=o.modifiers.new('Walk leg deformation','ARMATURE');mod.object=rig
            o['rig_binding']='thigh'+s+' + shin'+s
        else:
            bind_bone(o,rig,name)
    bpy.context.view_layer.update()
    error=max(max(abs(o.matrix_world[r][k]-rest[o.name][r][k]) for r in range(4) for k in range(4)) for o in parts)
    assert error < 1e-4, (c['label'],error)
    rig['walk_notes']='In-place walk; feet solve a planted stance and lifted swing. Root stays stationary. Select bones in Pose Mode to edit.'
    rig['cycle_frames']=c['period']
    c.update(rig=rig,parts=parts,bindings=counts,rest_error=error)
    return rig


def orient_bone(rig,name,head,tail):
    b=rig.data.bones[name]
    rot=(b.tail_local-b.head_local).rotation_difference(tail-head)
    m=rot.to_matrix().to_4x4() @ b.matrix_local
    m.translation=head
    rig.pose.bones[name].matrix=m
    bpy.context.view_layer.update()


def animate(c):
    rig=c['rig']; period=c['period']
    action=bpy.data.actions.new('Walk_'+c['label'].replace(' ','_'))
    action.use_fake_user=True;action.use_cyclic=True
    rig.animation_data_create();rig.animation_data.action=action
    for p in rig.pose.bones: p.rotation_mode='QUATERNION'
    for frame in range(1,period+2):
        t=2*math.pi*(frame-1)/period
        for p in rig.pose.bones: p.matrix_basis=Matrix.Identity(4)
        shift=Vector((c['sway']*math.sin(t),0,-c['bob']*(1+math.cos(2*t))-.02))
        # Hip translation is defined in armature space, independent of bone axes.
        h=rig.data.bones['hips'].matrix_local.copy();h.translation+=shift
        rig.pose.bones['hips'].matrix=h
        bpy.context.view_layer.update()
        for name,angles in [('spine',(.018*math.sin(t),.018*math.sin(t),.025*math.sin(t))),('head',(-.012*math.sin(t-.4),0,-.012*math.sin(t))),('canopy',(.018*math.sin(t-.8),0,.018*math.sin(t-.5)))]:
            from mathutils import Euler
            rig.pose.bones[name].rotation_quaternion=Euler(angles,'XYZ').to_quaternion()
        bpy.context.view_layer.update()
        for side,sign in [('.R',1),('.L',-1)]:
            u=((frame-1)/period+(0 if sign==1 else .5))%1
            # Constant backwards ground speed in stance; smooth return with clearance in swing.
            if u<.5: y=c['stride']*(-1+4*u); lift=0
            else:
                q=(u-.5)*2
                y=c['stride']*(1-2*(3*q*q-2*q*q*q));lift=c['lift']*math.sin(math.pi*q)**2
            a=rig.pose.bones['hips'].matrix @ (rig.data.bones['hips'].matrix_local.inverted() @ rig.data.bones['thigh'+side].head_local)
            foot=rig.data.bones['foot'+side].head_local+Vector((0,y,lift))
            l1=rig.data.bones['thigh'+side].length;l2=rig.data.bones['shin'+side].length
            delta=foot-a;dist=min(delta.length,l1+l2-1e-5);axis=delta.normalized()
            along=(l1*l1-l2*l2+dist*dist)/(2*dist)
            forward=Vector((0,-1,0));forward=(forward-axis*forward.dot(axis)).normalized()
            knee=a+axis*along+forward*math.sqrt(max(0,l1*l1-along*along))
            orient_bone(rig,'thigh'+side,a,knee)
            orient_bone(rig,'shin'+side,knee,foot)
            # Feet remain flat throughout stance; swing toes lift slightly.
            footmat=rig.data.bones['foot'+side].matrix_local.copy();footmat.translation=foot
            rig.pose.bones['foot'+side].matrix=footmat
            swing=-math.cos(t+(0 if sign==1 else math.pi))
            amplitude=.065 if sign==1 else .16
            if 'Treant' in c['root']: amplitude=.10
            rig.pose.bones['upper_arm'+side].rotation_quaternion=Euler((amplitude*swing,0,.015*math.sin(t)),'XYZ').to_quaternion()
            rig.pose.bones['forearm'+side].rotation_quaternion=Euler((.035*math.sin(t-.5)*sign,0,0),'XYZ').to_quaternion()
            bpy.context.view_layer.update()
        for p in rig.pose.bones:
            if p.name=='root':continue
            p.keyframe_insert('location',frame=frame,group=p.name)
            p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)
            p.keyframe_insert('scale',frame=frame,group=p.name)
    for fc in curves(action):
        fc.modifiers.new('CYCLES')
        for key in fc.keyframe_points: key.interpolation='LINEAR'
    c['action']=action
    bpy.context.scene.frame_set(1)
    def sample(frame):
        bpy.context.scene.frame_set(frame)
        return {p.name:p.matrix.copy() for p in rig.pose.bones}
    start=sample(1);end=sample(period+1);repeat=sample(3*period+1);mid=sample(1+period//4)
    def diff(a,b):return max(abs(a[n][r][k]-b[n][r][k]) for n in a for r in range(4) for k in range(4))
    c['seam_error']=diff(start,end);c['repeat_error']=diff(start,repeat);c['motion']=diff(start,mid)
    assert c['seam_error']<1e-4 and c['repeat_error']<1e-4 and c['motion']>.01
    print('VALIDATED',c['label'],len(c['parts']),c['rest_error'],c['seam_error'],c['repeat_error'],c['motion'],flush=True)


def repair_vines():
    # Fast repair path for an already authored output, without rebuilding actions.
    c=CONFIGS[0];root=bpy.data.objects[c['root']];rig=bpy.data.objects[c['root']+'_Rig']
    parts=[o for o in bpy.data.objects if o.name.startswith(c['root']+'_') and o.type in {'MESH','CURVE'}]
    rig.data.pose_position='REST';bpy.context.view_layer.update()
    changed=0
    for o in parts:
        if '_vine' in o.name.lower():
            bind_bone(o,rig,classify(o,root,c));changed+=1
    o=bpy.data.objects[c['root']+'_Thorns'];world=o.matrix_world.copy()
    o.parent=root;o.parent_type='OBJECT';o.parent_bone='';o.matrix_world=world
    bpy.context.view_layer.update()
    skin_thorns(o,rig,root,c,parts)
    rig.data.pose_position='POSE'
    scene=bpy.context.scene;scene.frame_preview_end=1120
    cam=scene.camera
    for label,f in [('contact',1),('passing',9)]:
        scene.frame_set(f);scene.render.filepath=str(PREVIEW/(label+'.png'));bpy.ops.render.render(write_still=True)
    x=root.matrix_world.translation.x;h=c['top']
    cam.location=(x+h*.85,-h*3,h*1.3);target=Vector((x,0,h*.49));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=h*1.48
    scene.render.resolution_x=800;scene.render.resolution_y=900
    for label,f in [('contact',1),('passing',9)]:
        scene.frame_set(f);scene.render.filepath=str(PREVIEW/(c['root']+'_'+label+'.png'));bpy.ops.render.render(write_still=True)
    cam.location=(8,-25,9);cam.rotation_euler=(Vector((7.6,0,4.25))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=19
    scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.frame_set(1)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
    record=ROOT/'docs/forest-rig-walk-validation.md'
    text=record.read_text(encoding='utf-8').replace('- Contact and passing previews',f'- Corrected {changed} skeleton vine pieces and bound disconnected thorn islands to their host vines; rerendered affected previews.\n- Collective preview range is 1120 frames (common cycle length).\n- Contact and passing previews')
    record.write_text(text,encoding='utf-8')
    print('VINE REPAIR SAVED',changed,flush=True)


def main():
    for config in CONFIGS:
        rig_character(config)
        animate(config)

    scene=bpy.context.scene
    scene.render.fps=24;scene.frame_start=1;scene.frame_end=1120
    scene.use_preview_range=True;scene.frame_preview_start=1;scene.frame_preview_end=1120
    scene.timeline_markers.clear()
    for f,n in [(1,'CONTACT'),(8,'PASSING / SCOUT'),(15,'OPPOSITE CONTACT / SCOUT'),(29,'SCOUT LOOP'),(33,'SKELETON LOOP'),(41,'SHROOM LOOP'),(57,'TREANT LOOP')]:scene.timeline_markers.new(n,frame=f)
    backup=bpy.data.collections['Goblin Scout | Original backup']
    assert backup.hide_viewport and backup.hide_render

    # Renderable inspection scene, isolated in its own collection.
    coll=bpy.data.collections.new('Walk Preview | Cameras and Lighting');scene.collection.children.link(coll)
    cam_data=bpy.data.cameras.new('Walk Review Camera');cam=bpy.data.objects.new('Walk Review Camera',cam_data);coll.objects.link(cam);scene.camera=cam
    cam_data.type='ORTHO';cam.location=(8,-25,9);target=Vector((7.6,0,4.25));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.ortho_scale=19
    scene.render.engine='CYCLES';scene.cycles.samples=16
    scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
    scene.world.color=(.16,.16,.16)
    for name,loc,power,size in [('Key',(2,-10,12),1800,8),('Fill',(14,-6,8),1300,7),('Rim',(9,5,12),2200,8)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        light=bpy.data.objects.new(name,data);coll.objects.link(light);light.location=loc;light.rotation_euler=(Vector((7,0,3))-light.location).to_track_quat('-Z','Y').to_euler()
    scene.view_settings.view_transform='AgX'
    # Use the visible material colors and existing smooth geometry without adding new model parts.
    for label,frame in [('contact',1),('passing',9)]:
        scene.frame_set(frame);scene.render.filepath=str(PREVIEW/(label+'.png'));bpy.ops.render.render(write_still=True)
    # Individual three-quarter views make the small characters inspectable.
    for c in CONFIGS:
        root=bpy.data.objects[c['root']];x=root.matrix_world.translation.x;h=c['top']
        cam.location=(x+h*.85,-h*3,h*1.3);target=Vector((x,0,h*.49));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.ortho_scale=h*1.48
        scene.render.resolution_x=800;scene.render.resolution_y=900
        for label,f in [('contact',1),('passing',1+c['period']//4)]:
            scene.frame_set(f);scene.render.filepath=str(PREVIEW/(c['root']+'_'+label+'.png'));bpy.ops.render.render(write_still=True)
    cam.location=(8,-25,9);cam.rotation_euler=(Vector((7.6,0,4.25))-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.ortho_scale=19
    scene.render.resolution_x=1600;scene.render.resolution_y=1000
    scene.frame_set(1)
    bpy.ops.object.select_all(action='DESELECT')
    for c in CONFIGS:c['rig'].select_set(True)
    bpy.context.view_layer.objects.active=CONFIGS[2]['rig']
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active;space.shading.type='MATERIAL';space.overlay.show_relationship_lines=False
                space.region_3d.view_distance=20;space.region_3d.view_location=(7.3,0,3.6)
                space.region_3d.view_rotation=cam.rotation_euler.to_quaternion()
                space.region_3d.view_perspective='ORTHO'
            elif area.type=='DOPESHEET_EDITOR':area.spaces.active.dopesheet.show_only_selected=False
    scene.frame_preview_end=1120
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
    lines=['# Forest character rig and walk validation','','## Summary','- Preserved the source blend and hidden Goblin original backup.','- Added one articulated 17-bone rig per character, bone-bound rigid details, smoothly weighted continuous legs, and four editable Walk actions.','- Weapons and grip fingers share their hand bone. Feet use a flat planted stance and raised swing; hips, arms and canopy have secondary motion.','','## Validation','| Character | Bound parts | Cycle at 24 fps | Rest matrix error | Seam error | Third-cycle error | Pose movement |','|---|---:|---:|---:|---:|---:|---:|']
    for c in CONFIGS:lines.append(f"| {c['label']} | {len(c['parts'])} | {c['period']} frames | {c['rest_error']:.8f} | {c['seam_error']:.8f} | {c['repeat_error']:.8f} | {c['motion']:.5f} |")
    lines+=['','- Blender 5.1 layered action curves include Cycles modifiers; loops validated beyond authored frames.','- Source object transforms preserved in rest pose (tolerance 0.0001).','- Contact and passing previews rendered in `public/assets/models/forest_walk_preview/`.','- These are in-place Blender animations; application integration and GLB export are outside this change.','','## Blockers','- None.']
    (ROOT/'docs/forest-rig-walk-validation.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print('SAVED',OUT,flush=True)



if __name__ == '__main__':
    import sys
    if '--repair-vines' in sys.argv: repair_vines()
    else: main()
