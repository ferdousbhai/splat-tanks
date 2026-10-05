"""
Splat Tanks arena props: exports ../public/models/arena.glb with one root mesh node per prop,
each standing on its own origin (base centre) at the world origin. 1 unit = 1 m.

  crate, wall, rock, barrel (paint bucket), tree, tower (giant paint pot), tires, pad

The wall, rock and tires are Poly Haven models (CC0), decimated to game budgets; the rest are modelled
here and textured with Poly Haven texture sets (see kit.SURF). Downloads are cached in blender/.polyhaven/.

Run with:  blender --background --python arena.py
"""
import math
import os
import random
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from kit import TO_X, TO_Y, Part, cube, cyl, frustum, ico, lathe, prism, sphere, torus  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models", "arena.glb")

WOOD, WOOD_DARK = "#d9a066@planks", "#6e4a2e@planks"
TIN, RIM = "metal:#f4f1ea@metal", "metal:#c9ccd2@metal"


def crate():
    p = Part("crate")
    p.add(cube((1.84, 1.84, 1.84), (0, 0, 1.0)), WOOD)
    b = 0.24  # frame beams along every edge
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.add(cube((b, b, 2.0), (sx * (1 - b / 2), sy * (1 - b / 2), 1.0), bevel=0.03), WOOD_DARK)
            p.add(cube((2.0, b, b), (0, sx * (1 - b / 2), 1 + sy * (1 - b / 2)), bevel=0.03), WOOD_DARK)
            p.add(cube((b, 2.0, b), (sx * (1 - b / 2), 0, 1 + sy * (1 - b / 2)), bevel=0.03), WOOD_DARK)
    diag = math.atan2(1.52, 1.52)
    for s in (-1, 1):  # diagonal braces on the four sides and the top
        p.add(cube((2.1, 0.08, 0.22), (0, s * 0.94, 1.0), (0, s * diag, 0)), WOOD_DARK)
        p.add(cube((0.08, 2.1, 0.22), (s * 0.94, 0, 1.0), (s * diag, 0, 0)), WOOD_DARK)
    p.add(cube((2.1, 0.22, 0.08), (0, 0, 1.94), (0, 0, diag)), WOOD_DARK)
    return p.build(smooth_angle=20)


def wall():
    """A 4 m concrete block wall with a chipped top."""
    p = Part("wall")
    blocks = "#ffffff@blocks"
    outline = [(-2, 0), (2, 0), (2, 1.2), (1.72, 1.42), (1.45, 1.6), (-0.9, 1.6), (-1.05, 1.42), (-1.35, 1.38), (-1.5, 1.6), (-2, 1.6)]
    p.add(prism(outline, 1.0, (0, 0, 0)), blocks)
    p.add(cube((4.04, 1.06, 0.16), (0, 0, 0.08)), "#9a968e@blocks")  # footing
    rnd = random.Random(3)
    for x, y in ((1.7, 0.45), (1.88, -0.3), (-1.8, 0.55)):  # rubble from the broken corners
        p.add(kit.jitter(ico(0.12, (x, y, 0.1), subd=1), 0.05, seed=rnd.randint(0, 99)), blocks)
    return p.build(smooth_angle=20)


def rock():
    o = kit.import_model("boulder_01", "rock", tris=1400)
    return kit.fit(o, height=2.0)


def barrel():
    """A paint bucket (named barrel in the game): white tin, pink paint on top, drips down the side."""
    p = Part("barrel")
    tin, rim, paint = TIN, RIM, "gloss:#ff4fb8"
    p.add(lathe([(0.5, 0), (0.54, 0.04), (0.6, 1.16), (0.62, 1.2)], 18, cap_top=False), tin)
    p.add(torus(0.61, 0.035, (0, 0, 1.2), segs=18, rsegs=6), rim)
    p.add(torus(0.53, 0.03, (0, 0, 0.04), segs=18, rsegs=6), rim)
    p.add(cyl(0.59, 0.59, 0.02, (0, 0, 1.14), segs=18), paint)  # the paint inside
    # a label band with three colour dots
    p.add(cyl(0.585, 0.585, 0.32, (0, 0, 0.42), segs=18), "gloss:#5ad1ff")
    for k, col in enumerate(("#ffd60a", "#22c55e", "#ff6a3d")):
        a = -0.5 + k * 0.5
        p.add(sphere(0.09, (math.sin(a) * 0.59, math.cos(a) * 0.59, 0.58), (1, 0.4, 1), segs=8, rings=6), f"gloss:{col}")
    # drips over the rim
    for a, length in ((0.3, 0.35), (1.3, 0.55), (2.4, 0.25), (3.6, 0.45), (4.7, 0.3), (5.6, 0.5)):
        x, y = math.sin(a), math.cos(a)
        r = 0.6 - 0.04 * length
        p.add(cube((0.12, 0.04, length), (x * r, y * r, 1.2 - length / 2), (0, 0, -a)), paint)
        p.add(sphere(0.07, (x * (r + 0.01), y * (r + 0.01), 1.2 - length), segs=8, rings=6), paint)
    # wire handle
    p.add(torus(0.6, 0.025, (0, 0, 1.2), (0, math.pi / 2, 0), segs=16, rsegs=4, scale=(1, 1, 0.8)), rim)
    return p.build(smooth_angle=40)


def tree():
    """A leafy tree: a bark trunk with two boughs, and a canopy of lumpy leaf clusters."""
    p = Part("tree")
    bark, leaves = "#ffffff@bark", "#8fd16a@leaves"
    p.add(lathe([(0.34, 0), (0.26, 0.3), (0.2, 1.8), (0.15, 2.6)], 9, jitter=0.12, seed=4), bark)
    for a, t in ((0.5, 0.7), (2.6, 0.6)):
        p.add(cyl(0.1, 0.06, 1.3, (0, 0, 1.7), (t, 0, a), segs=6), bark)
    rnd = random.Random(9)
    clusters = [(0, 0, 3.4, 1.5), (0.9, 0.3, 2.9, 1.1), (-0.8, 0.5, 3.0, 1.1), (0.2, -0.9, 3.0, 1.1), (-0.3, 0.1, 4.2, 1.0)]
    for x, y, z, r in clusters:
        p.add(ico(r, (x, y, z), (1, 1, 0.85), subd=2, jitter=0.25, seed=rnd.randint(0, 999)), leaves)
    return p.build(smooth_angle=60)


def tower():
    """The centrepiece (named tower in the game): a giant paint pot with a brush, spilling every colour."""
    p = Part("tower")
    tin, rim = TIN, RIM
    colours = ["#ff3b3b", "#ffb703", "#22c55e", "#2f8cff", "#b14cff", "#ff6ec7"]
    # the pot, with rainbow stripes
    p.add(lathe([(1.75, 0), (1.85, 0.1), (1.95, 2.3), (2.0, 2.4)], 28, cap_top=False), tin)
    for k, col in enumerate(colours):
        r = 1.87 + k * 0.016
        p.add(cyl(r, r, 0.22, (0, 0, 0.35 + k * 0.28), segs=28), f"gloss:{col}")
    p.add(torus(1.99, 0.08, (0, 0, 2.4), segs=28, rsegs=6), rim)
    p.add(cyl(1.93, 1.93, 0.05, (0, 0, 2.3), segs=28), "gloss:#ff4fb8")
    # paint spilling over the rim in each colour
    for k, col in enumerate(colours):
        a = k * math.tau / 6 + 0.3
        x, y = math.sin(a), math.cos(a)
        length = 0.8 + (k % 3) * 0.45
        p.add(cube((0.42, 0.06, length), (x * 2.0, y * 2.0, 2.4 - length / 2), (0, 0, -a)), f"gloss:{col}")
        p.add(sphere(0.24, (x * 2.02, y * 2.02, 2.4 - length), (1, 0.6, 1), segs=10, rings=6), f"gloss:{col}")
    # a big brush leaning in the pot
    tilt = (0.35, 0.2, 0)
    m = kit.Euler(tilt).to_matrix()
    base = kit.Vector((0.3, -0.2, 2.0))
    p.add(cyl(0.12, 0.1, 2.6, base, tilt, segs=10), "gloss:#d39a55")
    p.add(cyl(0.2, 0.2, 0.35, base + m @ kit.Vector((0, 0, 2.5)), tilt, segs=12), rim)
    p.add(cube((0.55, 0.22, 0.7), base + m @ kit.Vector((0, 0, 3.15)), tilt, bevel=0.06), "#f6e2b3")
    p.add(cube((0.57, 0.24, 0.28), base + m @ kit.Vector((0, 0, 3.4)), tilt, bevel=0.06), "gloss:#ff4fb8")
    # puddles around the base
    for k, col in enumerate(colours):
        a = k * math.tau / 6 + 0.75
        r = 0.7 + (k % 2) * 0.3
        p.add(cyl(r, r, 0.04, (math.sin(a) * 2.2, math.cos(a) * 2.2, 0.0), segs=14), f"gloss:{col}")
    return p.build(smooth_angle=30)


def tires():
    """Three old tractor tyres in a wobbly stack."""
    o = kit.import_model("old_tyre", "tires", tris=1200)
    o.data.transform(kit.Matrix.Rotation(math.pi / 2, 4, "X"))  # the model stands on its tread
    kit.fit(o, length=1.7)
    me = o.data
    h = max(v.co.z for v in me.vertices)
    bm = bmesh.new()
    bm.from_mesh(me)
    stack = bmesh.new()
    for i, (x, y, a, tilt) in enumerate(((0, 0, 0.0, 0.0), (0.1, -0.06, 0.7, 0.03), (-0.06, 0.08, 1.9, -0.04))):
        layer = bm.copy()
        kit.xf(layer, (x, y, i * h * 0.97), (tilt, 0, a))
        tmp = bpy.data.meshes.new("tmp")
        layer.to_mesh(tmp)
        stack.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    stack.to_mesh(me)
    return o


def pad():
    p = Part("pad")
    p.add(cyl(1.2, 1.15, 0.06, (0, 0, 0), segs=24), "steel")
    p.add(lathe([(0.82, 0.05), (1.08, 0.05), (1.08, 0.1), (0.82, 0.1)], 24, cap_bottom=False, cap_top=False), "glow:#33e6ff")
    # closing the ring's profile
    p.add(lathe([(0.82, 0.1), (0.82, 0.05)], 24, cap_bottom=False, cap_top=False), "glow:#33e6ff")
    p.add(cyl(0.8, 0.8, 0.03, (0, 0, 0.05), segs=24), "#3a4250")
    for a in range(4):  # four arrow chevrons pointing in
        rot = (0, 0, a * math.pi / 2)
        m = kit.Euler(rot).to_matrix()
        c = m @ kit.Vector((0, 0.5, 0.085))
        p.add(kit.xf(prism([(-0.22, 0.0), (0, 0.12), (0.22, 0.0), (0.22, -0.08), (0, 0.04), (-0.22, -0.08)], 0.03, rot=(math.pi / 2, 0, 0)), c, rot), "glow:#33e6ff")
    p.add(cyl(0.16, 0.16, 0.02, (0, 0, 0.08), segs=12), "glow:#b8f6ff")
    return p.build(smooth_angle=30)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    roots = [crate(), wall(), rock(), barrel(), tree(), tower(), tires(), pad()]
    kit.stats(roots)
    for r in roots:
        print(f"  {r.name:10s} {kit.tris(r)} tris")
    kit.export(OUT, roots)


main()
