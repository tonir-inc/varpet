"""Contact sheet of out/previews: 6 columns, slug, size and price under each cell.
Run: python3 catalog/blender/lights/sheet.py [out.jpg] [slug ...]   (default: catalog/blender/lights/sheet.jpg)
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
dest = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "sheet.jpg"
only = set(sys.argv[2:])
entries = [e for e in json.loads((OUT / "entries.json").read_text()) if not only or e["slug"] in only]
cell, label, cols = 256, 44, 6
rows = (len(entries) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), "white")
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 12)
except OSError:
    font = ImageFont.load_default()
for i, e in enumerate(entries):
    x, y = (i % cols) * cell, (i // cols) * (cell + label)
    png = OUT / "previews" / f"{e['slug']}.png"
    if png.exists():
        sheet.paste(Image.open(png).convert("RGB").resize((cell, cell)), (x, y))
    w, d, h = (round(v * 100) for v in e["size_m"])
    hang = e.get("hang", {})
    drop = f", drop {round(hang['drop_min_m'] * 100)}-{round(hang['drop_max_m'] * 100)}" if hang.get("adjustable") else ""
    draw.text((x + 6, y + cell + 4), e["slug"], fill="black", font=font)
    draw.text((x + 6, y + cell + 22), f"{w}x{d}x{h} cm{drop}  {e['price_amd'] // 1000}k AMD", fill="#555555", font=font)
sheet.save(dest, quality=82)
print(dest)
