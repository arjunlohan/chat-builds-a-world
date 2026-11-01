"""Offline CC0 LOD preparation: preserve scan coverage instead of deleting small leaves.
Only baked image data and glTF leave the ignored source cache.
"""
import bpy, math, os, sys
from mathutils import Vector
source, directory, kind = sys.argv[sys.argv.index('--') + 1:]
os.makedirs(directory, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
# Separate woody and leaf primitives before simplifying, so fine leaves survive as cutouts.
meshes=[o for o in bpy.context.view_layer.objects if o.type=='MESH']
for obj in meshes:
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active=obj
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
meshes=[o for o in bpy.context.view_layer.objects if o.type=='MESH']
points=[o.matrix_world@Vector(p) for o in meshes for p in o.bound_box]
lo=Vector(tuple(min(p[i] for p in points) for i in range(3))); hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
center=(lo+hi)*.5; size=max(hi-lo)*1.025
foliage=[o for o in meshes if kind!='scanned-tree' or any('leaves' in m.name for m in o.data.materials)]
wood=[o for o in meshes if o not in foliage]
for obj in wood: obj.hide_render=True
for obj in foliage:
    for material in obj.data.materials:
        nodes=material.node_tree.nodes; links=material.node_tree.links
        principled=next(n for n in nodes if n.type=='BSDF_PRINCIPLED'); output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
        emission=nodes.new('ShaderNodeEmission'); color=principled.inputs['Base Color']
        if color.is_linked: links.new(color.links[0].from_socket,emission.inputs['Color'])
        else: emission.inputs['Color'].default_value=color.default_value
        links.new(emission.outputs[0],output.inputs['Surface'])
scene=bpy.context.scene; scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=scene.render.resolution_y=1024; scene.render.resolution_percentage=100
scene.render.film_transparent=True; scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard'; scene.view_settings.look='None'; scene.view_settings.exposure=0; scene.view_settings.gamma=1
camera_data=bpy.data.cameras.new('scan bake'); camera=bpy.data.objects.new('scan bake',camera_data); scene.collection.objects.link(camera); scene.camera=camera; camera_data.type='ORTHO'; camera_data.ortho_scale=size
cards=[]
for i, direction in enumerate([Vector((0,-1,0)),Vector((1,0,0))]):
    camera.location=center+direction*size*2; camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=os.path.join(directory,f'canopy-{i}.png'); bpy.ops.render.render(write_still=True)
    # A crossed pair retains canopy coverage at every orbit angle and supports alpha-to-coverage.
    right=Vector((0,0,1)).cross(direction).normalized(); up=Vector((0,0,1))
    vertices=[center+right*x*size*.5+up*y*size*.5 for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    geometry=bpy.data.meshes.new('scan coverage'); geometry.from_pydata(vertices,[],[(0,1,2,3)]); geometry.uv_layers.new()
    for loop,uv in zip(geometry.uv_layers.active.data,[(0,0),(1,0),(1,1),(0,1)]): loop.uv=uv
    card=bpy.data.objects.new('scanned canopy card',geometry); scene.collection.objects.link(card); cards.append(card);card.hide_render=True
    material=bpy.data.materials.new('baked scan cutout'); material.use_nodes=True; material.surface_render_method='DITHERED'; material.use_backface_culling=False
    nodes=material.node_tree.nodes; links=material.node_tree.links; bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED'); image=nodes.new('ShaderNodeTexImage'); image.image=bpy.data.images.load(scene.render.filepath)
    links.new(image.outputs['Color'],bsdf.inputs['Base Color']); links.new(image.outputs['Alpha'],bsdf.inputs['Alpha']); bsdf.inputs['Roughness'].default_value=.88
    card.data.materials.append(material)
for obj in foliage: bpy.data.objects.remove(obj,do_unlink=True)
for obj in wood: obj.hide_render=False
for card in cards: card.hide_render=False
# Decimate only continuous woody structure. Leaf density is now independent of triangle count.
for obj in wood:
    count=sum(len(p.vertices)-2 for p in obj.data.polygons); modifier=obj.modifiers.new('bounded wood LOD','DECIMATE'); modifier.ratio=min(1,800/max(1,count))
    bpy.context.view_layer.objects.active=obj; obj.select_set(True); bpy.ops.object.modifier_apply(modifier=modifier.name);obj.select_set(False)
bpy.ops.object.select_all(action='DESELECT')
for obj in wood+cards: obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(directory,'coverage.glb'),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False)
print('Prepared scan coverage:',kind)
