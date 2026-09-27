"""Turn traced fittings to face their room.

The trace gives a fitting's rectangle, so its rotation is only known up to a half turn: a kitchen run or a basin drawn
against a wall can come out showing its doors or bowl to that wall. The editor draws a fitting's front (doors, handles,
bowl) on local +z, which a rotation r turns to (sin r, cos r) in plan (x, z). A fitting whose front face looks into a
wall (5 cm past it is in no room) while its back looks into a room is turned half a turn. Freestanding pieces (an
island) and wall-hosted ones are left alone.

    uv run --project harness python apartments/_svg/orient.py apartments/<flat>   (fixes shell.json and both scenes)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from shapely.geometry import Point, Polygon

FRONTED = {"cabinet", "appliance", "sink", "toilet", "worktop", "ac"}


def orient(rooms: list[dict], components: list[dict]) -> list[str]:
    """Flip, in place, every fitting that faces a wall; returns their ids."""
    polygons = [Polygon(room["polygon"]) for room in rooms if len(room.get("polygon") or []) >= 3]

    def in_room(x: float, z: float) -> bool:
        return any(polygon.contains(Point(x, z)) for polygon in polygons)

    flipped = []
    for component in components:
        if component.get("kind") not in FRONTED or component.get("host"):
            continue
        rotation = component.get("rotation") or 0.0
        x, _, z = component["position"]
        fx, fz = math.sin(rotation), math.cos(rotation)
        reach = component["dimensions"][2] / 2 + 0.05
        if not in_room(x + fx * reach, z + fz * reach) and in_room(x - fx * reach, z - fz * reach):
            turned = rotation + math.pi
            component["rotation"] = round(math.atan2(math.sin(turned), math.cos(turned)), 4)
            flipped.append(component["id"])
    return flipped


def fix_files(flat: Path) -> dict[str, list[str]]:
    done = {}
    for name in ("shell.json", "scene.json", "scene.furnished.json"):
        path = flat / name
        if not path.is_file():
            continue
        doc = json.loads(path.read_text())
        components = doc.get("components") if name == "shell.json" else (doc.get("project") or {}).get("components")
        if not components:
            continue
        flipped = orient(doc["rooms"], components)
        if flipped:
            path.write_text(json.dumps(doc, indent=1 if name == "shell.json" else 2, ensure_ascii=False))
        done[name] = flipped
    return done


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        print(arg, json.dumps(fix_files(Path(arg))))
