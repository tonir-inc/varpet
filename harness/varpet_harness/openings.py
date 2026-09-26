"""Which catalog model, if any, fits an opening. Used by shell.py's to_editor to fill an
opening's assetId when the architect left it unset.

catalog/openings/README.md: models hold their shape to about +-15% off the built opening_m size."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Literal

MANIFEST = Path(__file__).resolve().parents[2] / "catalog" / "openings" / "manifest.json"
TOLERANCE = 0.15
ARMORED = "door-entrance-armored"


def _catalog() -> list[dict]:
    return json.loads(MANIFEST.read_text())


def choose_model(kind: Literal["door", "window"], width: float, height: float, *, exterior: bool) -> str | None:
    """The best-fitting extra:openings:<file stem> for an opening of this kind and size, or None
    if nothing built is close enough. door-entrance-armored is only offered on an exterior wall,
    and wins there over any other door that also fits."""
    candidates = []
    for entry in _catalog():
        if entry["kind"] != kind:
            continue
        stem = Path(entry["file"]).stem
        if stem == ARMORED and not exterior:
            continue
        w0, h0 = entry["opening_m"]["width"], entry["opening_m"]["height"]
        if abs(width - w0) > TOLERANCE * w0 or abs(height - h0) > TOLERANCE * h0:
            continue
        error = abs(math.log(width / w0)) + abs(math.log(height / h0))
        candidates.append((stem == ARMORED, error, stem))
    if not candidates:
        return None
    armored = [c for c in candidates if c[0]]
    best = armored[0] if armored else min(candidates, key=lambda c: c[1])
    return f"extra:openings:{best[2]}"
