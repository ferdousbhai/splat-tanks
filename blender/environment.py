"""
Splat Tanks sky and ground: copies a Poly Haven HDRI to ../public/env/sky.hdr, writes the ground
texture sets to ../public/textures/, and writes ../public/env/sky.json with the sun's direction found
in the HDRI (three.js axes), so the game's shadow-casting sun matches the sky.

Run with:  blender --background --python environment.py
"""
import json
import math
import os
import shutil
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import polyhaven  # noqa: E402

PUBLIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
SKY = "kloofendal_48d_partly_cloudy_puresky"
GROUND = {"sand": "playground_sand", "grass": "leafy_grass"}  # name in the game -> Poly Haven asset
SIZE = 1024


def sun_direction(path):
    """The brightest spot of an equirectangular HDRI as a three.js direction (y up)."""
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)  # rows run bottom to top
    lum = px[..., 0] * 0.2126 + px[..., 1] * 0.7152 + px[..., 2] * 0.0722
    row, col = np.unravel_index(np.argmax(lum), lum.shape)
    u, v = (col + 0.5) / w, (row + 0.5) / h
    # three.js equirectUv: u = atan2(z, x) / 2pi + 0.5, v = asin(y) / pi + 0.5
    az, el = (u - 0.5) * 2 * math.pi, (v - 0.5) * math.pi
    return [math.cos(el) * math.cos(az), math.sin(el), math.cos(el) * math.sin(az)], float(lum[row, col])


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(os.path.join(PUBLIC, "env"), exist_ok=True)
    os.makedirs(os.path.join(PUBLIC, "textures"), exist_ok=True)

    hdr = polyhaven.hdri(SKY)
    shutil.copyfile(hdr, os.path.join(PUBLIC, "env", "sky.hdr"))
    sun, peak = sun_direction(hdr)
    meta = {"source": f"https://polyhaven.com/a/{SKY}", "sun": [round(c, 4) for c in sun]}
    json.dump(meta, open(os.path.join(PUBLIC, "env", "sky.json"), "w"), indent=2)
    print(f"sky: sun {meta['sun']} (peak {peak:.0f})")

    for name, asset in GROUND.items():
        for kind, path in polyhaven.texture(asset).items():
            img = bpy.data.images.load(path)
            kit.shrink(img, SIZE)
            out = os.path.join(PUBLIC, "textures", f"{name}_{kind.split('_')[0]}.jpg")
            img.file_format = "JPEG"
            img.save(filepath=out, quality=82)
            print(f"  {out} ({os.path.getsize(out)} bytes)")


main()
