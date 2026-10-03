"""A labelled SVG trace of a plan, in the image's own pixels, as a shell (shell.py).

The model decides what every element is; code only does the arithmetic it kept getting wrong in metres:
pixels to metres, a wall rectangle to its centreline and thickness, an opening line to an offset along its wall.

    <polygon class="wall main|secondary" points="4 corners">   one straight stretch of wall
    <line class="door|window" .../>                           across the gap
    <polygon class="room" data-name="Kitchen" data-kind="balcony" data-printed="7.2 m2 | 5.0 x 4.7 m" points>
    <polygon class="fixture" data-kind="toilet" data-name="Toilet" points="4 corners">
    <line class="dimension" data-m="5.0" .../>                along a dimension the plan prints: the scale

CLI: python -m varpet_harness.trace <trace.svg> <shell.json>
"""

from __future__ import annotations

import json
import math
import re
import statistics
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon

WALL_HEIGHT = 2.7
WHITE, OAK = "#f2f0eb", "#c8b89a"
FIXTURE_KINDS = {"sink", "toilet", "shower", "bath", "cabinet", "worktop", "appliance", "radiator", "railing"}
SYNONYMS = {"basin": "sink", "washbasin": "sink", "vanity": "sink", "wc": "toilet", "bathtub": "bath", "tub": "bath",
            "fridge": "appliance", "oven": "appliance", "hob": "appliance", "cooker": "appliance", "stove": "appliance",
            "washing_machine": "appliance", "washer": "appliance", "dishwasher": "appliance", "wardrobe": "cabinet",
            "kitchen": "cabinet", "counter": "worktop", "rail": "railing", "balustrade": "railing"}
HEIGHTS = {"sink": 0.85, "toilet": 0.8, "shower": 2.0, "bath": 0.55, "cabinet": 0.9, "worktop": 0.9, "appliance": 0.85,
           "radiator": 0.6, "railing": 1.0}


class TraceError(ValueError):
    pass


def _points(s: str) -> list[tuple[float, float]]:
    n = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?(?:e-?\d+)?", s or "")]
    return list(zip(n[::2], n[1::2]))


def _elements(svg: str) -> list[tuple[str, set[str], dict, list[tuple[float, float]]]]:
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as e:
        raise TraceError(f"trace.svg is not valid XML: {e}") from e
    out = [("svg", {"flat"}, dict(root.attrib), [])]  # the <svg> element carries the flat's printed total
    for el in root.iter():
        tag = el.tag.split("}")[-1]
        classes = set((el.get("class") or "").split())
        if tag == "polygon":
            pts = _points(el.get("points"))
        elif tag == "rect":
            x, y, w, h = (float(el.get(a, 0)) for a in ("x", "y", "width", "height"))
            pts = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
        elif tag == "line":
            pts = [(float(el.get("x1", 0)), float(el.get("y1", 0))), (float(el.get("x2", 0)), float(el.get("y2", 0)))]
        else:
            continue
        out.append((tag, classes, dict(el.attrib), pts))
    return out


def _printed(text: str | None) -> dict | None:
    if not text:
        return None
    t = text.lower().replace(",", ".").replace("×", "x")
    dims = re.search(r"(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m\b", t)
    if dims:
        return {"dims_m": [float(dims.group(1)), float(dims.group(2))]}
    area = re.search(r"(\d+(?:\.\d+)?)\s*(?:m2|m²|sq\.?\s*m|sqm)", t)
    return {"area_m2": float(area.group(1))} if area else None


def _rect(pts: list[tuple[float, float]]) -> tuple[tuple[float, float], tuple[float, float], float, float]:
    """A footprint as (centre, unit direction of its long side, long side, short side)."""
    box = Polygon(pts).minimum_rotated_rectangle
    c = list(box.exterior.coords)[:4]
    e1 = (c[1][0] - c[0][0], c[1][1] - c[0][1])
    e2 = (c[2][0] - c[1][0], c[2][1] - c[1][1])
    l1, l2 = math.hypot(*e1), math.hypot(*e2)
    (u, long_, short) = (e1, l1, l2) if l1 >= l2 else (e2, l2, l1)
    centre = (box.centroid.x, box.centroid.y)
    return centre, (u[0] / long_, u[1] / long_), long_, short


def scale_of(elements) -> tuple[float, str]:
    """Pixels per metre: the dimension lines the model laid over printed dimensions, else the printed room areas."""
    ratios = [LineString(p).length / float(a["data-m"]) for tag, c, a, p in elements
              if "dimension" in c and tag == "line" and a.get("data-m") and float(a["data-m"]) > 0]
    if ratios:
        return statistics.median(ratios), f"{len(ratios)} dimension lines"
    px = m2 = 0.0
    for tag, c, a, p in elements:
        pr = _printed(a.get("data-printed")) if "room" in c else None
        if pr and len(p) >= 3:
            px += Polygon(p).area
            m2 += pr.get("area_m2") or pr["dims_m"][0] * pr["dims_m"][1]
    if m2:
        return math.sqrt(px / m2), "printed room areas"
    total = next((_printed(a.get("data-printed")) for tag, c, a, p in elements if "flat" in c and a.get("data-printed")), None)
    if total and total.get("area_m2"):
        from shapely.ops import unary_union

        shapes = [Polygon(p).buffer(0) for tag, c, a, p in elements if ("room" in c or "wall" in c) and len(p) >= 3]
        if shapes:  # a printed total is gross: rooms and the walls between them
            return math.sqrt(unary_union(shapes).area / total["area_m2"]), "the printed total area"
    raise TraceError("no scale: lay a <line class=\"dimension\" data-m=\"...\"> over printed dimensions, give rooms "
                     "data-printed areas, or put the flat's printed total on the <svg> element as data-printed")


def to_shell(svg: str) -> dict:
    els = _elements(svg)
    px_per_m, how = scale_of(els)
    walls_px = [(a, p) for tag, c, a, p in els if "wall" in c and len(p) >= 3]
    if not walls_px:
        raise TraceError("no walls: draw each straight stretch as <polygon class=\"wall main|secondary\" points=\"4 corners\">")
    lines = []
    for a, p in walls_px:
        centre, (ux, uy), long_, short = _rect(p)
        half = long_ / 2
        lines.append((a, (centre[0] - ux * half, centre[1] - uy * half), (centre[0] + ux * half, centre[1] + uy * half), short))
    ox = min(min(s[0], e[0]) for _, s, e, _ in lines)  # the flat's top-left wall centreline is [0, 0]
    oy = min(min(s[1], e[1]) for _, s, e, _ in lines)
    m = lambda q: (round((q[0] - ox) / px_per_m, 4), round((q[1] - oy) / px_per_m, 4))

    walls, bodies = [], []
    for i, (a, start, end, short) in enumerate(lines):
        wid = a.get("id") or f"wall-{i + 1}"
        walls.append({"id": wid, "start": m(start), "end": m(end), "height": WALL_HEIGHT,
                      "thickness": round(max(short / px_per_m, 0.05), 3), "color": WHITE, "openings": []})
        bodies.append((LineString([start, end]), short))

    for j, (tag, c, a, p) in enumerate(els):
        kind = "door" if "door" in c else "window" if "window" in c else None
        if not kind or len(p) != 2:
            continue
        mid = LineString(p).interpolate(0.5, normalized=True)
        hits = [(line.distance(mid), i) for i, (line, short) in enumerate(bodies) if line.distance(mid) <= short * 1.5 + 3]
        if not hits:  # glazing drawn without the wall band it sits in: that wall exists, give it the usual thickness
            t_px = statistics.median(short for _, short in bodies)
            start, end = p
            walls.append({"id": f"wall-at-{a.get('id') or j + 1}", "start": m(start), "end": m(end), "height": WALL_HEIGHT,
                          "thickness": round(max(t_px / px_per_m, 0.05), 3), "color": WHITE, "openings": []})
            bodies.append((LineString([start, end]), t_px))
            hits = [(0.0, len(bodies) - 1)]
        _, i = min(hits)
        line = bodies[i][0]
        t = sorted(line.project(Point(q)) for q in p)
        if walls[i]["id"].startswith("wall-at-"):  # the made-up wall is the opening: leave a centimetre each end
            t = [t[0] + 0.01 * px_per_m, t[1] - 0.01 * px_per_m]
        width = (t[1] - t[0]) / px_per_m
        if width < 0.2:
            continue
        # data-height / data-sill (metres) override the usual 2.05 m door and 0.9 + 1.4 m window; data-asset pins the model
        walls[i]["openings"].append({"id": a.get("id") or f"{kind}-{j + 1}", "kind": kind,
                                     "offset": round(t[0] / px_per_m, 4), "width": round(width, 4),
                                     "height": float(a.get("data-height") or (2.05 if kind == "door" else 1.4)),
                                     "sill": float(a.get("data-sill") or (0 if kind == "door" else 0.9)),
                                     **({"assetId": a["data-asset"]} if a.get("data-asset") else {})})

    rooms, printed = [], {}
    for i, (tag, c, a, p) in enumerate(els):
        if "room" not in c or len(p) < 3:
            continue
        rid = a.get("id") or f"room-{i + 1}"
        rooms.append({"id": rid, "name": a.get("data-name") or rid, "polygon": [m(q) for q in p],
                      "color": "#e8e4dc" if a.get("data-kind") == "balcony" else OAK})
        if pr := _printed(a.get("data-printed")):
            printed[rid] = pr

    components = []
    polys = [(r["id"], Polygon(r["polygon"])) for r in rooms]
    for i, (tag, c, a, p) in enumerate(els):
        if "fixture" not in c or len(p) < 3:
            continue
        raw = (a.get("data-kind") or "").lower().replace(" ", "_")
        kind = raw if raw in FIXTURE_KINDS else SYNONYMS.get(raw, "cabinet")
        centre, (ux, uy), long_, short = _rect(p)
        x, z = m(centre)
        room = next((rid for rid, poly in polys if poly.contains(Point(x, z))), polys[0][0] if polys else "")
        components.append({"id": a.get("id") or f"fixture-{i + 1}", "name": a.get("data-name") or raw or kind,
                           "kind": kind, "position": [x, 0, z],
                           "dimensions": [round(long_ / px_per_m, 3), HEIGHTS[kind], round(short / px_per_m, 3)],
                           "rotation": round(-math.atan2(uy, ux), 4), "color": "#f4f4f2", "phase": "existing",
                           "roomId": room})

    return {"rooms": rooms, "walls": walls, "components": components, "printed": printed,
            "notes": [f"traced in pixels; scale {px_per_m:.1f} px/m from {how}"],
            "transform": {"px_per_m": px_per_m, "origin": [ox, oy]}}  # not part of the shell: pop it before Shell()


def main() -> None:
    svg, out = Path(sys.argv[1]), Path(sys.argv[2])
    shell = to_shell(svg.read_text())
    shell.pop("transform")
    out.write_text(json.dumps(shell, indent=1))


if __name__ == "__main__":
    main()
