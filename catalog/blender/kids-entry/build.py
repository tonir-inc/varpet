"""Merge the family fragments into entries.json and draw the contact sheet (run after the family scripts
and render_previews.py).

cd catalog && uv run --with pillow python blender/kids-entry/build.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
CATALOG = HERE.parents[1]
OUT = CATALOG / "data" / "extra" / "bpy-kids-entry"
PREVIEWS = CATALOG / "data" / "previews-extra" / "bpy-kids-entry"
SHEET = CATALOG / "data" / "previews-extra" / "bpy-kids-entry-sheet.png"
FAMILIES = ("kids_beds", "kids_room", "entry")


def main():
    entries, stats = [], []
    for fam in FAMILIES:
        f = OUT / "_parts" / f"{fam}.json"
        if not f.exists():
            continue
        for e in json.loads(f.read_text()):
            stats.append((e["slug"], e.pop("tris"), e.pop("bytes")))
            entries.append(e)
    (OUT / "entries.json").write_text(json.dumps(entries, indent=1) + "\n")
    for slug, tris, size in stats:
        print(f"{slug:34s} tris={tris:6d} MB={size / 1e6:.2f}")
    print(f"{len(entries)} entries, {sum(s for *_, s in stats) / 1e6:.1f} MB, "
          f"tris {min(t for _, t, _ in stats)}-{max(t for _, t, _ in stats)}")

    cols, cell, label = 4, 320, 34
    rows = (len(entries) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, e in enumerate(entries):
        x, y = (i % cols) * cell, (i // cols) * (cell + label)
        png = PREVIEWS / f"{e['slug']}.png"
        if png.exists():
            sheet.paste(Image.open(png).convert("RGB").resize((cell, cell)), (x, y))
        w, d, h = e["size_m"]
        draw.text((x + 6, y + cell + 2), e["slug"], fill="black")
        draw.text((x + 6, y + cell + 17), f"{w:.2f} x {d:.2f} x {h:.2f} m  {e['kind']}", fill=(90, 90, 90))
    sheet.save(SHEET)
    print("sheet", SHEET)


main()
