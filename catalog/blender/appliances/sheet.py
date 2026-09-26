"""Contact sheet of the appliance previews: 4 columns, slug + size label.
Run: cd catalog && uv run python blender/appliances/sheet.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CAT = Path(__file__).resolve().parents[2]
PREV = CAT / "data" / "previews-extra" / "bpy-appliances"
entries = json.loads((CAT / "data" / "extra" / "bpy-appliances" / "entries.json").read_text())
cell, label, cols = 384, 40, 4
rows = (len(entries) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), "white")
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
except OSError:
    font = ImageFont.load_default()
for i, e in enumerate(entries):
    x, y = (i % cols) * cell, (i // cols) * (cell + label)
    png = PREV / (e["slug"] + ".png")
    if png.exists():
        sheet.paste(Image.open(png).convert("RGB").resize((cell, cell)), (x, y))
    w, d, h = (round(v * 100) for v in e["size_m"])
    draw.text((x + 8, y + cell + 3), e["slug"], fill="black", font=font)
    draw.text((x + 8, y + cell + 21), f"{w} x {d} x {h} cm  ({e['kind']})", fill="#555555", font=font)
out = CAT / "data" / "previews-extra" / "bpy-appliances-sheet.png"
sheet.save(out)
print(out)
