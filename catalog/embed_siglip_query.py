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


MAX_IMAGE_BYTES = 10 * 1024 * 1024


def validate_image_url(url):
    from urllib.parse import urlsplit, unquote
    parsed = urlsplit(str(url))
    host = parsed.hostname
    catalog_host = os.environ.get("CATALOG_HTTP_HOST", "100.107.246.46").lower()
    local_hosts = {catalog_host, "localhost", "127.0.0.1"}
    if (parsed.scheme not in ("http", "https") or parsed.username or parsed.password
            or host not in local_hosts | {"amazon-berkeley-objects.s3.amazonaws.com"}):
        raise ValueError("image must be an allowlisted HTTP(S) URL; local paths are forbidden")
    path = unquote(parsed.path)
    if host in local_hosts and (
            not path.startswith(("/previews/", "/models/"))
            or any(part in (".", "..") for part in path.split("/"))
            or "%" in path or "\\" in path):
        raise ValueError("catalog image URLs must be under /previews/ or /models/")
    return str(url)


def fetch_image(url):
    """Untrusted MCP input: bounded streaming, no redirects, decode before model load."""
    import io
    import urllib.request
    from PIL import Image, UnidentifiedImageError

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise ValueError("image redirects are forbidden")

    url = validate_image_url(url)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    data = bytearray()
    with opener.open(url, timeout=10) as response:
        length = response.headers.get("Content-Length")
        if length and int(length) > MAX_IMAGE_BYTES:
            raise ValueError("image exceeds 10 MB")
        while True:
            chunk = response.read(min(65536, MAX_IMAGE_BYTES + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > MAX_IMAGE_BYTES:
                raise ValueError("image exceeds 10 MB")
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.load()
            return img.convert("RGB")
    except (OSError, ValueError, Image.DecompressionBombError, UnidentifiedImageError) as exc:
        raise ValueError("image URL must decode as an image") from exc


@torch.no_grad()
def image(url, short="siglip2-base-patch16-224"):
    img = fetch_image(url)
    model, proc = _load(short)
    x = proc(images=[img], return_tensors="pt").to(DEVICE)
    return torch.nn.functional.normalize(_feat(model.get_image_features(**{k: (v.to(model.dtype) if v.is_floating_point() else v) for k, v in x.items()})).float(), dim=-1)[0].cpu().numpy()
