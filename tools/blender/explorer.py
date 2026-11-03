"""Génère le personnage « explorateur » de shootdabih et l'exporte en glTF.

Usage : Blender -b -P tools/blender/explorer.py -- <sortie.glb> [aperçu.png]

Repères Blender : z vers le haut, le personnage regarde vers -y (devient +z dans le glTF), pieds à z = 0.
Noms utilisés par le client : LegL, LegR (pivot à la hanche), ArmR (épaule, tient l'arme), Body,
Hat_bonnet, Hat_casquette, Hat_chapka, Hat_casque, et le matériau « Parka » recoloré par joueur.
Le bras à la première personne est exporté à part sous « Viewmodel ».
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/explorer.glb'
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- matériaux ----------
PALETTE = {
    'Parka': (0x3f, 0xa3, 0x9a), 'Trim': (0x26, 0x2a, 0x2b), 'Fur': (0xd8, 0xcf, 0xbe), 'Skin': (0xc9, 0x8a, 0x66),
    'Eye': (0x1f, 0x1d, 0x1c), 'Pants': (0x2f, 0x42, 0x56), 'Boot': (0x3a, 0x2f, 0x2a), 'Sole': (0x1f, 0x1d, 0x1c),
    'Mitten': (0x7a, 0x5a, 0x42), 'Pack': (0x5f, 0x6b, 0x52), 'Strap': (0x2a, 0x26, 0x20), 'Roll': (0xe8, 0x84, 0x3e),
    'Gun': (0x5a, 0x60, 0x62), 'GunDark': (0x26, 0x2a, 0x2b), 'Accent': (0xe8, 0x84, 0x3e), 'Glow': (0xff, 0xd9, 0xa0),
    'Bonnet': (0xd9, 0x53, 0x4f), 'BonnetFold': (0xb8, 0x40, 0x3c), 'Pompom': (0xf3, 0xef, 0xe6),
    'Cap': (0x2f, 0x42, 0x56), 'Chapka': (0x7a, 0x5a, 0x42), 'Helmet': (0xe8, 0xc2, 0x3a), 'Lamp': (0xf3, 0xef, 0xe6),
}
MATS = {}


def srgb(c):
    return ((c / 255) ** 2.2)


for name, (r, g, b) in PALETTE.items():
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (srgb(r), srgb(g), srgb(b), 1)
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0
    if name == 'Glow':
        bsdf.inputs['Emission Color'].default_value = (srgb(r), srgb(g), srgb(b), 1)
        bsdf.inputs['Emission Strength'].default_value = 2.0
    m.diffuse_color = (srgb(r), srgb(g), srgb(b), 1)
    MATS[name] = m

# ---------- outils ----------


def finish(obj, mat, parent=None, bevel=0.0, segments=2):
    """Applique échelle et biseau, ombrage plat, matériau, parent."""
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(40)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons:
        p.use_smooth = False
    obj.data.materials.clear()
    obj.data.materials.append(MATS[mat])
    if parent is not None:
        wm = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = wm
    obj.select_set(False)
    return obj


def box(name, size, loc, mat, parent=None, bevel=0.05, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    return finish(o, mat, parent, bevel)


def cone(name, r1, r2, depth, verts, loc, mat, parent=None, rot=(0, 0, 0), bevel=0.0, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    return finish(o, mat, parent, bevel, 1)


def sphere(name, r, seg, rings, loc, mat, parent=None, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    return finish(o, mat, parent)


def ico(name, r, loc, mat, parent=None, subdiv=1, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    return finish(o, mat, parent)


def torus(name, major, minor, loc, mat, parent=None, rot=(0, 0, 0), seg=(12, 6), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=seg[0], minor_segments=seg[1], location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    return finish(o, mat, parent)


def empty(name, loc, parent=None):
    o = bpy.data.objects.new(name, None)
    o.location = loc
    scene.collection.objects.link(o)
    if parent is not None:
        o.parent = parent
    return o


def set_origin(obj, point):
    """Déplace l'origine d'un objet sans bouger sa géométrie (pivot des jambes)."""
    delta = Vector(point) - obj.matrix_world.translation
    obj.data.transform(__import__('mathutils').Matrix.Translation(-delta))
    obj.location = obj.location + delta


R90 = math.radians(90)

# ---------- personnage ----------
root = empty('Explorer', (0, 0, 0))
body = empty('Body', (0, 0, 0), root)

for side, x in (('L', -0.17), ('R', 0.17)):
    leg = box('Leg' + side, (0.25, 0.29, 0.46), (x, 0, 0.4), 'Pants', bevel=0.05)
    set_origin(leg, (x, 0, 0.62))
    boot = box('Boot' + side, (0.28, 0.38, 0.17), (x, -0.03, 0.15 - 0.62 + 0.62 - 0.07), 'Boot', leg, bevel=0.05)
    box('Sole' + side, (0.3, 0.4, 0.04), (x, -0.03, 0.02), 'Sole', leg, bevel=0.01)
    leg.parent = root
    leg.matrix_parent_inverse.identity()
    del boot

cone('Torso', 0.47, 0.4, 0.9, 10, (0, 0, 1.06), 'Parka', body, bevel=0.06, scale=(1, 0.82, 1))
cone('Hem', 0.49, 0.49, 0.1, 10, (0, 0, 0.62), 'Trim', body, scale=(1, 0.84, 1))
cone('Collar', 0.36, 0.33, 0.12, 10, (0, 0, 1.5), 'Parka', body, scale=(1, 0.85, 1))
box('Zip', (0.035, 0.03, 0.78), (0, -0.335, 1.06), 'Trim', body, bevel=0.0)
for x in (-0.21, 0.21):
    box('Pocket', (0.17, 0.04, 0.13), (x, -0.31, 0.83), 'Trim', body, bevel=0.015)
sphere('Hood', 0.36, 12, 8, (0, 0.03, 1.72), 'Parka', body, scale=(1.02, 0.98, 1.02))
torus('Fur', 0.215, 0.085, (0, -0.25, 1.7), 'Fur', body, rot=(R90, 0, 0), seg=(14, 6), scale=(1, 1, 1.1))
sphere('Face', 0.19, 10, 6, (0, -0.25, 1.7), 'Skin', body, scale=(1, 0.5, 1.08))
for x in (-0.065, 0.065):
    box('Eye', (0.04, 0.02, 0.05), (x, -0.345, 1.74), 'Eye', body, bevel=0.0)
box('Nose', (0.05, 0.04, 0.05), (0, -0.35, 1.68), 'Skin', body, bevel=0.01)

# bras gauche, le long du corps
box('ArmL', (0.21, 0.25, 0.6), (-0.55, 0, 1.06), 'Parka', body, bevel=0.06, rot=(0, math.radians(-8), 0))
box('MittenL', (0.19, 0.21, 0.17), (-0.6, -0.01, 0.73), 'Mitten', body, bevel=0.05)

# sac à dos
box('Pack', (0.56, 0.26, 0.62), (0, 0.38, 1.08), 'Pack', body, bevel=0.06)
box('PackPocket', (0.36, 0.08, 0.24), (0, 0.53, 0.94), 'Pack', body, bevel=0.03)
cone('Roll', 0.12, 0.12, 0.66, 10, (0, 0.4, 1.47), 'Roll', body, rot=(0, R90, 0), bevel=0.02)
for x in (-0.2, 0.2):
    box('Strap', (0.06, 0.04, 0.3), (x, -0.31, 1.33), 'Strap', body, bevel=0.0)
    box('StrapRoll', (0.04, 0.05, 0.28), (x * 1.0, 0.4, 1.47), 'Strap', body, bevel=0.0)

# bras droit tendu, tient le rayon
arm = empty('ArmR', (0.5, 0, 1.3), body)
box('SleeveR', (0.21, 0.58, 0.21), (0.5, -0.24, 1.3), 'Parka', arm, bevel=0.06)
box('CuffR', (0.23, 0.06, 0.23), (0.5, -0.52, 1.3), 'Trim', arm, bevel=0.02)
box('MittenR', (0.19, 0.18, 0.2), (0.5, -0.62, 1.29), 'Mitten', arm, bevel=0.05)
box('GunBody', (0.13, 0.62, 0.17), (0.5, -0.78, 1.33), 'Gun', arm, bevel=0.03)
box('GunTop', (0.07, 0.4, 0.06), (0.5, -0.76, 1.44), 'GunDark', arm, bevel=0.01)
cone('Barrel', 0.035, 0.035, 0.32, 10, (0.5, -1.22, 1.35), 'GunDark', arm, rot=(R90, 0, 0))
for y in (-1.1, -1.2, -1.3):
    torus('Coil', 0.055, 0.016, (0.5, y, 1.35), 'Accent', arm, rot=(R90, 0, 0), seg=(10, 4))
ico('Tip', 0.032, (0.5, -1.4, 1.35), 'Glow', arm, subdiv=1)

# couvre-chefs (un seul visible à la fois dans le jeu)
hb = empty('Hat_bonnet', (0, 0, 0), body)
cone('BonnetTop', 0.33, 0.26, 0.24, 12, (0, 0.03, 1.98), 'Bonnet', hb, bevel=0.04)
cone('BonnetFold', 0.355, 0.355, 0.1, 12, (0, 0.03, 1.88), 'BonnetFold', hb)
ico('Pompom', 0.1, (0, 0.03, 2.16), 'Pompom', hb, subdiv=1)

hc = empty('Hat_casquette', (0, 0, 0), body)
sphere('CapDome', 0.35, 12, 6, (0, 0.03, 1.86), 'Cap', hc, scale=(1, 1, 0.62))
box('CapVisor', (0.36, 0.26, 0.04), (0, -0.3, 1.9), 'Cap', hc, bevel=0.015, rot=(math.radians(-10), 0, 0))
box('CapButton', (0.05, 0.05, 0.03), (0, 0.03, 2.08), 'Trim', hc, bevel=0.0)

hk = empty('Hat_chapka', (0, 0, 0), body)
cone('ChapkaTop', 0.38, 0.36, 0.26, 12, (0, 0.03, 1.98), 'Chapka', hk, bevel=0.04)
cone('ChapkaBand', 0.4, 0.4, 0.12, 12, (0, 0.03, 1.86), 'Fur', hk)
for x in (-0.36, 0.36):
    box('ChapkaEar', (0.1, 0.24, 0.3), (x, 0.0, 1.7), 'Fur', hk, bevel=0.04)

hm = empty('Hat_casque', (0, 0, 0), body)
sphere('HelmetShell', 0.39, 12, 6, (0, 0.03, 1.82), 'Helmet', hm, scale=(1, 1, 0.78))
cone('HelmetBrim', 0.42, 0.42, 0.04, 12, (0, 0.03, 1.83), 'Helmet', hm)
box('LampBox', (0.13, 0.08, 0.09), (0, -0.37, 1.95), 'Trim', hm, bevel=0.02)
cone('LampGlass', 0.04, 0.04, 0.02, 10, (0, -0.415, 1.95), 'Glow', hm, rot=(R90, 0, 0))

# ---------- bras à la première personne ----------
vm = empty('Viewmodel', (0, 0, 0))
box('VMSleeve', (0.2, 0.5, 0.2), (0.06, 0.2, -0.08), 'Parka', vm, bevel=0.06)
box('VMCuff', (0.22, 0.06, 0.22), (0.06, -0.04, -0.08), 'Trim', vm, bevel=0.02)
box('VMMitten', (0.18, 0.17, 0.19), (0.04, -0.14, -0.07), 'Mitten', vm, bevel=0.05)
box('VMGunBody', (0.12, 0.6, 0.15), (0.0, -0.34, 0.02), 'Gun', vm, bevel=0.03)
box('VMGunTop', (0.06, 0.38, 0.05), (0.0, -0.32, 0.12), 'GunDark', vm, bevel=0.01)
box('VMGrip', (0.07, 0.1, 0.18), (0.0, -0.14, -0.1), 'GunDark', vm, bevel=0.02, rot=(math.radians(-18), 0, 0))
cone('VMBarrel', 0.032, 0.032, 0.32, 10, (0.0, -0.78, 0.05), 'GunDark', vm, rot=(R90, 0, 0))
for y in (-0.66, -0.76, -0.86):
    torus('VMCoil', 0.052, 0.015, (0.0, y, 0.05), 'Accent', vm, rot=(R90, 0, 0), seg=(10, 4))
ico('VMTip', 0.028, (0.0, -0.96, 0.05), 'Glow', vm, subdiv=1)

# ---------- export ----------
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_normals=True, export_cameras=False, export_lights=False)
print('Exporté :', OUT)

# ---------- aperçu ----------
if PREVIEW:
    vm.location = (3, 0, 0)
    for o in bpy.data.objects:
        if o.name.startswith('Hat_') and o.name != 'Hat_bonnet':
            o.location.x += {'Hat_casquette': -1.6, 'Hat_chapka': 1.6, 'Hat_casque': 3.2}[o.name]
    cam_data = bpy.data.cameras.new('Cam')
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = (1.6, -4.6, 2.2)
    direction = Vector((0.7, 0, 1.15)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    cam_data.lens = 38
    scene.camera = cam
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    sun.data.energy = 3
    scene.collection.objects.link(sun)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.background_type = 'VIEWPORT'
    scene.display.shading.background_color = (0.08, 0.15, 0.14)
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 900
    scene.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)
    print('Aperçu :', PREVIEW)
