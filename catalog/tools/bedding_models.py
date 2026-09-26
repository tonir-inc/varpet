"""Made-up mattresses (fitted sheet, duvet, pillows) as procedural extra models, so bed frames stop rendering as slats.

Run from catalog/:  uv run python tools/bedding_models.py
Writes data/extra/bedding/<slug>.glb + entries.json (the format of ingest_extra.validate_entry); import with
import_extra_groups.sh bedding. Kind 'mattress' maps to editor 'decor', so it rests on the bed (on/restsOn).

GLB: glTF Y-up, metres, centred on x/z, base at y=0. Foot end faces +Z (the bed's front), pillows at z=-d/2.
The whole set stays inside the nominal mattress footprint, so it fits any frame made for that size.
"""
import json
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "extra" / "bedding"

# name, width x length (m), mattress height, pillows across, price AMD (mattress + bedding set, Yerevan retail)
SIZES = [
    ("single", 0.90, 2.00, 0.20, 1, 118_000),
    ("double", 1.40, 2.00, 0.22, 2, 172_000),
    ("queen", 1.60, 2.00, 0.24, 2, 205_000),
    ("king", 1.80, 2.00, 0.24, 2, 246_000),
]
# colour name (ingest palette), style, sheet, duvet, turn-down band, pillow (sRGB 0..1; linearised when written)
COLOURS = [
    ("white", "scandinavian", (0.93, 0.93, 0.91), (0.95, 0.95, 0.93), (0.88, 0.88, 0.86), (0.97, 0.97, 0.95)),
    ("grey", "modern", (0.80, 0.80, 0.79), (0.55, 0.56, 0.57), (0.86, 0.86, 0.85), (0.90, 0.90, 0.89)),
    ("beige", "japandi", (0.91, 0.88, 0.82), (0.78, 0.73, 0.65), (0.92, 0.89, 0.83), (0.94, 0.92, 0.87)),
]


def rounded_box(size, radius, centre, n=10, wrinkle=0.0, seed=0):
    """Rounded box as a cube-sphere grid pushed onto the box's rounded surface; smooth normals.

    size (w, h, d) full extents; wrinkle adds a soft height ripple on the top face (fabric)."""
    half = np.array(size, float) / 2
    r = np.minimum(radius, half * 0.999)
    inner = half - r
    rng = np.random.default_rng(seed)
    phase = rng.uniform(0, 2 * np.pi, 4)
    pos, nrm, idx = [], [], []
    t = np.linspace(-1, 1, n + 1)
    for axis in range(3):
        for sign in (-1, 1):
            u_axis, v_axis = [a for a in range(3) if a != axis]
            base = len(pos)
            for i in t:
                for j in t:
                    p = np.zeros(3)
                    p[axis], p[u_axis], p[v_axis] = sign, i, j
                    p = p * half
                    q = np.clip(p, -inner, inner)
                    direction = p - q
                    length = np.linalg.norm(direction)
                    normal = direction / length if length > 1e-9 else np.eye(3)[axis] * sign
                    point = q + normal * r
                    if wrinkle and normal[1] > 0.5:
                        x, z = point[0], point[2]
                        point[1] += wrinkle * (np.sin(9 * x + phase[0]) * np.sin(7 * z + phase[1])
                                               + 0.5 * np.sin(17 * x + 5 * z + phase[2])) * normal[1]
                    pos.append(point + centre)
                    nrm.append(normal)
            for a in range(n):
                for b in range(n):
                    k = base + a * (n + 1) + b
                    quad = (k, k + 1, k + n + 2, k + n + 1)
                    tri = [(quad[0], quad[1], quad[2]), (quad[0], quad[2], quad[3])]
                    # Winding follows the outward normal (axis, sign) so faces point out.
                    flip = (sign > 0) == ((u_axis, v_axis) in ((1, 2), (2, 0), (0, 1)))
                    for tr in tri:
                        idx.append(tr[::-1] if flip else tr)
    return np.array(pos, np.float32), np.array(nrm, np.float32), np.array(idx, np.uint32)


def build(w, length, mh, pillows_across, sheet, duvet, band, pillow, seed):
    """Parts (mesh, rgb, roughness) of a made-up bed set; y=0 at the mattress base, head end at z=-length/2."""
    parts = []
    # Mattress in its fitted sheet, 1 cm inside the set's footprint so the duvet can hang over its sides.
    parts.append((rounded_box((w - 0.02, mh, length - 0.02), 0.035, (0, mh / 2, 0), n=12), sheet, 0.9))
    # Duvet: from the foot to 0.42 m short of the head end, hanging 0.15 m down the sides and the foot.
    head_gap, dt, drape = 0.42, 0.07, 0.15
    dl = length - head_gap
    dz = length / 2 - dl / 2
    parts.append((rounded_box((w, dt + drape, dl), 0.045, (0, mh + dt - (dt + drape) / 2 - 0.012, dz), n=16,
                              wrinkle=0.006, seed=seed), duvet, 0.95))
    # Turn-down band: the sheet folded back over the duvet's head edge.
    parts.append((rounded_box((w - 0.01, dt * 0.55, 0.26), 0.025,
                              (0, mh + dt + dt * 0.2 - 0.012, -length / 2 + head_gap + 0.13), n=8), band, 0.9))
    # Pillows at the head end.
    pw = min(0.62, (w - 0.08) / pillows_across)
    ph, pd = 0.13, 0.36
    for k in range(pillows_across):
        x = (k - (pillows_across - 1) / 2) * (w / pillows_across)
        parts.append((rounded_box((pw - 0.02, ph, pd), 0.06, (x, mh + ph / 2 - 0.015, -length / 2 + pd / 2 + 0.03), n=10,
                                  wrinkle=0.004, seed=seed + k + 1), pillow, 0.85))
    return parts


def write_glb(parts, name):
    bin_, views, accessors, prims, materials = bytearray(), [], [], [], []

    def add(arr, typ, comp, target, minmax=False):
        while len(bin_) % 4:
            bin_.append(0)
        views.append({"buffer": 0, "byteOffset": len(bin_), "byteLength": arr.nbytes, "target": target})
        bin_.extend(arr.tobytes())
        acc = {"bufferView": len(views) - 1, "componentType": comp, "count": len(arr), "type": typ}
        if minmax:
            acc["min"], acc["max"] = arr.min(0).tolist(), arr.max(0).tolist()
        accessors.append(acc)
        return len(accessors) - 1

    for (pos, nrm, idx), rgb, rough in parts:
        linear = [round(c ** 2.2, 4) for c in rgb]  # glTF base colour factors are linear
        materials.append({"name": f"fabric{len(materials)}", "pbrMetallicRoughness": {
            "baseColorFactor": [*linear, 1.0], "metallicFactor": 0.0, "roughnessFactor": rough}})
        prims.append({"attributes": {"POSITION": add(pos, "VEC3", 5126, 34962, True),
                                     "NORMAL": add(nrm, "VEC3", 5126, 34962)},
                      "indices": add(idx.reshape(-1), "SCALAR", 5125, 34963), "material": len(materials) - 1})
    gltf = {"asset": {"version": "2.0", "generator": "varpet bedding_models.py"},
            "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": name}],
            "meshes": [{"primitives": prims}], "materials": materials, "accessors": accessors,
            "bufferViews": views, "buffers": [{"byteLength": len(bin_)}]}
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    while len(bin_) % 4:
        bin_.append(0)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(bin_), 0x004E4942) + bytes(bin_))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for s, (label, w, length, mh, across, price) in enumerate(SIZES):
        for c, (colour, style, sheet, duvet, band, pillow) in enumerate(COLOURS):
            slug = f"mattress-{label}-{round(w * 100)}x{round(length * 100)}-{colour}"
            parts = build(w, length, mh, across, sheet, duvet, band, pillow, seed=10 * s + c)
            allpos = np.concatenate([p[0][0] for p in parts])
            x, y, z = (round(float(v), 3) for v in allpos.max(0) - allpos.min(0))
            ext = [x, z, y]  # catalog order: width, depth, height
            (OUT / f"{slug}.glb").write_bytes(write_glb(parts, slug))
            cm = f"{round(w * 100)}x{round(length * 100)}"
            entries.append({
                "slug": slug, "kind": "mattress",
                "name": f"{label.capitalize()} mattress {cm} cm made up with fitted sheet, duvet and pillows, {colour}",
                "source_url": "https://github.com/tonir-inc/varpet/blob/main/catalog/tools/bedding_models.py",
                "license": "CC0 (procedural, varpet)",
                "glb": f"{slug}.glb", "size_m": ext, "mesh_extents_m": ext, "colors": [colour],
                "price_amd": price + (0 if colour == "white" else 4_000),
                "materials": ["foam", "cotton", "fabric"], "style": style,
                "notes": f"Rests on a {cm} bed frame (on: bed id, same rot as the bed); foot end faces +Z, pillows at z=-d/2",
            })
    (OUT / "entries.json").write_text(json.dumps(entries, indent=1))
    print(f"wrote {len(entries)} entries to {OUT}")


if __name__ == "__main__":
    main()
