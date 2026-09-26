"""Contact sheet for the teen lane (4 columns, slug + size + kind). cd catalog && uv run --with pillow python blender/teen/sheet.py"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

CATALOG = Path(__file__).resolve().parents[2]
OUT = CATALOG / "data" / "extra" / "bpy-teen"
PREVIEWS = CATALOG / "data" / "previews-extra" / "bpy-teen"
SHEET = CATALOG / "data" / "previews-extra" / "bpy-teen-sheet.png"

entries = json.loads((OUT / "entries.json").read_text())
cols, cell, label = 4, 320, 34
rows = (len(entries) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), "white")
draw = ImageDraw.Draw(sheet)
total = 0
for i, e in enumerate(entries):
    x, y = (i % cols) * cell, (i // cols) * (cell + label)
    png = PREVIEWS / f"{e['slug']}.png"
    if png.exists():
        sheet.paste(Image.open(png).convert("RGB").resize((cell, cell)), (x, y))
    w, d, h = e["size_m"]
    draw.text((x + 6, y + cell + 2), e["slug"], fill="black")
    draw.text((x + 6, y + cell + 17), f"{w:.2f} x {d:.2f} x {h:.2f} m  {e['kind']}", fill=(90, 90, 90))
    total += (OUT / e["glb"]).stat().st_size
sheet.save(SHEET)
print(f"{len(entries)} entries, {total / 1e6:.1f} MB -> {SHEET}")
