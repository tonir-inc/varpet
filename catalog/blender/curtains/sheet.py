"""Contact sheet of the bpy-curtains previews: 4 columns, slug + size label.

cd catalog && uv run python blender/curtains/sheet.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DATA = Path(__file__).resolve().parents[2] / "data"
entries = json.loads((DATA / "extra" / "bpy-curtains" / "entries.json").read_text())
prev = DATA / "previews-extra" / "bpy-curtains"
cell, label, cols = 384, 40, 4
rows = -(-len(entries) // cols)
sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), "white")
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 13)
except OSError:
    font = ImageFont.load_default()
for i, e in enumerate(entries):
    x, y = (i % cols) * cell, (i // cols) * (cell + label)
    png = prev / f"{e['slug']}.png"
    if png.exists():
        sheet.paste(Image.open(png).convert("RGB").resize((cell, cell)), (x, y))
    w, d, h = e["size_m"]
    draw.text((x + 6, y + cell + 3), e["slug"], fill="black", font=font)
    draw.text((x + 6, y + cell + 20), f"{w:.2f} x {d:.2f} x {h:.2f} m  ({e['kind']})", fill=(90, 90, 90), font=font)
out = DATA / "previews-extra" / "bpy-curtains-sheet.png"
sheet.save(out)
print(out)
