"""Contact sheet of out/previews with slug, size and price under each cell.

python3 catalog/blender/kitchen/sheet.py                        -> catalog/blender/kitchen/contact-sheet.jpg (committed)
python3 catalog/blender/kitchen/sheet.py out/upper.jpg upper 360  -> one family, bigger cells (for review)
Reads out/meta/*.json (works before collect.py). Needs Pillow (uv run --with pillow python ...).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
dest = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "contact-sheet.jpg"
family = sys.argv[2] if len(sys.argv) > 2 else None
cell = int(sys.argv[3]) if len(sys.argv) > 3 else 200
entries = sorted((json.loads(p.read_text()) for p in (OUT / "meta").glob("*.json")), key=lambda e: e["order"])
entries = [e for e in entries if not family or e["family"] == family]
label, cols = 32, 10 if cell <= 220 else 5
rows = (len(entries) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell, rows * (cell + label)), "white")
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 11)
except OSError:
    font = ImageFont.load_default()
for i, e in enumerate(entries):
    x, y = (i % cols) * cell, (i // cols) * (cell + label)
    png = OUT / "previews" / f"{e['slug']}.png"
    if png.exists():
        sheet.paste(Image.open(png).convert("RGB").resize((cell, cell), Image.LANCZOS), (x, y))
    w, d, h = (round(v * 100) for v in e["size_m"])
    draw.text((x + 4, y + cell + 2), e["slug"][:34], fill="black", font=font)
    draw.text((x + 4, y + cell + 16), f"{w}x{d}x{h} cm  {e['price_amd'] // 1000}k AMD", fill="#555555", font=font)
dest.parent.mkdir(parents=True, exist_ok=True)
sheet.save(dest, quality=78, optimize=True)
print(dest, len(entries), f"{dest.stat().st_size // 1024} KB")
