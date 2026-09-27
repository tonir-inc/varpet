"""Check every bpy-wall2 GLB: back plane at glTF z = -d/2 (min z), area of triangles lying on it, emissive for lamps.

uv run python blender/wall2/verify.py
"""
import json
import struct
from pathlib import Path

import numpy as np

DIR = Path(__file__).resolve().parents[2] / "data/extra/bpy-wall2"
TYPES = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}
N = {"SCALAR": 1, "VEC3": 3}


def read(path):
    raw = path.read_bytes()
    jl = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + jl])
    binary = raw[20 + jl + 8:]

    def acc(i):
        a = doc["accessors"][i]
        v = doc["bufferViews"][a["bufferView"]]
        off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        return np.frombuffer(binary, TYPES[a["componentType"]], a["count"] * N[a["type"]], off).reshape(a["count"], -1)
    tris = []
    for mesh in doc["meshes"]:
        for p in mesh["primitives"]:
            pos = acc(p["attributes"]["POSITION"])
            idx = acc(p["indices"]).ravel()
            tris.append(pos[idx].reshape(-1, 3, 3))
    return doc, np.concatenate(tris)


bad = 0
for e in json.loads((DIR / "entries.json").read_text()):
    doc, t = read(DIR / e["glb"])
    half = e["size_m"][1] / 2
    zmin = float(t[..., 2].min())
    on = np.all(np.abs(t[..., 2] + half) < 1e-4, axis=1)
    area = 0.5 * np.linalg.norm(np.cross(t[on, 1] - t[on, 0], t[on, 2] - t[on, 0]), axis=1).sum() * 1e4
    emis = any(m.get("emissiveFactor") for m in doc.get("materials", []))
    ok = abs(zmin + half) < 1e-4 and area > 10 and (e["kind"] != "lamp" or emis)
    bad += not ok
    print(f"{'OK ' if ok else 'BAD'} {e['slug']:42s} zmin={zmin:+.4f} -d/2={-half:+.4f} back={area:6.0f} cm2"
          f"{' emissive' if emis else ''}")
print("failures:", bad)
