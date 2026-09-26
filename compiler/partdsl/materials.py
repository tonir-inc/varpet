"""Material library (catalog/materials, format in its README) and glTF materials.

Basecolor maps are tint-ready neutral grey; the builder's hex tint is baked
in here so the colour is exact, and the finish id and tint go into glTF
extras so the editor can retint without a rebuild.
"""

from __future__ import annotations

import io
import json
import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import numpy as np
from PIL import Image
from trimesh.visual.material import PBRMaterial

LIBRARY = Path(os.environ.get("VARPET_MATERIALS", Path(__file__).resolve().parents[2] / "catalog" / "materials"))
TEX_SIZE = 512  # per map inside a GLB; the library keeps 1024


@dataclass(frozen=True)
class Finish:
    id: str
    family: str
    tile_m: float
    grain: bool
    default_color: str
    metal: float
    path: Path
    clearcoat: float = 0.0  # KHR_materials_clearcoat: lacquer, gloss laminate, polished stone
    clearcoat_roughness: float = 0.3


@cache
def library() -> dict[str, Finish]:
    out = {}
    for meta in sorted(LIBRARY.glob("*/material.json")):
        m = json.loads(meta.read_text())
        out[m["id"]] = Finish(m["id"], m["family"], float(m["tile_m"]), bool(m.get("grain")),
                              m["default_color"], float(m.get("metal", 0)), meta.parent,
                              float(m.get("clearcoat", 0)), float(m.get("clearcoat_roughness", 0.3)))
    return out


def rgb(hex_color: str) -> np.ndarray:
    return np.array([int(hex_color[i : i + 2], 16) for i in (1, 3, 5)], dtype=float) / 255


def _jpeg(arr: np.ndarray) -> Image.Image:
    buf = io.BytesIO()
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(buf, format="JPEG", quality=88)
    buf.seek(0)
    return Image.open(buf)  # format == "JPEG", so trimesh embeds it without re-encoding


@cache
def _maps(finish_id: str) -> tuple[np.ndarray, Image.Image, np.ndarray]:
    f = library()[finish_id]
    load = lambda name, mode: np.asarray(
        Image.open(f.path / name).convert(mode).resize((TEX_SIZE, TEX_SIZE), Image.LANCZOS), dtype=float
    )
    base = load("basecolor.jpg", "RGB")
    normal = _jpeg(load("normal.jpg", "RGB"))
    rough = load("roughness.jpg", "L")
    return base, normal, rough


@cache
def pbr(finish_id: str | None, tint: str | None, kind: str, roughness: float | None) -> PBRMaterial:
    """One shared material per (finish, tint, kind), so a GLB stores each texture once."""
    if kind in ("mirror", "glass") or finish_id is None:
        srgb = rgb(tint or "#b0b0b0")
        colour = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)  # factors are linear
        alpha = 0.3 if kind == "glass" else 1.0
        metal = 1.0 if kind in ("metal", "mirror") else 0.0
        rough = 0.02 if kind in ("mirror", "glass") else (roughness if roughness is not None else 0.6)
        return PBRMaterial(baseColorFactor=[*colour, alpha], metallicFactor=metal, roughnessFactor=rough,
                           alphaMode="BLEND" if alpha < 1 else "OPAQUE", doubleSided=False)
    f = library()[finish_id]
    base, normal, rough = _maps(finish_id)
    colour = rgb(tint or f.default_color)
    tinted = base / max(base.mean(), 1.0) * colour * 255  # exact mean colour, detail kept
    mr = np.zeros((*rough.shape, 3))
    mr[..., 1] = rough if roughness is None else rough / max(rough.mean(), 1.0) * roughness * 255
    mr[..., 2] = f.metal * 255
    return PBRMaterial(name=f"finish:{finish_id}", baseColorTexture=_jpeg(tinted), normalTexture=normal,
                       metallicRoughnessTexture=_jpeg(mr), metallicFactor=1.0, roughnessFactor=1.0)


def box_uv(vertices: np.ndarray, normals: np.ndarray, tile_m: float, grain: int | None) -> np.ndarray:
    """Box projection in metres: each face uses the plane its normal points away from.

    With a grain axis, U runs along it wherever the face contains that axis.
    """
    dominant = np.argmax(np.abs(normals), axis=1)
    uv = np.zeros((len(vertices), 2))
    for axis in range(3):
        sel = dominant == axis
        a, b = [k for k in range(3) if k != axis]
        if grain is not None and grain == b:
            a, b = b, a
        uv[sel] = vertices[sel][:, [a, b]]
    return uv / tile_m
