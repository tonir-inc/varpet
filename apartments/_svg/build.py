"""One demo flat from its labelled trace: apartments/<flat>/trace.svg -> scene.json + scene.furnished.json.

    uv run --project harness python apartments/_svg/build.py apartments/<flat>

The trace is the only hand-made file. It is drawn in the plan image's own pixels and labels everything
(harness/varpet_harness/trace.py lists the walls, openings, rooms, fixtures and dimension lines). This script adds:

    <polygon class="furniture" data-kind="sofa" data-front="down" data-name="Sofa" points="4 corners">

data-kind is an editor furniture kind (sofa, chair, table, desk, bed, cabinet, dresser, wardrobe, shelf, lamp, rug,
plant, decor); data-front says which way the piece faces on the image (up, down, left, right; default down);
data-asset pins a catalog id when the automatic pick is wrong; data-fit="width" then stretches that model across the
footprint's width (the placement's scale, the catalog record stays as it is) when no catalog size matches the plan.

Writes, next to the trace:
    shell.json            the flat in metres, tidied and checked (harness/varpet_harness/shell.py)
    scene.json            the empty flat as an editor project (the editor's own export, so it opens)
    scene.furnished.json  the same with the furniture: real catalog models closest in size to each footprint
    startup.json          scene.furnished.json plus the catalog models it uses (the editor's default flat reads this)
    review/overlay.png    the trace drawn over the plan (red walls, orange doors, blue windows, green rooms)
    review/top.png        the finished flat from above
    review/plan.png       the plan cut to the traced drawing (a derivative of the plan: keep it out of git where the plan is)
    report.json           checks, scale, areas, furniture picks
"""

from __future__ import annotations

import json
import math
import re
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
# Pinned models outside the 900 editor-ready ones: the catalog's item records, read through the tailnet service or
# the deployed app's relay, cached so a rebuild needs neither.
ITEMS_URLS = ("http://100.107.246.46:8765/items", "https://varpet.snek.page/api/catalog/items")
PINNED_CACHE = Path(__file__).resolve().parent / "catalog-pinned.json"
ROLES = json.loads((Path(__file__).resolve().parent / "roles.json").read_text())
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


def editor_asset(item: dict) -> dict | None:
    """A catalog item record as the editor's CatalogAsset (mirrors catalogProduct in apps/editor/src/adapters/database-catalog.ts)."""
    url = item.get("glb_url") or ""
    w, d, h = item.get("fit_size_m") or item["size_m"]
    if url.startswith("https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/"):
        model = url
    elif url.startswith("http://100.107.246.46:8765/models/"):
        model = "/api/catalog/models/" + url.rsplit("/", 1)[1]
    else:
        return None
    swapped = item.get("wd_swapped") is True
    if swapped:
        model += "#varpet-rotate-y=90"
    colour = next((c["hex"] for c in item.get("colors_img") or [] if isinstance(c, dict) and str(c.get("hex", "")).startswith("#")), "#b8b4ad")
    return {"id": item["id"], "name": item["name"].strip()[:120], "category": item.get("category") or item["kind"],
            "kind": item["kind"], "dimensions": [d, h, w] if swapped else [w, h, d], "color": colour, "price": item["price"],
            "source": {"type": "gltf", "url": model}}


def pinned_assets(ids: set[str], known: set[str]) -> list[dict]:
    """Pinned models missing from the editor-ready list, from the cache or the catalog's item records."""
    cached = json.loads(PINNED_CACHE.read_text()) if PINNED_CACHE.exists() else {}
    missing = sorted(i for i in ids - known - set(cached))
    for base in ITEMS_URLS if missing else ():
        try:
            request = urllib.request.Request(f"{base}?ids={','.join(missing)}", headers={"User-Agent": "varpet-build/1"})  # the app's edge refuses Python's default agent
            with urllib.request.urlopen(request, timeout=30) as r:
                for item in json.loads(r.read()).get("results", []):
                    asset = editor_asset(item)
                    if asset:
                        cached[asset["id"]] = asset
            PINNED_CACHE.write_text(json.dumps(cached, indent=1, ensure_ascii=False))
            break
        except OSError:
            continue
    return [cached[i] for i in sorted(ids - known) if i in cached]


def role(name: str) -> dict:
    return next((r for r in ROLES["roles"] if re.search(r["name"], name, re.I)), {})


def fits_role(a: dict, rule: dict) -> bool:
    h = a["dimensions"][1]
    lo, hi = rule.get("height", (0, 99))
    return lo <= h <= hi and not (rule.get("not") and re.search(rule["not"], a["name"], re.I)) and a["dimensions"][0] >= rule.get("min_width", 0)


def pick(assets: list[dict], kind: str, name: str, w: float, d: float, pinned: str | None, taken: dict) -> dict | None:
    """The model of the right kind and role whose footprint is closest to the traced one, preferring those within
    the footprint tolerance (roles.json); the same role and size reuse one model."""
    if pinned:
        return next((a for a in assets if a["id"] == pinned), None)
    rule = role(name)
    key = (kind, rule.get("name"), round(w, 1), round(d, 1))
    if key in taken:
        return taken[key]
    fits = [a for a in assets if a["kind"] == kind and fits_role(a, rule)]
    within = [a for a in fits if abs(a["dimensions"][0] - w) <= ROLES["width_tolerance"]
              and -ROLES["depth_under"] <= a["dimensions"][2] - d <= ROLES["depth_over"]]
    if not (within or fits):
        return None
    best = min(within or fits, key=lambda a: abs(a["dimensions"][0] - w) + abs(a["dimensions"][2] - d))
    taken[key] = best
    return best


def fixture_fronts(svg: str, components: list[dict]) -> list[str]:
    """A fixture's data-front (up, down, left, right on the image, as for furniture) sets which way it faces. The
    trace alone only knows the long side, so a toilet drawn cistern-to-wall comes out sideways; the width is then the
    extent across the front. Runs after orient(), which this overrides for the fixtures it names."""
    turned = []
    by_id = {c["id"]: c for c in components}
    for _, c, a, p in _elements(svg):
        front = a.get("data-front")
        comp = by_id.get(a.get("id"))
        if "fixture" not in c or not front or comp is None or front not in FRONT:
            continue
        _, (ux, uy), long_, short = _rect(p)
        long_m, short_m = sorted((comp["dimensions"][0], comp["dimensions"][2]), reverse=True)
        horizontal = abs(ux) >= abs(uy)  # the long side runs across the image
        across = long_m if horizontal == (front in ("up", "down")) else short_m
        comp["dimensions"] = [across, comp["dimensions"][1], short_m if across == long_m else long_m]
        comp["rotation"] = FRONT[front]
        turned.append(comp["id"])
    return turned


def footprint(o: dict, a: dict, at: tuple[float, float] | None = None) -> Polygon:
    w, _, d = a["dimensions"]
    x, z = at or (o["position"][0], o["position"][2])
    r = o["rotation"]
    return Polygon([(x + math.cos(r) * sx * w / 2 + math.sin(r) * sz * d / 2, z - math.sin(r) * sx * w / 2 + math.cos(r) * sz * d / 2)
                    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])


def settle(objects: list[dict], assets: dict, rooms: list[dict], components: list[dict]) -> list[str]:
    """Where a real model is bigger than the plan's symbol: chairs drawn tucked under a table or desk come out until
    they clear it, a bedside table slides off the bed, and every piece moves the least distance that keeps it inside
    its room and off the fixtures. Moves are in place; returns what moved."""
    moved = []
    names = {o["id"]: o for o in objects}
    fixtures = [footprint(c, {"dimensions": c["dimensions"]}) for c in components if not c.get("host")]
    for o in objects:
        if o.get("_on"):
            continue
        rule = role(o["name"])
        pattern = rule["faces"][0] if rule.get("faces") else rf"\b{rule['beside']}$" if rule.get("beside") else None
        target = min((t for t in objects if t is not o and re.search(pattern, t["name"], re.I)), default=None,
                     key=lambda t: math.dist((t["position"][0], t["position"][2]), (o["position"][0], o["position"][2]))) if pattern else None
        if target is None or footprint(o, assets[o["assetId"]]).intersection(footprint(target, assets[target["assetId"]])).area <= 1e-6:
            continue
        x, z = o["position"][0], o["position"][2]
        if rule.get("faces"):  # back away from what it faces
            ux, uz = -math.sin(o["rotation"]), -math.cos(o["rotation"])
        else:  # slide sideways off the bed, along the bed's width
            r = target["rotation"]
            ux, uz = math.cos(r), -math.sin(r)
            if (x - target["position"][0]) * ux + (z - target["position"][2]) * uz < 0:
                ux, uz = -ux, -uz
        other = footprint(target, assets[target["assetId"]])
        step = 0.0
        while step < 0.6 and footprint(o, assets[o["assetId"]], (x + ux * step, z + uz * step)).intersection(other).area > 1e-6:
            step += 0.005
        o["position"][0], o["position"][2] = round(x + ux * (step + 0.01), 4), round(z + uz * (step + 0.01), 4)
        moved.append(f"{o['id']} {step + 0.01:.3f} m off {target['id']}")
    stuck = {}
    for _ in range(3):  # a piece can be boxed in by one that has not moved yet: another round frees it
        for o in objects:
            if o.get("_on"):
                continue
            a = assets[o["assetId"]]
            x, z = o["position"][0], o["position"][2]
            room = next((r for r in rooms if Polygon(r["polygon"]).contains(Point(x, z))), None)
            if room is None:
                continue
            inner = Polygon(room["polygon"]).buffer(-0.005)
            obstacles = fixtures + [footprint(p, assets[p["assetId"]]) for p in objects if p is not o and not p.get("_on")]
            ok = lambda fx, fz: inner.contains(footprint(o, a, (fx, fz))) and not any(
                footprint(o, a, (fx, fz)).intersection(f).area > 1e-6 for f in obstacles)
            if ok(x, z):
                continue
            best = None
            for i in range(-50, 51):
                for j in range(-50, 51):
                    dx, dz = i * 0.005, j * 0.005
                    if (best is None or math.hypot(dx, dz) < math.hypot(*best)) and ok(x + dx, z + dz):
                        best = (dx, dz)
            if best:
                o["position"][0], o["position"][2] = round(x + best[0], 4), round(z + best[1], 4)
                stuck.pop(o["id"], None)
                moved.append(f"{o['id']} {math.hypot(*best):.3f} m into {room['id']}")
            else:
                stuck[o["id"]] = f"{o['id']} does not fit its room within 0.25 m"
    return moved + list(stuck.values())


def rest(objects: list[dict], assets: dict) -> list[str]:
    """A piece traced with data-on (a TV on its unit) stands centred on top of that piece, turned the same way."""
    placed = []
    names = {o["id"]: o for o in objects}
    for o in objects:
        support = names.get(o.pop("_on", None) or "")
        if support is None:
            continue
        o["position"] = [support["position"][0], round(support["position"][1] + assets[support["assetId"]]["dimensions"][1], 4),
                         support["position"][2]]
        o["rotation"], o["restsOn"] = support["rotation"], support["id"]
        placed.append(f"{o['id']} on {support['id']}")
    return placed


def furniture(svg: str, transform: dict, rooms: list[dict], assets: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    px, (ox, oy) = transform["px_per_m"], transform["origin"]
    m = lambda q: ((q[0] - ox) / px, (q[1] - oy) / px)
    polys = [(r["id"], Polygon(r["polygon"])) for r in rooms]
    objects, used, picks, taken = [], {}, [], {}
    pins = {a["data-asset"] for _, c, a, _ in _elements(svg) if "furniture" in c and a.get("data-asset")}
    assets = assets + pinned_assets(pins, {a["id"] for a in assets})
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
        name = a.get("data-name") or kind
        asset = pick(assets, kind, name, w, d, a.get("data-asset"), taken)
        if asset is None:
            picks.append({"id": a.get("id"), "kind": kind, "footprint_m": [round(w, 2), round(d, 2)], "asset": None})
            continue
        used[asset["id"]] = asset
        room = next((rid for rid, poly in polys if poly.contains(Point(x, z))), None)
        sx = round(w / asset["dimensions"][0], 4) if a.get("data-fit") == "width" else 1
        objects.append({"id": a.get("id") or f"piece-{i + 1}", "name": name, "assetId": asset["id"],
                        "position": [round(x, 4), 0, round(z, 4)], "rotation": FRONT.get(front, 0.0), "scale": [sx, 1, 1],
                        **({"_on": a["data-on"]} if a.get("data-on") else {})})
        picks.append({"id": objects[-1]["id"], "kind": kind, "room": room, "footprint_m": [round(w, 3), round(d, 3)],
                      "asset": asset["id"], "asset_m": [round(asset["dimensions"][0], 2), round(asset["dimensions"][2], 2)],
                      **({"stretched_x": sx} if sx != 1 else {}),
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


def plan_crop(plan: Path, svg: str, out: Path, margin: float = 0.06) -> None:
    """The plan cut to the traced walls and rooms (no legend, no title block): what a card or the Design brief shows."""
    pts = [q for _, c, _, p in _elements(svg) if ("wall" in c or "room" in c) and len(p) >= 3 for q in p]
    x0, y0, x1, y1 = min(q[0] for q in pts), min(q[1] for q in pts), max(q[0] for q in pts), max(q[1] for q in pts)
    pad = margin * max(x1 - x0, y1 - y0)
    img = Image.open(plan)
    img.crop((max(0, int(x0 - pad)), max(0, int(y0 - pad)), min(img.width, int(x1 + pad)), min(img.height, int(y1 + pad)))).save(out)


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


def design_options(flat: Path, svg: str, variants: list[Path], v1: dict, components: list[dict], rooms: list[dict],
                   transform: dict, used: list[dict], work: Path, report: dict) -> list[dict]:
    """trace.<option>.svg holds only furniture (walls and fixtures come from trace.svg): another arrangement of the same
    flat, such as the plan's own furniture exactly as drawn. Each goes through the editor's export like the main one, and
    scene.furnished.json gets them all as the editor's design options (Renovate, Design options; the Design brief's
    switch), the main trace's arrangement active. Returns the models every option uses."""
    path = flat / "scene.furnished.json"
    scene = json.loads(path.read_text())
    project = scene["project"]
    snap = lambda objects: {"rooms": scene["rooms"], "walls": scene["walls"], "objects": objects, "metadata": project["metadata"],
                            "components": project["components"], "routes": project["routes"], "finishes": project["finishes"]}
    name = lambda text, default: (re.search(r'data-option-name="([^"]+)"', text[:400]) or [None, default])[1]
    options = [{"id": "main", "name": name(svg, "Furnished"), "snapshot": snap(scene["objects"])}]
    models = {a["id"]: a for a in used}
    report["options"] = {}
    for variant in variants:
        oid, text = variant.name.split(".")[1], variant.read_text()
        objects, extra, picks = furniture(text, transform, rooms, catalog())
        models.update({a["id"]: a for a in extra})
        settled = settle(objects, models, rooms, components) + rest(objects, models)
        out = work / f"option-{oid}.json"
        failed = export({**v1, "objects": objects}, components, list(models.values()), out, work)
        report["options"][oid] = {"export": failed or "ok", "pieces": f"{sum(1 for p in picks if p['asset'])}/{len(picks)}", "settled": settled}
        if not failed:
            options.append({"id": oid, "name": name(text, oid), "snapshot": snap(json.loads(out.read_text())["objects"])})
    # option.<id>.json (option.ts): a designer proposal on the main arrangement, saved whole: furniture, lights,
    # finishes and the catalog records of its new pieces. It was made on the main arrangement as it was then.
    for saved in sorted(flat.glob("option.*.json")):
        oid, data = saved.name.split(".")[1], json.loads(saved.read_text())
        models.update({a["id"]: a for a in data["catalog"]})
        have = {m["id"] for m in project["materials"]}
        project["materials"] += [m for m in data.get("materials", []) if m["id"] not in have]
        options.append({"id": oid, "name": data["name"], "snapshot": {**snap(data["objects"]), "components": data["components"],
                                                                       "finishes": data["finishes"], "routes": data["routes"],
                                                                       **({"metadata": data["metadata"]} if "metadata" in data else {})}})
        report["options"][oid] = {"saved": saved.name, "pieces": len(data["objects"])}
    project["options"], project["activeOptionId"] = options, "main"
    path.write_text(json.dumps(scene, indent=2, ensure_ascii=False))
    return list(models.values())


def build(flat: Path) -> dict:
    svg = (flat / "trace.svg").read_text()
    plan = next(p for p in flat.iterdir() if p.stem in ("source", "plan") and p.suffix.lower() in (".png", ".jpg", ".jpeg"))
    (flat / "review").mkdir(exist_ok=True)
    work = flat / "review" / "work"
    work.mkdir(exist_ok=True)
    raw = to_shell(svg)
    transform = raw.pop("transform")
    orient(raw["rooms"], raw["components"])  # the trace knows a fitting's axis, not which side is its front
    fixture_fronts(svg, raw["components"])  # ...unless the trace says so
    (flat / "shell.json").write_text(json.dumps(raw, indent=1))
    faults = check_file(flat / "shell.json", flat / "review")  # tidies in place, like the architect's check
    shell = Shell.model_validate_json((flat / "shell.json").read_text())
    structure = to_editor(shell)
    title = (flat / "name.txt").read_text().strip() if (flat / "name.txt").exists() else flat.name  # shown in the editor's top bar
    v1 = {"format": "varpet.editor", "version": 1, "id": flat.name, "name": title, "units": "m", "upAxis": "Y",
          "rooms": structure["rooms"], "walls": structure["walls"], "objects": []}
    components = structure.get("components", [])
    report = {"flat": flat.name, "scale": raw["notes"][0], "faults": faults}
    report["empty_export"] = export(v1, components, [], flat / "scene.json", work) or "ok"
    objects, used, picks = furniture(svg, transform, structure["rooms"], catalog())
    report["settled"] = settle(objects, {a["id"]: a for a in used}, structure["rooms"], components) + rest(objects, {a["id"]: a for a in used})
    report["furniture"] = picks
    report["furnished_export"] = export({**v1, "objects": objects}, components, used, flat / "scene.furnished.json", work) or "ok"
    variants = sorted(flat.glob("trace.*.svg"))
    if report["furnished_export"] == "ok" and (variants or any(flat.glob("option.*.json"))):
        used = design_options(flat, svg, variants, v1, components, structure["rooms"], transform, used, work, report)
    if report["furnished_export"] == "ok":  # what the editor needs to open it with no catalog service: the scene and its models
        (flat / "startup.json").write_text(json.dumps({"scene": json.loads((flat / "scene.furnished.json").read_text()),
                                                       "catalog": used}))
    printed = shell.printed
    report["rooms"] = [{"room": r.name, "m2": round(Polygon(r.polygon).area, 2),
                        "printed": (printed[r.id].area_m2 or (printed[r.id].dims_m[0] * printed[r.id].dims_m[1] if printed[r.id].dims_m else None))
                        if r.id in printed else None} for r in shell.rooms]
    overlay(plan, svg, flat / "review" / "overlay.png")
    plan_crop(plan, svg, flat / "review" / "plan.png")
    top(shell, objects, {a["id"]: a for a in used}, flat / "review" / "top.png")
    (flat / "report.json").write_text(json.dumps(report, indent=1))
    return report


if __name__ == "__main__":
    r = build(Path(sys.argv[1]).resolve())
    print(json.dumps({k: r[k] for k in ("flat", "scale", "empty_export", "furnished_export")}, indent=1))
    print(f"faults {len(r['faults'])}; furniture {sum(1 for p in r['furniture'] if p['asset'])}/{len(r['furniture'])} picked")
    for room in r["rooms"]:
        print(f"  {room['room'][:28]:28} {room['m2']:6.2f} m2" + (f"  printed {room['printed']:.2f}" if room["printed"] else ""))
