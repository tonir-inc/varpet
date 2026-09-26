"""Pilot: generate catalog decor from text briefs with a Codex builder, a look-fix loop and a fresh reviewer.

Run from harness/ (the openai_codex SDK lives there):
  uv run python ../catalog/tools/pilot_generate.py <briefs.json> <outdir> [--lanes 2] [--effort low]

briefs.json: [{slug, kind, size_m [w,d,h], placement floor|surface|wall, style, description,
               name?, price_amd?}]
Per brief: builder thread writes a part program (part-dsl-draft skill), compile + up to 2 fault-fix
turns, Blender renders (front 3/4 + straight front) go back into the SAME thread for up to 2
look-fix rounds, then a FRESH reviewer thread sees only the brief + final renders and answers
{accept, reasons}. Writes <outdir>/pilot.json, <outdir>/sheet.png and, for accepted models,
<outdir>/entries.json + <slug>.glb in catalog/tools/../ingest_extra.py's format (copy the folder to
catalog/data/extra/generated-pilot/ and run `ingest_extra.py --dry-run`).

Axes: the DSL is Z-up with +y the back; the compiler maps DSL -y (front) to glTF +Z, which Blender
imports as -Y. Cameras shoot from Blender -Y, so the renders show the front and notes say "front faces +Z".
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import numpy as np
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "harness"))
sys.path.insert(0, str(REPO / "catalog"))

from openai_codex import ApprovalMode, AsyncCodex, LocalImageInput, Sandbox, TextInput  # noqa: E402
from varpet_harness.codex_runner import CodexRunner, _fix_prompt, _strip_frontmatter, _tokens  # noqa: E402
from ingest_extra import validate_entry  # noqa: E402  (stdlib-only at import)

BLENDER = os.environ.get("BLENDER", "/Applications/Blender.app/Contents/MacOS/Blender")
COMPILE = ["uv", "run", "--project", str(REPO / "compiler"), "python", "-m", "partdsl.compile"]
FIX_TURNS, LOOK_ROUNDS = 2, 2
FINISH_COLOR = {  # usual colours from the part-dsl-draft finishes table
    "boucle": "#e9d3bc", "linen": "#c8bca8", "velvet": "#5f6470", "wool-felt": "#a2a0a6",
    "white-laminate": "#eeeae9", "leather-brown": "#512e11", "black-metal": "#5c5c5e",
    "brushed-steel": "#b9bbbd", "painted-wood-matte": "#c7a87e", "marble-white": "#e6e3de",
    "travertine": "#dfccac", "ash-light": "#ac957d", "oak": "#a27f58", "rattan": "#9c8159", "walnut": "#aa8a72",
}

WOOD = {"ash-light", "oak", "rattan", "walnut", "painted-wood-matte", "leather-brown"}

RENDER_PY = r'''
import json, sys, bpy
from mathutils import Vector
glb, out = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
try:
    scn.render.engine = "BLENDER_EEVEE"
except TypeError:
    scn.render.engine = "BLENDER_EEVEE_NEXT"
scn.render.resolution_x = scn.render.resolution_y = 512
scn.render.image_settings.file_format = "PNG"
scn.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("w"); scn.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.93, 0.93, 0.93, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.lens = 50
scn.collection.objects.link(cam); scn.camera = cam
for name, energy, rot in (("key", 3.5, (0.8, 0.2, 0.6)), ("fill", 1.2, (1.1, -0.3, -2.2))):
    light = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
    light.data.energy = energy; light.rotation_euler = rot; scn.collection.objects.link(light)
bpy.ops.import_scene.gltf(filepath=glb)
pts = [o.matrix_world @ Vector(c) for o in scn.objects if o.type == "MESH" for c in o.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
centre, size = (lo + hi) / 2, (hi - lo).length
# glTF front (+Z) imports as Blender -Y; both cameras stand on the -Y side
for view, d in (("front34", (0.75, -1.0, 0.55)), ("front", (0.0, -1.0, 0.12))):
    cam.location = centre + Vector(d).normalized() * size * 1.5
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    scn.render.filepath = f"{out}/{view}.png"
    bpy.ops.render.render(write_still=True)
ext = hi - lo  # Blender Z-up: x = width, y = depth, z = height
json.dump({"extents_m": [round(ext.x, 4), round(ext.y, 4), round(ext.z, 4)], "min_z": round(lo.z, 4)},
          open(f"{out}/bounds.json", "w"))
'''

PLACEMENT = {
    "floor": "It stands on the floor.",
    "surface": "It stands on a table, shelf or sideboard; its base sits flat on that surface.",
    "wall": "It hangs on a wall: the back face (+y, y = d/2) is flat against the wall; nothing reaches the floor, "
            "so treat z = 0 as the underside of the piece (the floor check then means its lowest point).",
}

LOOK = ("These are renders of your compiled piece: 1 front three-quarter view, 2 straight front view "
        "(the camera looks at the front, the side at -y). Look at it against the brief: proportions, "
        "silhouette, the details the brief names, colours and materials. If something is wrong, fix "
        "program.json and reply FIXED. If it is right, change nothing and reply LOOKS_RIGHT.")

REVIEW = """You are a strict catalog reviewer. A generated 3D model must read as the product in the brief
to a shopper browsing a furniture catalog. You see only the brief and two renders (front three-quarter,
straight front). Reject it if it reads as a block or a different object, the proportions are clearly off,
a named detail is missing, or parts float or intersect visibly. Accept small stylisation.

Brief: {brief}

Answer with JSON only, nothing else: {{"accept": true|false, "reasons": "<one or two sentences>"}}"""


# --- colour naming, copied from catalog/colors.py (that module imports psycopg/sklearn) ---
def srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], axis=1)


def name_of(lab):
    L, a, b = lab
    C = float(np.hypot(a, b))
    h = float(np.degrees(np.arctan2(b, a)) % 360)
    if C < (5 if L >= 60 else 7) or (L < 20 and C < 10):
        return "black" if L < 22 else "white" if L > 80 else "grey"
    if 30 <= h < 105 and C < 30 and L >= 55:
        return "beige"
    if 20 <= h < 95 and L < 55:
        return "brown"
    if h < 25 or h >= 345:
        return "pink" if L > 70 and C < 45 else "red"
    if h < 60:
        return "orange" if C >= 30 else "brown"
    if h < 105:
        return "yellow"
    if h < 195:
        return "green"
    if h < 290:
        return "blue"
    if h < 320:
        return "purple"
    return "pink"


def palette(program: dict) -> tuple[list[str], list[str]]:
    """Palette colour names and finishes, ordered by how many parts use each material."""
    mats = program.get("materials", {})
    uses: dict[str, int] = {}
    for p in program.get("parts", []):
        if p.get("material") in mats:
            uses[p["material"]] = uses.get(p["material"], 0) + 1
    colors, finishes = [], []
    for name in sorted(uses, key=uses.get, reverse=True):
        m = mats[name]
        hex_ = m.get("color") or FINISH_COLOR.get(m.get("finish") or "")
        if hex_ and re.fullmatch(r"#[0-9a-fA-F]{6}", hex_):
            rgb = np.array([[int(hex_[i:i + 2], 16) for i in (1, 3, 5)]], dtype=float)
            name_ = name_of(srgb_to_lab(rgb)[0])
            # colors.py names mid-tone oak "yellow"; a wood finish reads as brown to a shopper
            colors.append("brown" if name_ == "yellow" and m.get("finish") in WOOD else name_)
        finishes.append(m.get("finish") or m.get("kind") or name)
    return list(dict.fromkeys(colors)) or ["grey"], list(dict.fromkeys(finishes))


# --- steps ---
def size_fault(program_path: Path, brief_size: list[float]) -> str | None:
    try:
        size = json.loads(program_path.read_text()).get("size")
    except ValueError:
        return None  # the compiler reports the format fault
    bad = [i for i, (a, b) in enumerate(zip(size or [], brief_size)) if abs(a - b) > max(0.02, 0.03 * b)]
    if not size or len(size) != 3 or bad:
        return json.dumps([{"check": "brief-size", "your_size": size, "true_size": brief_size,
                            "detail": "program size must be the true size from the brief"}])
    return None


def compile_(workdir: Path, brief: dict) -> str | None:
    faults = CodexRunner._compile(COMPILE, workdir / "program.json", workdir)
    return faults if faults is not None else size_fault(workdir / "program.json", brief["size_m"])


def render(workdir: Path, rnd: int) -> tuple[list[str], dict]:
    out = workdir / f"render{rnd}"
    out.mkdir(exist_ok=True)
    script = workdir / "render.py"
    script.write_text(RENDER_PY)
    proc = subprocess.run([BLENDER, "-b", "--factory-startup", "--python", str(script), "--",
                           str(workdir / "piece.glb"), str(out)], capture_output=True, text=True)
    bounds = out / "bounds.json"
    if not bounds.exists():
        raise RuntimeError(f"render failed: {proc.stdout[-800:]} {proc.stderr[-800:]}")
    return [str(out / "front34.png"), str(out / "front.png")], json.loads(bounds.read_text())


def usage_dict(result) -> dict:
    u = result.usage.total if result and result.usage else None
    return {k: getattr(u, k) for k in ("input_tokens", "cached_input_tokens", "output_tokens",
                                       "reasoning_output_tokens", "total_tokens")} if u else {}


def brief_text(b: dict) -> str:
    w, d, h = b["size_m"]
    return (f"{b.get('name') or b['slug']} ({b['kind']}, {b.get('style', '')} style). {b['description']} "
            f"Size w {w} x d {d} x h {h} m. Placement: {b['placement']}.")


async def build(codex: AsyncCodex, runner: CodexRunner, b: dict, root: Path, effort: str) -> dict:
    slug, t0 = b["slug"], time.monotonic()
    work = root / slug
    work.mkdir(parents=True, exist_ok=True)
    job = SimpleNamespace(id=slug, effort=effort)
    rec = {"slug": slug, "brief": b, "builder_tokens": 0, "reviewer_tokens": 0, "turns": 0, "fix_turns": 0,
           "look_rounds": [], "accept": False, "reasons": "", "renders": [], "error": None}
    skill = _strip_frontmatter((REPO / ".agents/skills/part-dsl-draft/SKILL.md").read_text())
    w, d, h = b["size_m"]
    first = "\n".join([
        f"Build one decor piece: {b.get('name') or slug}, a {b['kind']} in {b.get('style', 'modern')} style.",
        b["description"], PLACEMENT[b["placement"]],
        f"True size in metres: w {w}, d {d}, h {h}. Use exactly \"size\": [{w}, {d}, {h}].",
        "There are no photos: do not use `sample`; give each material a `color`.",
        "Round things (vases, bowls, books' spines) are built from cylinders and rounded boxes; stack or ring "
        "parts to get the silhouette. Every part must touch the chain to the floor.",
        "Write your result to program.json in this folder. Nothing else.", "", "# Skill: part-dsl-draft", skill])
    thread = await codex.thread_start(approval_mode=ApprovalMode.deny_all, sandbox=Sandbox.workspace_write,
                                      cwd=str(work), model=runner.model, config=runner.config)
    await thread.set_name(f"pilot {slug}")
    last = None

    async def turn(items):
        nonlocal last
        last = await runner._turn(thread, items, job)
        rec["builder_tokens"] += _tokens(last)
        rec["turns"] += 1
        return last

    async def compile_and_fix() -> str | None:
        faults = await asyncio.to_thread(compile_, work, b)
        while faults is not None and rec["fix_turns"] < FIX_TURNS:
            rec["fix_turns"] += 1
            print(f"{slug}: fix turn {rec['fix_turns']}", flush=True)
            await turn([TextInput(_fix_prompt(faults, work / "program.json"))])
            faults = await asyncio.to_thread(compile_, work, b)
        return faults

    try:
        print(f"{slug}: building", flush=True)
        await turn([TextInput(first)])
        if not (work / "program.json").exists():
            raise RuntimeError("no program.json")
        faults = await compile_and_fix()
        if faults is not None:
            raise RuntimeError(f"faults left: {faults[:500]}")
        good = work / "good"  # last program that compiled clean
        good.mkdir(exist_ok=True)
        shutil.copy2(work / "program.json", good / "program.json")
        shutil.copy2(work / "piece.glb", good / "piece.glb")
        renders, bounds = await asyncio.to_thread(render, work, 0)
        for rnd in range(1, LOOK_ROUNDS + 1):
            before = (work / "program.json").read_text()
            res = await turn([TextInput(LOOK), *(LocalImageInput(path=p) for p in renders)])
            reply = (res.final_response or "").strip()
            changed = (work / "program.json").read_text() != before
            entry = {"round": rnd, "reply": reply[-600:], "changed_program": changed}
            rec["look_rounds"].append(entry)
            print(f"{slug}: look round {rnd}: {'changed' if changed else 'no change'}", flush=True)
            if not changed:
                break
            faults = await compile_and_fix()
            if faults is not None:  # keep the last clean version rather than lose the model
                entry["reverted"] = faults[:300]
                shutil.copy2(good / "program.json", work / "program.json")
                shutil.copy2(good / "piece.glb", work / "piece.glb")
                break
            shutil.copy2(work / "program.json", good / "program.json")
            shutil.copy2(work / "piece.glb", good / "piece.glb")
            renders, bounds = await asyncio.to_thread(render, work, rnd)
        # usage.last (what the harness sums) undercounts a turn with several model calls; the thread
        # total is the true spend (26 Sept pilot: 35k summed vs 69k thread total)
        rec["builder_usage_total"] = usage_dict(last)
        rec["builder_tokens_last_sum"] = rec["builder_tokens"]
        rec["builder_tokens"] = rec["builder_usage_total"].get("total_tokens", rec["builder_tokens"])
        rec["renders"], rec["mesh_extents_m"] = renders, bounds["extents_m"]
        rec["parts"] = json.loads((work / "report.json").read_text()).get("parts")

        # Gate: a fresh reviewer thread with no builder context.
        rt = await codex.thread_start(approval_mode=ApprovalMode.deny_all, sandbox=Sandbox.read_only,
                                      cwd=str(work), model=runner.model, config=runner.config)
        await rt.set_name(f"pilot review {slug}")
        try:
            rv = await runner._turn(rt, [TextInput(REVIEW.format(brief=brief_text(b))),
                                         *(LocalImageInput(path=p) for p in renders)], job)
            rec["reviewer_usage_total"] = usage_dict(rv)
            rec["reviewer_tokens"] = rec["reviewer_usage_total"].get("total_tokens", _tokens(rv))
            text = rv.final_response or ""
            m = re.search(r"\{.*\}", text, re.S)
            try:
                verdict = json.loads(m.group(0)) if m else {}
                rec["accept"], rec["reasons"] = verdict.get("accept") is True, str(verdict.get("reasons", ""))
            except ValueError:
                rec["reasons"] = f"unparseable: {text[:300]}"
        finally:
            await codex.thread_archive(rt.id)
        print(f"{slug}: {'ACCEPT' if rec['accept'] else 'REJECT'} - {rec['reasons']}", flush=True)
    except Exception as e:  # one bad brief must not stop the pilot
        rec["error"] = f"{type(e).__name__}: {e}"
        print(f"{slug}: ERROR {rec['error']}", flush=True)
    finally:
        await codex.thread_archive(thread.id)
        rec["seconds"] = round(time.monotonic() - t0, 1)
    return rec


def entry_for(rec: dict, root: Path) -> dict:
    b, work = rec["brief"], root / rec["slug"]
    program = json.loads((work / "program.json").read_text())
    colors, finishes = palette(program)
    ext = [round(x, 3) for x in rec["mesh_extents_m"]]
    shutil.copy2(work / "piece.glb", root / f"{rec['slug']}.glb")
    vol = math.prod(b["size_m"])
    price = b.get("price_amd") or int(min(60, max(4, round(4 + 150 * vol))) * 1000)
    return {"slug": rec["slug"], "name": b.get("name") or rec["slug"].replace("-", " ").capitalize(),
            "kind": b["kind"], "placement": b["placement"], "glb": f"{rec['slug']}.glb",
            "size_m": ext, "mesh_extents_m": ext, "colors": colors, "price_amd": int(price),
            "materials": finishes, "style": b.get("style"), "license": "generated (varpet)",
            "source_url": "generated:pilot",
            "notes": "front faces +Z" + ("; Wall-hung" if b["placement"] == "wall" else ""),
            "tags": sorted({b["placement"], "generated"})}


def contact_sheet(records: list[dict], path: Path) -> None:
    tile, pad, label = 256, 8, 28
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
    except OSError:
        font = ImageFont.load_default()
    sheet = Image.new("RGB", (pad + len(records) * (2 * tile + pad), tile + label + 2 * pad), "white")
    draw = ImageDraw.Draw(sheet)
    for i, r in enumerate(records):
        x = pad + i * (2 * tile + pad)
        for j, p in enumerate(r["renders"][:2]):
            sheet.paste(Image.open(p).convert("RGB").resize((tile, tile)), (x + j * tile, pad + label))
        verdict = "ERROR" if r["error"] else "ACCEPT" if r["accept"] else "REJECT"
        draw.text((x, pad), f"{r['slug']}  {verdict}", fill=(0, 120, 0) if r["accept"] else (190, 0, 0), font=font)
    sheet.save(path)


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("briefs", type=Path)
    ap.add_argument("outdir", type=Path)
    ap.add_argument("--lanes", type=int, default=2)
    ap.add_argument("--effort", default="low")
    ap.add_argument("--model", default="gpt-6-astra")
    args = ap.parse_args()
    briefs = json.loads(args.briefs.read_text())
    root = args.outdir.resolve()
    root.mkdir(parents=True, exist_ok=True)
    codex = AsyncCodex()
    runner = CodexRunner(codex, REPO, model=args.model, progress=print)
    gate = asyncio.Semaphore(args.lanes)
    records: list[dict] = []
    t0 = time.monotonic()

    def save():
        (root / "pilot.json").write_text(json.dumps({"wall_seconds": round(time.monotonic() - t0, 1),
                                                     "models": records}, indent=1))

    async def one(b):
        async with gate:
            rec = await build(codex, runner, b, root, args.effort)
        records.append(rec)
        save()

    try:
        await asyncio.gather(*(one(b) for b in briefs))
    finally:
        await codex.close()
    entries = []
    for r in records:
        if r["accept"] and not r["error"]:
            e = entry_for(r, root)
            problems = validate_entry(e, glb_exists=(root / e["glb"]).is_file())
            r["entry_problems"] = problems
            if not problems:
                entries.append(e)
    (root / "entries.json").write_text(json.dumps(entries, indent=1))
    save()
    shown = [r for r in records if r["renders"]]
    if shown:
        contact_sheet(shown, root / "sheet.png")
    for r in records:
        print(f"{r['slug']}: accept={r['accept']} builder={r['builder_tokens']} reviewer={r['reviewer_tokens']} "
              f"turns={r['turns']} {r['seconds']}s {r['error'] or r['reasons']}")
    print(f"pilot.json, sheet.png, entries.json ({len(entries)} entries) in {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
