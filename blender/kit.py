"""
Toy-box modelling kit for Tank Clash (adapted from the Crash Racers kit, same author, MIT).

Pieces are bmesh primitives; a Part collects pieces into one mesh with one
material slot per colour. Colours are plain Principled BSDF materials:

  'tint'          white, the game recolours it with the team colour
  'dark'          a named colour from PAL (matte)
  '#rrggbb'       matte
  'metal:#hex'    metallic, fairly shiny
  'gloss:#hex'    painted, shiny
  'glow:#hex'     emissive

Blender axes: +Y is the model's front (three.js -Z), +Z is up.
Object names must be unique in Blender, so repeated child names get '.001'
suffixes; fix_names() strips them in the GLB so every tank has 'hull', 'turret'...
"""
import json
import math
import os
import random
import re
import struct

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

PAL = {
    "dark": "#2b2f38",      # tracks, rubber
    "darker": "#1b1e24",
    "metal": "metal:#9aa3ad",
    "steel": "metal:#5f6873",
    "gold": "metal:#f2b632",
    "light": "glow:#ffe066",  # headlights
    "red": "#d8262c",
    "white": "#f2f0ea",
}


# --- Pieces: each returns a fresh bmesh -------------------------------------------------


def xf(bm, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Scale, then rotate (XYZ Euler, radians), then move."""
    if not isinstance(scale, (tuple, list, Vector)):
        scale = (scale, scale, scale)
    m = Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm


def cube(size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    xf(bm, scale=size)
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
    return xf(bm, loc, rot)


def sphere(r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), segs=12, rings=8):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def ico(r, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), subd=1, jitter=0.0, seed=0):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subd, radius=r)
    if jitter:
        rnd = random.Random(seed)
        for v in bm.verts:
            v.co *= 1 + (rnd.random() - 0.5) * jitter
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def cyl(r1, r2, h, loc=(0, 0, 0), rot=(0, 0, 0), segs=12, caps=True):
    """A cylinder or cone standing on its base at `loc` (before rotation, the base is at z=0)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    return xf(bm, loc, rot)


# Rotations that turn a cyl()'s +Z axis to point along an axis.
TO_Y = (-math.pi / 2, 0, 0)
TO_NEG_Y = (math.pi / 2, 0, 0)
TO_X = (0, math.pi / 2, 0)
TO_NEG_X = (0, -math.pi / 2, 0)


def torus(R, r, loc=(0, 0, 0), rot=(0, 0, 0), segs=16, rsegs=6, scale=(1, 1, 1)):
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        a = i / segs * math.tau
        c, s = math.cos(a), math.sin(a)
        ring = []
        for j in range(rsegs):
            b = j / rsegs * math.tau
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((c * rr, s * rr, r * math.sin(b))))
        rings.append(ring)
    for i in range(segs):
        a, b = rings[i], rings[(i + 1) % segs]
        for j in range(rsegs):
            k = (j + 1) % rsegs
            bm.faces.new((a[j], b[j], b[k], a[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def lathe(profile, segs=16, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), cap_bottom=True, cap_top=True, jitter=0.0, seed=0, phase=0.0):
    """Surface of revolution of [(radius, z), ...] from bottom to top."""
    bm = bmesh.new()
    rnd = random.Random(seed)
    rings = []
    for r, z in profile:
        ring = []
        for k in range(segs):
            a = k / segs * math.tau + phase
            rr = r * (1 + (rnd.random() - 0.5) * jitter) if r > 0 else 0
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(segs):
            kk = (k + 1) % segs
            quad = [a[k], a[kk], b[kk], b[k]]
            if len({tuple(round(c, 6) for c in v.co) for v in quad}) >= 3:
                bm.faces.new(quad)
    if cap_bottom and profile[0][0] > 0:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top and profile[-1][0] > 0:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    xf(bm, scale=scale)
    return xf(bm, loc, rot)


def frustum(bottom, top, h, loc=(0, 0, 0), rot=(0, 0, 0), top_offset=(0, 0)):
    """A box-shaped frustum: (half x, half y) at the bottom and at the top, `h` high, base at z=0."""
    bm = bmesh.new()
    b = [bm.verts.new((sx * bottom[0], sy * bottom[1], 0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    t = [bm.verts.new((sx * top[0] + top_offset[0], sy * top[1] + top_offset[1], h)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(list(reversed(b)))
    bm.faces.new(t)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((b[i], b[j], t[j], t[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return xf(bm, loc, rot)


def prism(poly, depth, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A 2D outline [(x, z), ...] in the XZ plane, extruded `depth` along Y (centred)."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in poly]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in poly]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return xf(bm, loc, rot)


def side_prism(poly, width, loc=(0, 0, 0)):
    """A side profile [(y, z), ...] (y forward) extruded `width` along X (centred)."""
    bm = bmesh.new()
    left = [bm.verts.new((-width / 2, y, z)) for y, z in poly]
    right = [bm.verts.new((width / 2, y, z)) for y, z in poly]
    bm.faces.new(left)
    bm.faces.new(list(reversed(right)))
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return xf(bm, loc)


def stadium(length, height, r, segs=4):
    """Side outline (y, z) of a track: a box `length` x `height` (base z=0) with rounded ends of radius r."""
    pts = []
    half = length / 2 - r
    # front end: from bottom to top around +y
    for k in range(segs + 1):
        a = -math.pi / 2 + k / segs * math.pi
        pts.append((half + math.cos(a) * r, height / 2 + math.sin(a) * (height / 2)))
    for k in range(segs + 1):
        a = math.pi / 2 + k / segs * math.pi
        pts.append((-half + math.cos(a) * r, height / 2 + math.sin(a) * (height / 2)))
    return pts


def jitter(bm, amount, seed=0):
    rnd = random.Random(seed)
    for v in bm.verts:
        v.co += Vector(((rnd.random() - 0.5) * amount, (rnd.random() - 0.5) * amount, (rnd.random() - 0.5) * amount))
    return bm


def mirror_x(fn):
    """Calls fn(sign) for the left (-1) and right (+1) side."""
    for s in (-1, 1):
        fn(s)


# --- Materials ---------------------------------------------------------------------------


def _hex(h):
    h = h.lstrip("#")
    srgb = [int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


_mats = {}


def material(spec):
    """Material for a colour spec (see module doc), shared by name."""
    name = spec
    spec = PAL.get(spec, spec)
    if spec == "tint":
        kind, hx = "tint", "#ffffff"
    elif ":" in spec:
        kind, hx = spec.split(":")
    else:
        kind, hx = "matte", spec
    if name.startswith("#") or ":" in name:
        name = f"{kind}_{hx.lstrip('#')}"
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    col = _hex(hx)
    bsdf.inputs["Base Color"].default_value = (*col, 1)
    bsdf.inputs["Roughness"].default_value = {"matte": 0.8, "gloss": 0.35, "metal": 0.35, "glow": 0.5, "tint": 0.55}[kind]
    bsdf.inputs["Metallic"].default_value = {"metal": 0.7}.get(kind, 0.0)
    if kind == "glow":
        bsdf.inputs["Emission Color"].default_value = (*col, 1)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    m.diffuse_color = (*col, 1)
    m.use_backface_culling = True
    _mats[name] = m
    return m


# --- Parts -------------------------------------------------------------------------------


class Part:
    """A mesh under construction: pieces merged together, one material slot per colour."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []

    def slot(self, color):
        m = material(color)
        if m not in self.slots:
            self.slots.append(m)
        return self.slots.index(m)

    def add(self, bm, color, alt=None, pick=None):
        """Merges a piece; faces where pick(face) is true get colour `alt` instead."""
        idx = self.slot(color)
        alt_idx = self.slot(alt) if alt else idx
        for f in bm.faces:
            f.material_index = alt_idx if pick and pick(f) else idx
        me = bpy.data.meshes.new("tmp")
        bm.to_mesh(me)
        bm.free()
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        return self

    def build(self, parent=None, location=(0, 0, 0), pivot=(0, 0, 0), smooth_angle=35):
        """Creates the object; `pivot` (in the coordinates the pieces were modelled in) becomes its origin,
        `location` is its position relative to `parent`."""
        bmesh.ops.translate(self.bm, vec=-Vector(pivot), verts=self.bm.verts)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.slots:
            me.materials.append(m)
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        o = bpy.data.objects.new(self.name, me)
        bpy.context.collection.objects.link(o)
        o.parent = parent
        o.location = location
        return o


def empty(name, parent=None, location=(0, 0, 0), size=0.2):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = size
    bpy.context.collection.objects.link(o)
    o.parent = parent
    o.location = location
    return o


def tris(obj):
    if obj.type != "MESH":
        return 0
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def stats(roots):
    for r in roots:
        total = sum(tris(o) for o in r.children_recursive)
        print(f"  {r.name:10s} {total:6d} tris  " + ", ".join(f"{o.name}={tris(o)}" for o in r.children_recursive if o.type == "MESH"))


# --- Export --------------------------------------------------------------------------------


def export(path, roots):
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action="DESELECT")
    for r in roots:
        r.select_set(True)
        for c in r.children_recursive:
            c.select_set(True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_animations=False, export_texcoords=False)
    fix_names(path)
    print(f"exported {path} ({os.path.getsize(path)} bytes)")


def fix_names(path):
    """Strips Blender's '.001' uniqueness suffixes from node names in a GLB."""
    data = open(path, "rb").read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + jlen])
    rest = data[20 + jlen:]
    for coll in ("nodes", "meshes"):
        for n in doc.get(coll, []):
            if "name" in n:
                n["name"] = re.sub(r"\.\d{3}$", "", n["name"])
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + len(rest))
    glb += struct.pack("<II", len(js), 0x4E4F534A) + js + rest
    open(path, "wb").write(glb)


def loft(bottom, top, z0, z1, loc=(0, 0, 0), rot=(0, 0, 0)):
    """A solid between two plan outlines [(x, y), ...] (same vertex count, counter-clockwise) at heights z0 and z1."""
    bm = bmesh.new()
    b = [bm.verts.new((x, y, z0)) for x, y in bottom]
    t = [bm.verts.new((x, y, z1)) for x, y in top]
    bm.faces.new(list(reversed(b)))
    bm.faces.new(t)
    n = len(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((b[i], b[j], t[j], t[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return xf(bm, loc, rot)


def scaled(poly, sx, sy=None, dy=0.0):
    sy = sx if sy is None else sy
    return [(x * sx, y * sy + dy) for x, y in poly]
