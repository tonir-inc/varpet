"""Query-time SigLIP 2 text embedding, model loaded once per process."""
from functools import lru_cache

import torch
from transformers import AutoModel, AutoProcessor

DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"


@lru_cache(maxsize=2)
def _load(short):
    name = f"google/{short}"
    return AutoModel.from_pretrained(name).to(DEVICE).eval(), AutoProcessor.from_pretrained(name)


def _feat(out):
    """transformers 5 returns an output object; older versions a tensor."""
    return out if isinstance(out, torch.Tensor) else out.pooler_output


@torch.no_grad()
def text(query, short="siglip2-base-patch16-224"):
    model, proc = _load(short)
    x = proc(text=[query.lower()], padding="max_length", max_length=64, truncation=True, return_tensors="pt").to(DEVICE)
    return torch.nn.functional.normalize(_feat(model.get_text_features(**x)), dim=-1)[0].cpu().numpy()


@torch.no_grad()
def image(path_or_url, short="siglip2-base-patch16-224"):
    import io
    import urllib.request
    from PIL import Image
    model, proc = _load(short)
    if str(path_or_url).startswith("http"):
        data = io.BytesIO(urllib.request.urlopen(path_or_url, timeout=20).read())
    else:
        data = path_or_url
    x = proc(images=[Image.open(data).convert("RGB")], return_tensors="pt").to(DEVICE)
    return torch.nn.functional.normalize(_feat(model.get_image_features(**x)), dim=-1)[0].cpu().numpy()
