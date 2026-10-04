"""
Re-imports exported GLBs, prints hierarchy / triangles / sizes / key positions, and
optionally renders a preview row.

  blender --background --python check.py -- public/models/tanks.glb [--render out.png] [--spacing 3.6]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
path = args[0]
render = args[args.index("--render") + 1] if "--render" in args else None
spacing = float(args[args.index("--spacing") + 1]) if "--spacing" in args else 3.6
view = args[args.index("--view") + 1] if "--view" in args else "front"
cols = int(args[args.index("--cols") + 1]) if "--cols" in args else 99

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
# The importer adds suffixes on name clashes; the GLB's own names are read from the file below.
import json
import struct

data = open(path, "rb").read()
jlen = struct.unpack_from("<I", data, 12)[0]
doc = json.loads(data[20:20 + jlen])
print(f"\n== {path}: {len(data)} bytes, extensions={doc.get('extensionsUsed', [])}")
print("materials:", [m["name"] for m in doc.get("materials", [])])
nodes = doc["nodes"]
scene_roots = doc["scenes"][0]["nodes"]


def mesh_tris(mi):
    t = 0
    for p in doc["meshes"][mi]["primitives"]:
        t += doc["accessors"][p["indices"]]["count"] // 3
    return t


def walk(i, depth):
    n = nodes[i]
    t = mesh_tris(n["mesh"]) if "mesh" in n else 0
    sub = t
    lines = []
    for c in n.get("children", []):
        s, l = walk(c, depth + 1)
        sub += s
        lines += l
    tr = [round(v, 3) for v in n.get("translation", [0, 0, 0])]
    lines.insert(0, f"{'  ' * depth}{n['name']}  {'mesh ' + str(t) + ' tris' if 'mesh' in n else 'empty'}  t={tr}")
    return sub, lines


for r in scene_roots:
    total, lines = walk(r, 1)
    print("\n".join(lines))
    print(f"    -> {nodes[r]['name']} total {total} tris")

# world-space info in three.js coordinates (Blender X, Z, -Y)
bpy.context.view_layer.update()
roots = [o for o in bpy.context.scene.objects if o.parent is None]
roots.sort(key=lambda o: o.name)
for r in roots:
    pts = [c.matrix_world @ Vector(b) for c in [r] + list(r.children_recursive) if c.type == "MESH" for b in c.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    print(f"{r.name}: bbox X {lo.x:.2f}..{hi.x:.2f}  Y(front) {lo.y:.2f}..{hi.y:.2f}  Z(up) {lo.z:.2f}..{hi.z:.2f}")
    for c in r.children_recursive:
        base = c.name.split(".")[0]
        if base.startswith("muzzle") or base == "turret" or base.startswith("barrel"):
            p = c.matrix_world.translation - r.matrix_world.translation
            print(f"   {base:9s} three.js (x,y,z) = ({p.x:.3f}, {p.z:.3f}, {-p.y:.3f})")

if render:
    scene = bpy.context.scene
    ncols = min(cols, len(roots))
    nrows = math.ceil(len(roots) / ncols)
    flip = -1 if view == "front" else 1
    for i, r in enumerate(roots):
        c, row = i % ncols, i // ncols
        r.location.x = (c - (ncols - 1) / 2) * spacing * flip
        r.location.y = (row - (nrows - 1) / 2) * spacing * flip
    team = [(0.15, 0.45, 1.0), (1.0, 0.2, 0.2), (0.2, 0.85, 0.3), (1.0, 0.75, 0.1)]
    for i, r in enumerate(roots):
        col = team[i % len(team)]
        for c in [r] + list(r.children_recursive):
            if c.type != "MESH":
                continue
            for k, slot in enumerate(c.material_slots):
                if slot.material and slot.material.name.startswith("tint"):
                    m = bpy.data.materials.get(f"tint_preview_{i}") or slot.material.copy()
                    m.name = f"tint_preview_{i}"
                    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
                    bsdf.inputs["Base Color"].default_value = (*col, 1)
                    c.material_slots[k].material = m
    # ground
    bpy.ops.mesh.primitive_plane_add(size=200)
    g = bpy.context.active_object
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    next(n for n in gm.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.42, 0.5, 0.32, 1)
    g.data.materials.append(gm)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.6, 0.72, 0.85, 1)
    bg.inputs["Strength"].default_value = 0.8
    scene.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(30))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    width = spacing * ncols
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = width * 1.0 if nrows == 1 else width * 1.15
    target = Vector((0, 0, 0.8))
    # three-quarter top-down: from the front-right (front is +Y) or from behind
    d = Vector((-0.12, 1.0, 1.3)) if view == "front" else Vector((0.12, -1.0, 1.3))
    cam.location = target + d.normalized() * 40
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.clip_end = 200
    scene.render.engine = "BLENDER_EEVEE"
    try:
        scene.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 560 if nrows == 1 else int(1600 * nrows * 1.25 / ncols)
    scene.render.filepath = render
    bpy.ops.render.render(write_still=True)
    print("rendered", render)
