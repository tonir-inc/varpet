"""Contact sheet of the sofabeds lane previews: 4 columns, slug + size label under each cell.

uv run python blender/sofabeds/sheet.py [out.png] [cell_px] [slug ...]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CAT = Path(__file__).resolve().parents[2]
ENTRIES = CAT / "data/extra/bpy-sofabeds/entries.json"
PREV = CAT / "data/previews-extra/bpy-sofabeds"
out = Path(sys.argv[1]) if len(sys.argv) > 1 else CAT / "data/previews-extra/bpy-sofabeds-sheet.png"
cell = int(sys.argv[2]) if len(sys.argv) > 2 else 320
only = set(sys.argv[3:])
entries = [e for e in json.loads(ENTRIES.read_text()) if not only or e["slug"] in only]
cols, label = 4, 34
rows = (len(entries) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), "white")
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 13)
except OSError:
    font = ImageFont.load_default()
for i, e in enumerate(entries):
    x, y = (i % cols) * cell, (i // cols) * (cell + label)
    png = PREV / f"{e['slug']}.png"
    if png.exists():
        sheet.paste(Image.open(png).convert("RGB").resize((cell, cell)), (x, y))
    w, d, h = (round(v * 100) for v in e["size_m"])
    draw.text((x + 6, y + cell + 2), e["slug"], fill="black", font=font)
    draw.text((x + 6, y + cell + 17), f"{w} x {d} x {h} cm  ({e['kind']})", fill="#555", font=font)
sheet.save(out)
print(out, len(entries))
