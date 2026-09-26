"""Query-time SigLIP 2 text embedding, model loaded once per process."""
import os
from functools import lru_cache

import torch
from transformers import AutoModel, AutoProcessor

DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"


@lru_cache(maxsize=2)
def _load(short):
    name = f"google/{short}"
    # A bfloat16 copy saved once (see deploy/) loads without a float32 intermediate: half the RAM.
    local = os.path.join(os.environ.get("SIGLIP_DIR", ""), f"{short}-bf16")
    if os.environ.get("SIGLIP_DIR") and os.path.isdir(local):
        name = local
    # bfloat16 on CPU halves memory on the shared VM; MPS keeps float32.
    dtype = torch.float32 if DEVICE == "mps" else torch.bfloat16
    model = AutoModel.from_pretrained(name, dtype=dtype, low_cpu_mem_usage=True).to(DEVICE).eval()
    if DEVICE == "cpu":  # hand the float32 load buffers back to the OS
        import ctypes, gc
        gc.collect()
        try:
            ctypes.CDLL("libc.so.6").malloc_trim(0)
        except OSError:
            pass
    return model, AutoProcessor.from_pretrained(name)


def _feat(out):
    """transformers 5 returns an output object; older versions a tensor."""
    return out if isinstance(out, torch.Tensor) else out.pooler_output


@torch.no_grad()
def text(query, short="siglip2-base-patch16-224"):
    model, proc = _load(short)
    x = proc(text=[query.lower()], padding="max_length", max_length=64, truncation=True, return_tensors="pt").to(DEVICE)
    return torch.nn.functional.normalize(_feat(model.get_text_features(**x)).float(), dim=-1)[0].cpu().numpy()


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
    return torch.nn.functional.normalize(_feat(model.get_image_features(**{k: (v.to(model.dtype) if v.is_floating_point() else v) for k, v in x.items()})).float(), dim=-1)[0].cpu().numpy()
