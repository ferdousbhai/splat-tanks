"""
Poly Haven (https://polyhaven.com, CC0) downloads for the Blender scripts, cached in blender/.polyhaven/.

  texture('playground_sand')  -> {'diff': path, 'nor_gl': path, 'arm': path}
  model('old_tyre')           -> path to the .gltf (its .bin and textures sit next to it)
  hdri('kloofendal_48d_partly_cloudy_puresky') -> path to the .hdr

Plain urllib, so it runs inside Blender's Python and outside it.
"""
import json
import os
import urllib.request

API = "https://api.polyhaven.com"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".polyhaven")
HEADERS = {"User-Agent": "splat-tanks-build/1.0"}


def _get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as r:
        return r.read()


def _fetch(url, path):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print(f"  polyhaven: {url}")
        data = _get(url)
        with open(path + ".part", "wb") as f:
            f.write(data)
        os.replace(path + ".part", path)
    return path


def files(asset):
    path = os.path.join(CACHE, asset, "files.json")
    if not os.path.exists(path):
        _fetch(f"{API}/files/{asset}", path)
    return json.load(open(path))


def texture(asset, res="1k", maps=("diff", "nor_gl", "arm")):
    """The JPEG maps of a texture. 'diff' is the colour, 'nor_gl' the OpenGL normal map, 'arm' = AO/rough/metal."""
    keys = {"diff": "Diffuse", "nor_gl": "nor_gl", "arm": "arm"}
    f = files(asset)
    out = {}
    for m in maps:
        url = f[keys[m]][res]["jpg"]["url"]
        out[m] = _fetch(url, os.path.join(CACHE, asset, res, os.path.basename(url)))
    return out


def model(asset, res="1k"):
    g = files(asset)["gltf"][res]["gltf"]
    root = os.path.join(CACHE, asset, res)
    for rel, inc in g["include"].items():
        _fetch(inc["url"], os.path.join(root, rel))
    return _fetch(g["url"], os.path.join(root, os.path.basename(g["url"])))


def hdri(asset, res="1k"):
    url = files(asset)["hdri"][res]["hdr"]["url"]
    return _fetch(url, os.path.join(CACHE, asset, res, os.path.basename(url)))
