"""
Splat Tanks tanks: exports ../public/models/tanks.glb with roots tank_1..tank_4.

  tank_N
    hull                     tracks + body (mesh)
    turret                   origin = turret yaw pivot (rotate about Blender Z / three.js Y)
      barrel                 origin = barrel base, points +Y (three.js -Z); recoil along local Y
        muzzle               empty at the barrel tip
  tank_4 has barrel_L/barrel_R with muzzle_L/muzzle_R instead.

Run with:  blender --background --python tanks.py
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from kit import TO_NEG_Y, TO_X, TO_Y, Part, cube, cyl, empty, frustum, lathe, loft, side_prism, sphere, stadium  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models", "tanks.glb")


# --- Shared pieces ------------------------------------------------------------------------


def tracks(hull, L, W, tw, th, wheels, skirt=False):
    """Two tracks with tread bumps on top and road wheels on the outer side."""
    for s in (-1, 1):
        x = s * (W / 2 - tw / 2)
        hull.add(side_prism(stadium(L, th, th / 2, segs=4), tw, (x, 0, 0)), "dark")
        # tread bumps over the top run and the curved ends
        n = int((L - th) / 0.2)
        for k in range(n + 1):
            y = -(L - th) / 2 + k * (L - th) / n
            hull.add(cube((tw + 0.04, 0.09, 0.06), (x, y, th + 0.01)), "darker")
        for end in (-1, 1):
            for a in (0.45, 0.9, 1.35):
                yy = end * ((L / 2 - th / 2) + math.sin(a) * th / 2)
                zz = th / 2 + math.cos(a) * th / 2
                hull.add(cube((tw + 0.04, 0.09, 0.06), (x, yy, zz), (-end * a, 0, 0)), "darker")
        if skirt:
            continue
        # road wheels: hubs on the outer face
        r = th * 0.3
        span = L - th * 1.1
        for k in range(wheels):
            y = -span / 2 + k * span / (wheels - 1)
            ox = s * W / 2
            hull.add(cyl(r, r, 0.05, (ox, y, th * 0.45), TO_X if s > 0 else kit.TO_NEG_X, segs=10), "steel")
            hull.add(cyl(r * 0.45, r * 0.45, 0.08, (ox, y, th * 0.45), TO_X if s > 0 else kit.TO_NEG_X, segs=8), "metal")


def headlights(hull, xs, y, z, r=0.09):
    for x in xs:
        hull.add(cyl(r * 1.3, r * 1.3, 0.08, (x, y - 0.04, z), TO_Y, segs=10), "steel")
        hull.add(cyl(r, r * 0.9, 0.1, (x, y - 0.02, z), TO_Y, segs=10), "light")


def exhausts(hull, xs, y, z, r=0.08, length=0.25):
    for x in xs:
        hull.add(cyl(r, r, length, (x, y + 0.05, z), TO_NEG_Y, segs=10), "steel")
        hull.add(cyl(r * 0.6, r * 0.6, 0.02, (x, y + 0.05 - length, z), TO_NEG_Y, segs=8), "darker")


def rivets(part, pts, r=0.035, color="metal"):
    for p in pts:
        part.add(sphere(r, p, segs=6, rings=4), color)


def hull_body(hull, L, Wb, z0, z1, glacis=0.45, nose=0.12, back=0.2, color="tint"):
    """Upper hull: a side profile with a sloped front glacis, extruded across Wb."""
    prof = [(-L / 2 + 0.02, z0), (L / 2, z0), (L / 2, z0 + nose), (L / 2 - glacis, z1), (-L / 2 + back, z1), (-L / 2, z1 - 0.1)]
    hull.add(side_prism(prof, Wb), color)


def finish(root_name, hull, turret, pivot, barrels):
    """barrels: list of (name, muzzle_name, Part, base point, length) all modelled in tank coordinates."""
    root = empty(root_name, size=0.5)
    hull.build(root)
    t = turret.build(root, location=pivot, pivot=pivot)
    for name, mname, part, base, length in barrels:
        b = part.build(t, location=Vector(base) - Vector(pivot), pivot=base)
        empty(mname, b, (0, length, 0), size=0.15)
    return root


# --- Tier 1: Scout ------------------------------------------------------------------------


def tank_1():
    L, W, tw, th = 2.4, 1.8, 0.46, 0.5
    hull, turret, barrel = Part("hull"), Part("turret"), Part("barrel")
    tracks(hull, L, W, tw, th, wheels=4)
    Wb = W - 2 * tw + 0.24
    z0, z1 = 0.18, th + 0.3
    hull.add(cube((W - 2 * tw + 0.02, L - 0.4, th - 0.1), (0, 0, z0 + (th - 0.1) / 2 - 0.05)), "steel")
    hull_body(hull, L - 0.15, Wb, th - 0.12, z1, glacis=0.5)
    # mudguards over the tracks, short at the front
    for s in (-1, 1):
        hull.add(cube((tw + 0.06, 0.45, 0.05), (s * (W / 2 - tw / 2), L / 2 - 0.3, th + 0.08), (0.25, 0, 0)), "tint")
    headlights(hull, (-0.3, 0.3), L / 2 - 0.06, th + 0.02, r=0.08)
    exhausts(hull, (0.3,), -(L - 0.15) / 2, z1 - 0.15, r=0.07)
    rivets(hull, [(sx * (Wb / 2 - 0.08), y, z1) for sx in (-1, 1) for y in (-0.6, -0.2, 0.2)])
    # turret: a rounded toy dome
    pivot = (0, -0.12, z1)
    px, py, pz = pivot
    turret.add(lathe([(0.56, 0), (0.58, 0.12), (0.5, 0.3), (0.3, 0.42), (0, 0.45)], 14, (px, py, pz)), "tint")
    turret.add(cyl(0.6, 0.6, 0.06, (px, py, pz - 0.01), segs=14), "steel")
    turret.add(cyl(0.17, 0.17, 0.08, (px - 0.12, py - 0.12, pz + 0.38), segs=10), "steel")
    turret.add(cube((0.32, 0.2, 0.24), (px, py + 0.52, pz + 0.2), bevel=0.04), "steel")
    # antenna with a red tip
    turret.add(cyl(0.05, 0.05, 0.06, (px + 0.3, py - 0.32, pz + 0.3), segs=6), "darker")
    turret.add(cyl(0.015, 0.015, 1.0, (px + 0.3, py - 0.32, pz + 0.33), (0.18, 0, 0), segs=4), "darker")
    turret.add(sphere(0.05, (px + 0.3, py - 0.32 - math.sin(0.18) * 1.0, pz + 0.33 + math.cos(0.18) * 1.0), segs=6, rings=4), "red")
    base = (px, py + 0.6, pz + 0.2)
    bx, by, bz = base
    blen = 1.0
    barrel.add(cyl(0.09, 0.08, blen, base, TO_Y, segs=10), "steel")
    barrel.add(cyl(0.11, 0.11, 0.12, (bx, by + blen - 0.12, bz), TO_Y, segs=10), "darker")
    return finish("tank_1", hull, turret, pivot, [("barrel", "muzzle", barrel, base, blen)])


# --- Tier 2: Striker ----------------------------------------------------------------------


def tank_2():
    L, W, tw, th = 2.6, 2.0, 0.48, 0.55
    hull, turret, barrel = Part("hull"), Part("turret"), Part("barrel")
    tracks(hull, L, W, tw, th, wheels=5, skirt=True)
    Wb = W - 2 * tw + 0.3
    z1 = th + 0.32
    hull.add(cube((W - 2 * tw + 0.02, L - 0.4, th - 0.1), (0, 0, th / 2)), "steel")
    hull_body(hull, L - 0.1, Wb, th - 0.14, z1, glacis=0.55)
    # side skirts: tinted panels hanging over the tracks with a dark lower lip
    for s in (-1, 1):
        x = s * (W / 2 + 0.02)
        hull.add(cube((0.07, L - 0.55, th * 0.5), (x, 0, th * 0.62), bevel=0.02), "tint")
        hull.add(cube((0.08, L - 0.55, 0.06), (x, 0, th * 0.36)), "darker")
        for y in (-0.7, 0, 0.7):
            hull.add(cube((0.09, 0.05, th * 0.5), (x, y, th * 0.62)), "steel")
        rivets(hull, [(x + s * 0.035, y, th * 0.78) for y in (-0.95, -0.35, 0.35, 0.95)], r=0.03)
        # fender over the track
        hull.add(cube((tw + 0.08, L - 0.3, 0.05), (s * (W / 2 - tw / 2 + 0.02), 0, th + 0.07)), "tint")
    headlights(hull, (-0.36, 0.36), L / 2 - 0.15, th + 0.12)
    exhausts(hull, (-0.28, 0.28), -(L - 0.1) / 2, z1 - 0.16)
    hull.add(cube((Wb - 0.3, 0.5, 0.05), (0, -0.85, z1 + 0.02)), "steel")  # engine deck grille
    for k in range(4):
        hull.add(cube((Wb - 0.38, 0.05, 0.04), (0, -1.03 + k * 0.12, z1 + 0.06)), "darker")
    # angular turret
    pivot = (0, -0.1, z1)
    px, py, pz = pivot
    plan_b = [(-0.55, -0.55), (0.55, -0.55), (0.62, 0.15), (0.35, 0.62), (-0.35, 0.62), (-0.62, 0.15)]
    plan_t = [(-0.45, -0.5), (0.45, -0.5), (0.5, 0.1), (0.28, 0.48), (-0.28, 0.48), (-0.5, 0.1)]
    turret.add(loft(plan_b, plan_t, 0, 0.4, (px, py, pz)), "tint")
    turret.add(cube((0.95, 0.3, 0.26), (px, py - 0.62, pz + 0.18), bevel=0.03), "steel")  # bustle box
    turret.add(cyl(0.18, 0.16, 0.12, (px + 0.2, py - 0.15, pz + 0.4), segs=10), "steel")  # cupola
    turret.add(cyl(0.03, 0.03, 0.35, (px + 0.2, py - 0.05, pz + 0.55), TO_Y, segs=6), "darker")  # MG
    turret.add(cube((0.36, 0.16, 0.3), (px, py + 0.62, pz + 0.2), bevel=0.04), "steel")  # mantlet
    rivets(turret, [(px + x, py + y, pz + 0.4) for x, y in ((-0.35, -0.3), (0.35, -0.3), (-0.3, 0.3), (0.3, 0.3))])
    turret.add(cyl(0.04, 0.04, 0.02, (px - 0.25, py - 0.4, pz + 0.4), segs=6), "darker")
    turret.add(cyl(0.012, 0.012, 0.7, (px - 0.25, py - 0.4, pz + 0.4), (0.15, 0, 0), segs=4), "darker")
    base = (px, py + 0.68, pz + 0.2)
    bx, by, bz = base
    blen = 1.5
    barrel.add(cyl(0.085, 0.075, blen - 0.25, base, TO_Y, segs=10), "steel")
    # muzzle brake: a block with dark side slots
    barrel.add(cube((0.26, 0.28, 0.18), (bx, by + blen - 0.14, bz), bevel=0.03), "steel")
    for k in (-1, 1):
        barrel.add(cube((0.28, 0.05, 0.1), (bx, by + blen - 0.14 + k * 0.07, bz)), "darker")
    return finish("tank_2", hull, turret, pivot, [("barrel", "muzzle", barrel, base, blen)])


# --- Tier 3: Juggernaut -------------------------------------------------------------------


def tank_3():
    L, W, tw, th = 2.7, 2.15, 0.54, 0.6
    hull, turret, barrel = Part("hull"), Part("turret"), Part("barrel")
    tracks(hull, L, W, tw, th, wheels=5)
    Wb = W - 2 * tw + 0.34
    z1 = th + 0.4
    hull.add(cube((W - 2 * tw + 0.02, L - 0.4, th - 0.1), (0, 0, th / 2)), "steel")
    hull_body(hull, L - 0.05, Wb, th - 0.16, z1, glacis=0.6, nose=0.18)
    # thick sloped fenders over the tracks, front plough plate
    for s in (-1, 1):
        x = s * (W / 2 - tw / 2 + 0.03)
        prof = [(-L / 2 + 0.05, 0), (L / 2 - 0.15, 0), (L / 2 + 0.02, -0.12), (L / 2 - 0.1, 0.1), (-L / 2 + 0.2, 0.1)]
        hull.add(side_prism([(y, z + th + 0.06) for y, z in prof], tw + 0.12, (x, 0, 0)), "tint")
        # spare track links strapped on the fender side
        for k in range(4):
            y = -0.75 + k * 0.32
            hull.add(cube((0.07, 0.28, 0.2), (s * (W / 2 + 0.07), y, th * 0.78), bevel=0.02), "dark")
            hull.add(cube((0.09, 0.08, 0.12), (s * (W / 2 + 0.08), y, th * 0.78)), "darker")
        hull.add(cube((0.1, 0.05, 0.26), (s * (W / 2 + 0.09), -0.95, th * 0.78)), "steel")
        hull.add(cube((0.1, 0.05, 0.26), (s * (W / 2 + 0.09), 0.37, th * 0.78)), "steel")
    hull.add(frustum((Wb / 2 + 0.05, 0.12), (Wb / 2 - 0.02, 0.06), 0.3, (0, L / 2 + 0.02, 0.2)), "steel")  # plough
    headlights(hull, (-0.62, 0.62), L / 2 + 0.08, th + 0.25, r=0.09)
    exhausts(hull, (-0.32, 0.32), -(L - 0.05) / 2, z1 - 0.18, r=0.1)
    rivets(hull, [(sx * (Wb / 2 - 0.08), y, z1) for sx in (-1, 1) for y in (-1.0, -0.6, -0.2, 0.2, 0.6)], r=0.04)
    rivets(hull, [(x, L / 2 - 0.12, th + 0.12) for x in (-0.4, -0.13, 0.13, 0.4)], r=0.04)
    # big wedge turret with cheek armour
    pivot = (0, -0.15, z1)
    px, py, pz = pivot
    plan_b = [(-0.62, -0.65), (0.62, -0.65), (0.75, 0.0), (0.45, 0.72), (-0.45, 0.72), (-0.75, 0.0)]
    plan_t = [(-0.5, -0.6), (0.5, -0.6), (0.6, -0.05), (0.32, 0.5), (-0.32, 0.5), (-0.6, -0.05)]
    turret.add(loft(plan_b, plan_t, 0, 0.5, (px, py, pz)), "tint")
    turret.add(loft(kit.scaled(plan_t, 0.5), kit.scaled(plan_t, 0.42), 0, 0.05, (px, py - 0.05, pz + 0.5)), "steel")
    turret.add(cube((1.1, 0.35, 0.32), (px, py - 0.75, pz + 0.22), bevel=0.04), "steel")
    for s in (-1, 1):  # spare track links on the turret cheeks too
        turret.add(cube((0.08, 0.3, 0.22), (px + s * 0.7, py - 0.3, pz + 0.24), (0, 0, s * 0.08), bevel=0.02), "dark")
    turret.add(cyl(0.2, 0.18, 0.16, (px - 0.22, py - 0.2, pz + 0.5), segs=10), "steel")
    turret.add(cyl(0.12, 0.12, 0.05, (px - 0.22, py - 0.2, pz + 0.66), segs=10), "darker")
    turret.add(cube((0.5, 0.22, 0.4), (px, py + 0.78, pz + 0.24), bevel=0.05), "steel")
    rivets(turret, [(px + x, py + y, pz + 0.5) for x, y in ((-0.42, -0.45), (0.42, -0.45), (0.5, 0.0), (-0.5, 0.0), (0.25, 0.4), (-0.25, 0.4))], r=0.04)
    base = (px, py + 0.86, pz + 0.24)
    bx, by, bz = base
    blen = 1.6
    barrel.add(cyl(0.13, 0.11, blen - 0.2, base, TO_Y, segs=12), "steel")
    barrel.add(cyl(0.17, 0.17, 0.35, (bx, by + 0.55, bz), TO_Y, segs=12), "tint")  # fume extractor
    barrel.add(cyl(0.16, 0.16, 0.22, (bx, by + blen - 0.22, bz), TO_Y, segs=12), "darker")
    return finish("tank_3", hull, turret, pivot, [("barrel", "muzzle", barrel, base, blen)])


# --- Tier 4: Titan --------------------------------------------------------------------------


def tank_4():
    L, W, tw, th = 3.0, 2.3, 0.58, 0.66
    hull, turret = Part("hull"), Part("turret")
    tracks(hull, L, W, tw, th, wheels=6)
    Wb = W - 2 * tw + 0.36
    z1 = th + 0.44
    orange, cyan = "glow:#ff7a1a", "glow:#33e6ff"
    hull.add(cube((W - 2 * tw + 0.02, L - 0.4, th - 0.1), (0, 0, th / 2)), "steel")
    hull_body(hull, L - 0.05, Wb, th - 0.16, z1, glacis=0.65, nose=0.2)
    for s in (-1, 1):
        x = s * (W / 2 - tw / 2 + 0.04)
        prof = [(-L / 2 + 0.05, 0), (L / 2 - 0.2, 0), (L / 2 + 0.05, -0.16), (L / 2 - 0.15, 0.12), (-L / 2 + 0.2, 0.12)]
        hull.add(side_prism([(y, z + th + 0.06) for y, z in prof], tw + 0.14, (x, 0, 0)), "tint")
        # gold trim and a cyan power strip along the fender
        hull.add(cube((0.05, L - 0.4, 0.05), (s * (W / 2 + 0.1), 0, th + 0.12)), "gold")
        hull.add(cube((0.04, L - 0.9, 0.07), (s * (W / 2 + 0.11), -0.1, th + 0.01)), cyan)
        # shoulder armour spikes
        for y in (-0.6, 0.2):
            hull.add(cyl(0.08, 0.0, 0.2, (s * (W / 2 + 0.1), y, th + 0.25), (0, s * 1.2, 0), segs=6), "gold")
    # gold ram on the nose
    hull.add(frustum((Wb / 2 + 0.1, 0.14), (Wb / 2, 0.06), 0.34, (0, L / 2 + 0.04, 0.2)), "gold")
    for x in (-0.45, -0.15, 0.15, 0.45):
        hull.add(cyl(0.07, 0.0, 0.18, (x, L / 2 + 0.12, 0.37), TO_Y, segs=6), "gold")
    headlights(hull, (-0.68, 0.68), L / 2 + 0.06, th + 0.28, r=0.1)
    # glowing engine vents on the back deck
    hull.add(cube((Wb - 0.25, 0.42, 0.06), (0, -1.22, z1 + 0.02)), "darker")
    for k in range(3):
        hull.add(cube((Wb - 0.4, 0.07, 0.05), (0, -1.36 + k * 0.13, z1 + 0.05)), orange)
    exhausts(hull, (-0.4, 0.4), -(L - 0.05) / 2, z1 - 0.2, r=0.11)
    for x in (-0.4, 0.4):
        hull.add(cyl(0.07, 0.07, 0.02, (x, -(L - 0.05) / 2 - 0.22, z1 - 0.2), TO_NEG_Y, segs=8), orange)
    rivets(hull, [(sx * (Wb / 2 - 0.08), y, z1) for sx in (-1, 1) for y in (-0.5, -0.1, 0.3, 0.7)], r=0.045, color="gold")
    # huge turret
    pivot = (0, -0.15, z1)
    px, py, pz = pivot
    plan_b = [(-0.72, -0.72), (0.72, -0.72), (0.85, 0.0), (0.58, 0.78), (-0.58, 0.78), (-0.85, 0.0)]
    plan_t = [(-0.6, -0.66), (0.6, -0.66), (0.7, -0.05), (0.45, 0.55), (-0.45, 0.55), (-0.7, -0.05)]
    turret.add(loft(plan_b, plan_t, 0, 0.58, (px, py, pz)), "tint")
    turret.add(loft(kit.scaled(plan_t, 1.02), kit.scaled(plan_t, 0.98), 0, 0.05, (px, py, pz + 0.56)), "gold")  # gold crown trim
    turret.add(loft(kit.scaled(plan_t, 0.9), kit.scaled(plan_t, 0.88), 0, 0.03, (px, py, pz + 0.6)), "tint")
    turret.add(loft(kit.scaled(plan_t, 0.45), kit.scaled(plan_t, 0.38), 0, 0.08, (px - 0.15, py + 0.05, pz + 0.62)), "steel")
    # side vents glowing cyan, rear orange
    for s in (-1, 1):
        for k in range(3):
            turret.add(cube((0.06, 0.32, 0.05), (px + s * 0.79, py - 0.3 + 0.0, pz + 0.14 + k * 0.12), (0, s * -0.2, 0)), cyan)
    turret.add(cube((1.2, 0.3, 0.36), (px, py - 0.74, pz + 0.24), bevel=0.04), "steel")
    for k in range(3):
        turret.add(cube((1.0, 0.04, 0.06), (px, py - 0.9, pz + 0.12 + k * 0.11)), orange)
    # sensor dome
    turret.add(cyl(0.2, 0.2, 0.12, (px + 0.3, py - 0.25, pz + 0.62), segs=10), "steel")
    turret.add(sphere(0.13, (px + 0.3, py - 0.25, pz + 0.76), segs=10, rings=6), cyan)
    # twin mantlet
    turret.add(cube((0.95, 0.24, 0.44), (px, py + 0.84, pz + 0.27), bevel=0.06), "steel")
    turret.add(cube((0.97, 0.05, 0.05), (px, py + 0.97, pz + 0.45)), "gold")
    barrels = []
    blen = 1.7
    for side, sx in (("L", -0.24), ("R", 0.24)):
        b = Part("barrel_" + side)
        base = (px + sx, py + 0.94, pz + 0.27)
        bx, by, bz = base
        b.add(cyl(0.11, 0.095, blen - 0.25, base, TO_Y, segs=10), "steel")
        b.add(cyl(0.13, 0.13, 0.12, (bx, by + 0.3, bz), TO_Y, segs=10), "gold")
        b.add(cyl(0.12, 0.12, 0.06, (bx, by + blen - 0.45, bz), TO_Y, segs=10), cyan)
        b.add(cyl(0.15, 0.15, 0.26, (bx, by + blen - 0.26, bz), TO_Y, segs=10), "darker")
        b.add(cyl(0.155, 0.155, 0.05, (bx, by + blen - 0.06, bz), TO_Y, segs=10), "gold")
        barrels.append(("barrel_" + side, "muzzle_" + side, b, base, blen))
    return finish("tank_4", hull, turret, pivot, barrels)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    roots = [tank_1(), tank_2(), tank_3(), tank_4()]
    kit.stats(roots)
    kit.export(OUT, roots)


main()
