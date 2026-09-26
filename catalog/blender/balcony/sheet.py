"""Contact sheet of the balcony previews: 4 columns, slug + size under each tile.

cd catalog && uv run --with pillow python blender/balcony/sheet.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2] / "data"
entries = json.loads((ROOT / "extra/bpy-balcony/entries.json").read_text())
prev = ROOT / "previews-extra/bpy-balcony"
T, LAB, COLS = 384, 44, 4
rows = (len(entries) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * T, rows * (T + LAB)), "white")
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
except OSError:
    font = ImageFont.load_default()
for i, e in enumerate(entries):
    x, y = (i % COLS) * T, (i // COLS) * (T + LAB)
    sheet.paste(Image.open(prev / f"{e['slug']}.png").convert("RGB").resize((T, T)), (x, y))
    w, d, h = e["size_m"]
    draw.text((x + 8, y + T + 4), e["slug"], fill="black", font=font)
    draw.text((x + 8, y + T + 23), f"{e['kind']}  {w:.2f} x {d:.2f} x {h:.2f} m", fill="#555", font=font)
out = ROOT / "previews-extra/bpy-balcony-sheet.png"
sheet.save(out)
print(out)
