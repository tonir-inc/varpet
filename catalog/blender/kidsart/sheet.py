"""Contact sheets for the kids' wall-art lane.

uv run python blender/kidsart/sheet.py          -> studio previews sheet (data/previews-extra/bpy-kidsart-sheet.png)
uv run python blender/kidsart/sheet.py tex [out] -> raw artwork textures sheet (fast look before building)
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
CAT = HERE.parents[1]
ENTRIES = CAT / "data/extra/bpy-kidsart/entries.json"
PREV = CAT / "data/previews-extra/bpy-kidsart"
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 13)
except OSError:
    font = ImageFont.load_default()


def grid(cells, out, cell=320, cols=4, label=34):
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (png, l1, l2) in enumerate(cells):
        x, y = (i % cols) * cell, (i // cols) * (cell + label)
        if png.exists():
            im = Image.open(png).convert("RGB")
            im.thumbnail((cell, cell))
            sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        draw.text((x + 6, y + cell + 2), l1[:44], fill="black", font=font)
        draw.text((x + 6, y + cell + 17), l2, fill="#555", font=font)
    sheet.save(out)
    print(out, len(cells))


if len(sys.argv) > 1 and sys.argv[1] == "tex":
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "tex-sheet.png"
    pngs = sorted((HERE / "tex").glob("*.png"))
    grid([(p, p.stem, "") for p in pngs], out, cell=300, cols=6)
else:
    entries = json.loads(ENTRIES.read_text())
    cells = []
    for e in entries:
        w, d, h = (round(v * 100) for v in e["size_m"])
        cells.append((PREV / f"{e['slug']}.png", e["slug"], f"{w} x {d} x {h} cm  ({e['kind']})"))
    grid(cells, CAT / "data/previews-extra/bpy-kidsart-sheet.png")
