"""Contact sheet of the previews with slug, size and price under each tile.

uv run --with pillow python catalog/blender/soft/sheet.py [out.png] [slug-substring ...]
Reads out/previews/*.png and out/bpy-softgoods/entries.json (or out/meta/*.json before collect).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
args = sys.argv[1:]
dest = Path(args.pop(0)) if args and args[0].endswith(".png") else OUT / "contact-sheet.png"
meta = {m["slug"]: m for m in (json.loads(p.read_text()) for p in sorted((OUT / "meta").glob("*.json")))}
pngs = sorted(OUT.glob("previews/*.png"), key=lambda p: (meta.get(p.stem, {}).get("order", 1e9), p.stem))
pngs = [p for p in pngs if not args or any(a in p.stem for a in args)]
T, LBL, COLS = 220, 34, 10
rows = (len(pngs) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * T, rows * (T + LBL)), "white")
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 11)
except OSError:
    font = ImageFont.load_default()
for i, p in enumerate(pngs):
    x, y = i % COLS * T, i // COLS * (T + LBL)
    sheet.paste(Image.open(p).convert("RGB").resize((T, T), Image.LANCZOS), (x, y))
    m = meta.get(p.stem, {})
    size = "x".join(f"{v * 100:.0f}" for v in m.get("size_m", []))
    draw.text((x + 4, y + T + 2), p.stem[:36], fill="black", font=font)
    draw.text((x + 4, y + T + 17), f"{size} cm  {m.get('price_amd', 0) // 1000}k AMD", fill="#555", font=font)
dest.parent.mkdir(parents=True, exist_ok=True)
sheet.save(dest)
print(dest, len(pngs))
