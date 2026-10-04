"""
Splat Tanks arena props: exports ../public/models/arena.glb with one root mesh node per prop,
each standing on its own origin (base centre) at the world origin. 1 unit = 1 m.

  crate, wall, rock, barrel (paint bucket), tree, tower (giant paint pot), tires, pad

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

WOOD, WOOD_DARK = "#d39a55", "#8f5a2b"
CONCRETE, CONCRETE_DARK = "#bdb8ae", "#7f7b74"
YELLOW, BLACK = "#ffc61a", "#22242a"


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
    for k in (-0.46, 0.0, 0.46):  # plank grooves
        p.add(cube((1.86, 0.03, 0.03), (0, -0.93, 1 + k)), "#a8713a")
        p.add(cube((0.03, 1.86, 0.03), (0.93, 0, 1 + k)), "#a8713a")
        p.add(cube((0.03, 1.86, 0.03), (-0.93, 0, 1 + k)), "#a8713a")
        p.add(cube((1.86, 0.03, 0.03), (0, 0.93, 1 + k)), "#a8713a")
    return p.build(smooth_angle=20)


def wall():
    p = Part("wall")
    # front outline with a chipped top-right corner and a bite out of the top-left
    outline = [(-2, 0), (2, 0), (2, 1.2), (1.72, 1.42), (1.45, 1.6), (-0.9, 1.6), (-1.05, 1.42), (-1.35, 1.38), (-1.5, 1.6), (-2, 1.6)]
    p.add(prism(outline, 1.0, (0, 0, 0)), CONCRETE)
    p.add(cube((4.04, 1.04, 0.16), (0, 0, 0.08)), CONCRETE_DARK)  # footing
    # block joints
    for z in (0.55, 1.05):
        for s in (-1, 1):
            p.add(cube((3.98, 0.02, 0.035), (0, s * 0.505, z)), CONCRETE_DARK)
    for x, z in ((-1.0, 0.3), (0.6, 0.3), (-0.2, 0.8), (1.3, 0.8), (-1.3, 1.3), (0.4, 1.3)):
        for s in (-1, 1):
            p.add(cube((0.035, 0.02, 0.46), (x, s * 0.505, z)), CONCRETE_DARK)
    # hazard stripe band on both faces
    for s in (-1, 1):
        p.add(cube((4.0, 0.03, 0.3), (0, s * 0.51, 0.82)), YELLOW)
        for k in range(10):
            x = -1.8 + k * 0.4
            p.add(prism([(-0.07, -0.15), (0.07, -0.15), (0.2, 0.15), (0.06, 0.15)], 0.035, (x, s * 0.515, 0.82)), BLACK)
    # chips: darker exposed patches and rubble at the broken corner
    rnd = random.Random(3)
    for x, y, z in ((1.75, 0.5, 1.25), (-1.2, -0.5, 1.45), (-1.9, 0.5, 0.35), (0.9, -0.5, 0.25)):
        p.add(kit.jitter(ico(0.13, (x, y, z), subd=1), 0.06, seed=rnd.randint(0, 99)), CONCRETE_DARK)
    for x, y in ((1.7, 0.45), (1.88, -0.3)):
        p.add(kit.jitter(ico(0.12, (x, y, 0.1), subd=1), 0.05, seed=int(x * 10)), CONCRETE)
    # rebar poking out of the broken corner
    for x, a in ((1.6, 0.35), (1.78, -0.25)):
        p.add(cyl(0.025, 0.025, 0.4, (x, 0.15, 1.35), (0, a, 0), segs=5), "#9a4a2a")
    return p.build(smooth_angle=20)


def rock():
    p = Part("rock")
    moss = "#6fae4a"

    def boulder(r, loc, scale, seed, color, mossy):
        bm = ico(r, (0, 0, 0), scale, subd=1, jitter=0.3, seed=seed)
        kit.jitter(bm, r * 0.12, seed)
        kit.xf(bm, loc)
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(0, 0, 0.02), plane_no=(0, 0, 1), clear_inner=True)
        bm.normal_update()
        p.add(bm, color, moss, (lambda f: f.normal.z > 0.82) if mossy else None)

    boulder(1.0, (0.15, 0.05, 0.75), (1.3, 1.2, 1.3), 7, "#8e929c", True)
    boulder(0.7, (-0.75, -0.6, 0.4), (1.1, 1.0, 1.0), 11, "#a3a7b0", True)
    boulder(0.45, (0.8, -0.85, 0.22), (1.0, 1.1, 0.9), 5, "#7c808a", False)
    boulder(0.35, (-0.9, 0.75, 0.15), (1.0, 1.0, 0.8), 3, "#8e929c", False)
    return p.build(smooth_angle=5)


def barrel():
    """A paint bucket (named barrel in the game): white tin, pink paint on top, drips down the side."""
    p = Part("barrel")
    tin, rim, paint = "gloss:#f4f1ea", "metal:#c9ccd2", "gloss:#ff4fb8"
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
    p = Part("tree")
    p.add(cyl(0.28, 0.2, 1.4, (0, 0, 0), segs=8), "#7a4a26")
    tiers = [(1.05, 1.0, 1.7, "#2f8a3e"), (0.85, 2.0, 1.55, "#38a047"), (0.62, 2.95, 1.35, "#43b553"), (0.38, 3.85, 1.15, "#4fc45e")]
    for k, (r, z, h, col) in enumerate(tiers):
        p.add(lathe([(r, 0), (r * 0.98, 0.12), (0, h)], 8, (0, 0, z), phase=k * 0.4), col)
        p.add(lathe([(r * 0.6, -0.1), (r, 0)], 8, (0, 0, z), phase=k * 0.4, cap_top=False), "#276f33")
    return p.build(smooth_angle=10)


def tower():
    """The centrepiece (named tower in the game): a giant paint pot with a brush, spilling every colour."""
    p = Part("tower")
    tin, rim = "gloss:#f4f1ea", "metal:#c9ccd2"
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
    p = Part("tires")
    rubber, hub = "#26282e", "#45484f"
    stack = [(0, 0, 0.27, 0.0), (0.12, -0.08, 0.77, 0.3), (-0.08, 0.1, 1.27, 0.7)]
    for i, (x, y, z, a) in enumerate(stack):
        p.add(torus(0.55, 0.25, (x, y, z), (0.03 * (i - 1), 0, a), segs=16, rsegs=8, scale=(1, 1, 1.0)), rubber)
        p.add(torus(0.57, 0.03, (x, y, z + 0.235), (0.03 * (i - 1), 0, a), segs=16, rsegs=4), hub if i != 1 else YELLOW)
        for k in range(8):  # tread blocks
            t = k / 8 * math.tau + a
            p.add(cube((0.06, 0.12, 0.34), (x + math.cos(t) * 0.78, y + math.sin(t) * 0.79, z), (0, 0, t)), "#1a1c20")
    return p.build(smooth_angle=50)


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
