"""SigLIP 2 embeddings for every item: image (main photo) and text (name + tags), same space.

Usage: uv run embed_siglip.py [model]   default google/siglip2-base-patch16-224
Writes item_embedding rows (model = short name, modality = image | text).
"""
import os
import sys
from pathlib import Path

import psycopg
import torch
from PIL import Image
from transformers import AutoModel, AutoProcessor

IMG = Path(__file__).parent / "data" / "img"
MODEL = sys.argv[1] if len(sys.argv) > 1 else "google/siglip2-base-patch16-224"
SHORT = MODEL.split("/")[-1]
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
BATCH = 32

model = AutoModel.from_pretrained(MODEL).to(DEVICE).eval()
proc = AutoProcessor.from_pretrained(MODEL)


def item_text(r):
    name, kind, colors, materials, styles = r
    parts = [kind, name or ""] + (colors or []) + (materials or []) + (styles or [])
    return " ".join(p for p in parts if p)[:300]


def _feat(out):
    """transformers 5 returns an output object; older versions a tensor."""
    return out if isinstance(out, torch.Tensor) else out.pooler_output


@torch.no_grad()
def embed_images(paths):
    ims = [Image.open(p).convert("RGB") for p in paths]
    x = proc(images=ims, return_tensors="pt").to(DEVICE)
    return torch.nn.functional.normalize(_feat(model.get_image_features(**x)), dim=-1).cpu().tolist()


@torch.no_grad()
def embed_texts(texts):
    x = proc(text=[t.lower() for t in texts], padding="max_length", max_length=64, truncation=True, return_tensors="pt").to(DEVICE)
    return torch.nn.functional.normalize(_feat(model.get_text_features(**x)), dim=-1).cpu().tolist()


def main():
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as conn:
        rows = conn.execute("select id, source_id, name, kind, color_text, materials, styles from item order by id").fetchall()
        done = {r[0] for r in conn.execute("select item_id from item_embedding where model=%s and modality='image'", (SHORT,))}
        rows = [r for r in rows if r[0] not in done]
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i + BATCH]
            with_img = [r for r in chunk if (IMG / f"{r[1]}.jpg").exists()]
            img = embed_images([IMG / f"{r[1]}.jpg" for r in with_img]) if with_img else []
            txt = embed_texts([item_text(r[2:]) for r in chunk])
            data = [(r[0], SHORT, "image", str(e)) for r, e in zip(with_img, img)]
            data += [(r[0], SHORT, "text", str(e)) for r, e in zip(chunk, txt)]
            with conn.cursor() as cur:
                cur.executemany("insert into item_embedding values (%s,%s,%s,%s::vector) on conflict do nothing", data)
            conn.commit()
            if i % 640 == 0:
                print(i, "/", len(rows), flush=True)
    print("done", SHORT)


if __name__ == "__main__":
    main()
