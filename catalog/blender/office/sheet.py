"""Contact sheet of the office previews: python sheet.py [out.png] [slug ...] (4 columns, slug + size)."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CAT = Path(__file__).resolve().parents[2] / "data"
PREV = CAT / "previews-extra" / "bpy-office"
entries = json.loads((CAT / "extra" / "bpy-office" / "entries.json").read_text())
out = Path(sys.argv[1]) if len(sys.argv) > 1 else CAT / "previews-extra" / "bpy-office-sheet.png"
want = sys.argv[2:]
entries = [e for e in entries if (not want or e["slug"] in want) and (PREV / f"{e['slug']}.png").exists()]
cols, cell, label = 4, 400, 40
rows = (len(entries) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), "white")
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
except OSError:
    font = ImageFont.load_default()
for i, e in enumerate(entries):
    x, y = i % cols * cell, i // cols * (cell + label)
    sheet.paste(Image.open(PREV / f"{e['slug']}.png").convert("RGB").resize((cell, cell)), (x, y))
    w, d, h = (round(v * 100) for v in e["size_m"])
    draw.text((x + 8, y + cell + 3), e["slug"], fill="black", font=font)
    draw.text((x + 8, y + cell + 21), f"{w} x {d} x {h} cm  |  {e['tris']} tris", fill="#555", font=font)
sheet.save(out)
print(out)
