"""One demo flat from its labelled trace: apartments/<flat>/trace.svg -> scene.json + scene.furnished.json.

    uv run --project harness python apartments/_svg/build.py apartments/<flat>

The trace is the only hand-made file. It is drawn in the plan image's own pixels and labels everything
(harness/varpet_harness/trace.py lists the walls, openings, rooms, fixtures and dimension lines). This script adds:

    <polygon class="furniture" data-kind="sofa" data-front="down" data-name="Sofa" points="4 corners">

data-kind is an editor furniture kind (sofa, chair, table, desk, bed, cabinet, dresser, wardrobe, shelf, lamp, rug,
plant, decor); data-front says which way the piece faces on the image (up, down, left, right; default down);
data-asset pins a catalog id when the automatic pick is wrong.

Writes, next to the trace:
    shell.json            the flat in metres, tidied and checked (harness/varpet_harness/shell.py)
    scene.json            the empty flat as an editor project (the editor's own export, so it opens)
    scene.furnished.json  the same with the furniture: real catalog models closest in size to each footprint
    review/overlay.png    the trace drawn over the plan (red walls, orange doors, blue windows, green rooms)
    review/top.png        the finished flat from above
    report.json           checks, scale, areas, furniture picks
"""

from __future__ import annotations

import json
import math
import subprocess
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw
from shapely.geometry import Point, Polygon

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "harness"))

from varpet_harness.shell import Shell, check_file, to_editor  # noqa: E402
from varpet_harness.trace import _elements, _rect, to_shell  # noqa: E402
from orient import orient  # noqa: E402

CATALOG_URL = "http://100.107.246.46:8765/editor/assets"
CACHE = Path(__file__).resolve().parent / "catalog-cache.json"
FRONT = {"down": 0.0, "up": math.pi, "right": math.pi / 2, "left": -math.pi / 2}


def catalog() -> list[dict]:
    """The 900 editor-ready catalog models (cached: the service is only on the tailnet)."""
    try:
        with urllib.request.urlopen(CATALOG_URL, timeout=10) as r:
            assets = json.loads(r.read())
        CACHE.write_text(json.dumps(assets))
        return assets
    except OSError:
        return json.loads(CACHE.read_text())


def pick(assets: list[dict], kind: str, w: float, d: float, pinned: str | None, taken: dict) -> dict | None:
    """The model whose footprint is closest to the traced one; the same kind and size reuse one model."""
    if pinned:
        return next((a for a in assets if a["id"] == pinned), None)
    key = (kind, round(w, 1), round(d, 1))
    if key in taken:
        return taken[key]
    fits = [a for a in assets if a["kind"] == kind]
    if not fits:
        return None
    best = min(fits, key=lambda a: abs(a["dimensions"][0] - w) + abs(a["dimensions"][2] - d))
    taken[key] = best
    return best


def furniture(svg: str, transform: dict, rooms: list[dict], assets: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    px, (ox, oy) = transform["px_per_m"], transform["origin"]
    m = lambda q: ((q[0] - ox) / px, (q[1] - oy) / px)
    polys = [(r["id"], Polygon(r["polygon"])) for r in rooms]
    objects, used, picks, taken = [], {}, [], {}
    for i, (tag, c, a, p) in enumerate(_elements(svg)):
        if "furniture" not in c or len(p) < 3:
            continue
        kind = (a.get("data-kind") or "").lower()
        centre, (ux, uy), long_, short = _rect(p)
        x, z = m(centre)
        front = a.get("data-front", "down")
        # the footprint's width runs across the front: facing up or down, width is the horizontal extent
        horizontal = abs(ux) >= abs(uy)
        facing_updown = front in ("up", "down")
        w, d = (long_ / px, short / px) if horizontal == facing_updown else (short / px, long_ / px)
        asset = pick(assets, kind, w, d, a.get("data-asset"), taken)
        name = a.get("data-name") or kind
        if asset is None:
            picks.append({"id": a.get("id"), "kind": kind, "footprint_m": [round(w, 2), round(d, 2)], "asset": None})
            continue
        used[asset["id"]] = asset
        room = next((rid for rid, poly in polys if poly.contains(Point(x, z))), None)
        objects.append({"id": a.get("id") or f"piece-{i + 1}", "name": name, "assetId": asset["id"],
                        "position": [round(x, 4), 0, round(z, 4)], "rotation": FRONT.get(front, 0.0), "scale": [1, 1, 1]})
        picks.append({"id": objects[-1]["id"], "kind": kind, "room": room, "footprint_m": [round(w, 2), round(d, 2)],
                      "asset": asset["id"], "asset_m": [round(asset["dimensions"][0], 2), round(asset["dimensions"][2], 2)],
                      "name": asset["name"][:80]})
    return objects, list(used.values()), picks


def export(v1: dict, components: list[dict], assets: list[dict], out: Path, work: Path) -> str | None:
    """The editor's own architect-project path: throws the editor's validation errors."""
    (work / "v1.json").write_text(json.dumps(v1))
    (work / "components.json").write_text(json.dumps(components))
    (work / "assets.json").write_text(json.dumps(assets))
    proc = subprocess.run(["node", "scripts/architect-project.mjs", str(work / "v1.json"), str(work / "components.json"),
                           str(work / "assets.json"), str(out)], cwd=REPO / "apps" / "editor", capture_output=True,
                          text=True, stdin=subprocess.DEVNULL)
    return None if proc.returncode == 0 and out.exists() else (proc.stdout + proc.stderr).strip()[-400:]


def overlay(plan: Path, svg: str, out: Path) -> None:
    img = Image.open(plan).convert("RGBA")
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    colours = {"wall": (215, 40, 40, 140), "room": (40, 160, 90, 45), "fixture": (120, 60, 180, 110),
               "furniture": (230, 150, 20, 110)}
    lines = {"door": (230, 120, 0, 255), "window": (20, 110, 230, 255), "dimension": (0, 160, 160, 255)}
    width = max(2, img.width // 350)
    for tag, c, a, p in _elements(svg):
        k = next((x for x in colours if x in c), None)
        if k and len(p) >= 3:
            d.polygon(p, fill=colours[k], outline=colours[k][:3] + (255,))
        k = next((x for x in lines if x in c), None)
        if k and len(p) == 2:
            d.line(p, fill=lines[k], width=width * 2)
    Image.alpha_composite(img, layer).convert("RGB").save(out)


def top(shell: Shell, objects: list[dict], assets: dict, out: Path, scale: int = 90) -> None:
    pts = [q for r in shell.rooms for q in r.polygon] + [q for w in shell.walls for q in (w.start, w.end)]
    x0, z0 = min(q[0] for q in pts) - 0.5, min(q[1] for q in pts) - 0.5
    x1, z1 = max(q[0] for q in pts) + 0.5, max(q[1] for q in pts) + 0.5
    img = Image.new("RGB", (int((x1 - x0) * scale), int((z1 - z0) * scale)), (250, 250, 247))
    d = ImageDraw.Draw(img)
    P = lambda q: ((q[0] - x0) * scale, (q[1] - z0) * scale)
    for r in shell.rooms:
        d.polygon([P(q) for q in r.polygon], fill=(236, 230, 219), outline=(200, 190, 175))
        c = Polygon(r.polygon).representative_point()
        d.text(P((c.x, c.y)), f"{r.name}\n{Polygon(r.polygon).area:.1f} m2", fill=(60, 60, 60), anchor="mm", align="center")
    from shapely.geometry import LineString

    for w in shell.walls:
        body = LineString([w.start, w.end]).buffer(w.thickness / 2, cap_style="square")
        d.polygon([P(q) for q in body.exterior.coords], fill=(30, 30, 30))
        line = LineString([w.start, w.end])
        for o in w.openings:
            seg = LineString([line.interpolate(o.offset), line.interpolate(o.offset + o.width)]).buffer(w.thickness / 2 + 0.02, cap_style="flat")
            d.polygon([P(q) for q in seg.exterior.coords], fill=(215, 45, 40) if o.kind == "door" else (40, 100, 220))
    for comp in to_editor(shell).get("components", []):
        wdt, _, dep = comp["dimensions"]
        x, _, z = comp["position"]
        r = comp["rotation"]
        box = [(x + math.cos(r) * sx * wdt / 2 + math.sin(r) * sz * dep / 2, z - math.sin(r) * sx * wdt / 2 + math.cos(r) * sz * dep / 2)
               for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        d.polygon([P(q) for q in box], fill=(160, 160, 160), outline=(90, 90, 90))
    for o in objects:
        a = assets[o["assetId"]]
        wdt, _, dep = a["dimensions"]
        x, _, z = o["position"]
        r = o["rotation"]
        box = [(x + math.cos(r) * sx * wdt / 2 + math.sin(r) * sz * dep / 2, z - math.sin(r) * sx * wdt / 2 + math.cos(r) * sz * dep / 2)
               for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        d.polygon([P(q) for q in box], fill=tuple(int(a["color"][i:i + 2], 16) for i in (1, 3, 5)), outline=(40, 40, 40))
        front = (x + math.sin(r) * dep / 2, z + math.cos(r) * dep / 2)
        d.line([P((x, z)), P(front)], fill=(230, 110, 20), width=3)
    img.save(out)


def build(flat: Path) -> dict:
    svg = (flat / "trace.svg").read_text()
    plan = next(p for p in flat.iterdir() if p.stem in ("source", "plan") and p.suffix.lower() in (".png", ".jpg", ".jpeg"))
    (flat / "review").mkdir(exist_ok=True)
    work = flat / "review" / "work"
    work.mkdir(exist_ok=True)
    raw = to_shell(svg)
    transform = raw.pop("transform")
    orient(raw["rooms"], raw["components"])  # the trace knows a fitting's axis, not which side is its front
    (flat / "shell.json").write_text(json.dumps(raw, indent=1))
    faults = check_file(flat / "shell.json", flat / "review")  # tidies in place, like the architect's check
    shell = Shell.model_validate_json((flat / "shell.json").read_text())
    structure = to_editor(shell)
    v1 = {"format": "varpet.editor", "version": 1, "id": flat.name, "name": flat.name, "units": "m", "upAxis": "Y",
          "rooms": structure["rooms"], "walls": structure["walls"], "objects": []}
    components = structure.get("components", [])
    report = {"flat": flat.name, "scale": raw["notes"][0], "faults": faults}
    report["empty_export"] = export(v1, components, [], flat / "scene.json", work) or "ok"
    objects, used, picks = furniture(svg, transform, structure["rooms"], catalog())
    report["furniture"] = picks
    report["furnished_export"] = export({**v1, "objects": objects}, components, used, flat / "scene.furnished.json", work) or "ok"
    printed = shell.printed
    report["rooms"] = [{"room": r.name, "m2": round(Polygon(r.polygon).area, 2),
                        "printed": (printed[r.id].area_m2 or (printed[r.id].dims_m[0] * printed[r.id].dims_m[1] if printed[r.id].dims_m else None))
                        if r.id in printed else None} for r in shell.rooms]
    overlay(plan, svg, flat / "review" / "overlay.png")
    top(shell, objects, {a["id"]: a for a in used}, flat / "review" / "top.png")
    (flat / "report.json").write_text(json.dumps(report, indent=1))
    return report


if __name__ == "__main__":
    r = build(Path(sys.argv[1]).resolve())
    print(json.dumps({k: r[k] for k in ("flat", "scale", "empty_export", "furnished_export")}, indent=1))
    print(f"faults {len(r['faults'])}; furniture {sum(1 for p in r['furniture'] if p['asset'])}/{len(r['furniture'])} picked")
    for room in r["rooms"]:
        print(f"  {room['room'][:28]:28} {room['m2']:6.2f} m2" + (f"  printed {room['printed']:.2f}" if room["printed"] else ""))
