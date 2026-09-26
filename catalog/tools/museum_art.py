"""Framed wall-art GLBs from public-domain museum images (The Met Open Access, Art Institute of Chicago).

Run from catalog/:
  uv run python tools/museum_art.py            fetch (cached), pick ~300, build GLBs + entries.json
  uv run python tools/museum_art.py sheet      contact sheet from rendered previews

Only objects the museum's API flags public domain are used: Met `isPublicDomain == true`
(Open Access, CC0), AIC `is_public_domain == true` (images CC0). Cache (JSON + images) lives in
data/museum-cache/; output in data/extra/museum-art/ (the format of ingest_extra.validate_entry).

GLB: glTF Y-up, metres, front faces +Z, centred on x/z, base at y=0, back at z=-d/2.
Frame is a mitred loft of a profile around the outer rectangle; works on paper get a mat.
"""
import hashlib
import io
import itertools
import json
import re
import struct
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "museum-cache"
OUT = ROOT / "data" / "extra" / "museum-art"
PREVIEWS = ROOT / "data" / "previews-extra" / "museum-art"
SHEET = ROOT / "data" / "previews-extra" / "museum-art-sheet.png"

API_UA = "varpet-catalog/0.1 (wall-art ingest; felo.markosyan@gmail.com)"
MET = "https://collectionapi.metmuseum.org/public/collection"
AIC = "https://api.artic.edu/api/v1"
AIC_FIELDS = ["id", "title", "image_id", "artist_title", "artist_display", "date_display",
              "classification_title", "medium_display", "thumbnail", "is_public_domain",
              "subject_titles", "term_titles", "style_title", "place_of_origin"]

PER_MUSEUM = 15  # per category; 10 categories x 2 museums = 300
MAX_TOTAL = 300
MAX_GLB = 400_000

# category: style, subject, Met queries (q, departmentId or None), AIC queries
CATEGORIES = [
    ("japanese-woodblock", "japandi", "Japanese woodblock print",
     [("Hiroshige", 6), ("Hokusai", 6), ("Kawase Hasui", 6), ("ukiyo-e landscape", 6)],
     ["Hiroshige", "Hokusai", "Japanese woodblock print landscape", "surimono flowers"]),
    ("ink-and-sketch", "minimalist", "ink drawing / sketch",
     [("bamboo ink", 6), ("Seurat drawing", 9), ("study of trees", 9), ("clouds study", 9)],
     ["ink bamboo", "Seurat conte crayon", "sketch of trees", "study of clouds"]),
    ("botanical", "scandinavian", "botanical print",
     [("Redouté", 9), ("botanical", 9), ("flowers watercolor", 9), ("tulip", 9)],
     ["Redoute", "botanical illustration", "flower study watercolor", "fern"]),
    ("landscape", "traditional", "landscape painting",
     [("landscape", 11), ("Hudson River landscape", 1), ("Corot", 11), ("pastoral landscape", 11)],
     ["landscape painting", "Corot", "Hudson River School", "Inness landscape"]),
    ("impressionist-still-life", "classic", "still life / impressionist painting",
     [("still life", 11), ("Monet", 11), ("Cézanne", 11), ("Pissarro", 11)],
     ["Monet", "still life flowers painting", "Pissarro", "Caillebotte"]),
    ("abstract-modern", "modern", "early modern / abstract",
     [("Klee", 21), ("abstraction", 21), ("cubist", 21), ("Delaunay", 21), ("Arthur Wesley Dow", None),
      ("Vallotton", 9), ("Signac", None), ("Kupka", None), ("Mondrian", None), ("Henri Rivière", 9)],
     ["abstraction", "cubism", "Kandinsky", "Paul Klee"]),
    ("poster-design", "mid-century", "poster / graphic design",
     [("poster", 9), ("Wiener Werkstätte", 9), ("Art Deco design", 9), ("Bauhaus", 9),
      ("Edward Penfield", 9), ("Will Bradley", 9), ("Koloman Moser", None), ("Ethel Reed", 9)],
     ["poster", "Wiener Werkstatte", "textile design pattern", "Art Deco"]),
    ("city-architecture", "industrial", "city / architecture print",
     [("Piranesi", 9), ("bridge etching", 9), ("New York skyline", 9), ("Whistler Thames", 9)],
     ["Piranesi", "Whistler Thames etching", "bridge etching", "city street lithograph"]),
    ("birds-and-pattern", "boho", "birds / decorative",
     [("birds", 6), ("Audubon", 1), ("peacock", 6), ("Mughal flowers", 6)],
     ["birds woodblock", "Audubon", "peacock", "Indian painting flowers"]),
    ("art-nouveau-symbolist", "eclectic", "art nouveau / symbolist",
     [("Mucha", 9), ("Redon", 9), ("art nouveau", 9), ("Toulouse-Lautrec poster", 9)],
     ["Mucha", "Odilon Redon", "art nouveau", "Toulouse-Lautrec"]),
]

BLOCK = re.compile(
    r"\b(crucifi\w*|martyr\w*|saints?|st\.|christ|jesus|madonna|virgin|holy|piet[aà]|deposition|"
    r"entombment|lamentation|judith|holofernes|massacre|battles?|wars?|warriors?|soldiers?|army|siege|"
    r"execution|death|dead|dying|corpse|skulls?|skeletons?|nudes?|naked|bathers?|bathing|venus|leda|"
    r"erotic|shunga|hanging|murder|suicide|blood|wounded|hell|demons?|satan|devil|slaves?|gun|cannon|"
    r"weapons?|tortur\w*|prison|bible|angels?|apostles?|pope|prophet|buddha|bodhisattva|crime|"
    r"lovers|courtesan|brothel|kiss|samurai|actor|kabuki|fragment|verso|sketchbook|design for)\b", re.I)

FLAT_ART = re.compile(r"paint|print|drawing|woodcut|poster|lithograph|watercolou?r|folio|page|cut paper")
NOT_FLAT = re.compile(r"photograph|vase|netsuke|inr|inkstone|press|burner|box|lid|portfolio|collection|"
                      r"sculpture|ceramic|textile|costume|book|album|fan|screen|scroll")

# frame styles: face width m, depth m, profile kind
PROFILES = {"slim": (0.015, 0.022), "flat": (0.03, 0.025), "box": (0.02, 0.04), "bevel": (0.045, 0.032)}
FRAME_COLORS = {  # rgb linear-ish, metallic, roughness
    "black": ((0.02, 0.02, 0.02), 0.0, 0.55), "white": ((0.86, 0.86, 0.84), 0.0, 0.6),
    "oak": ((0.45, 0.27, 0.12), 0.0, 0.65), "walnut": ((0.075, 0.035, 0.017), 0.0, 0.6),
    "gold": ((0.78, 0.56, 0.22), 0.85, 0.35),
}
STYLE_FRAMES = {
    "japandi": ["oak", "black", "walnut"], "minimalist": ["black", "white", "oak"],
    "scandinavian": ["white", "oak", "black"], "traditional": ["gold", "walnut", "black"],
    "classic": ["gold", "walnut", "black"], "modern": ["black", "white"],
    "mid-century": ["walnut", "oak", "black"], "industrial": ["black", "walnut"],
    "boho": ["oak", "walnut", "gold"], "eclectic": ["gold", "black", "white", "oak", "walnut"],
}
SIZES = [(0.4, 12000), (0.6, 18000), (0.9, 28000), (1.2, 42000)]
MAT = ((0.93, 0.91, 0.86), 0.0, 0.9)
BACK = ((0.35, 0.26, 0.17), 0.0, 0.95)

_last = {}
BLOCKED = set()


class Challenged(RuntimeError):
    pass


def polite(host, gap):
    wait = _last.get(host, 0) + gap - time.time()
    if wait > 0:
        time.sleep(wait)
    _last[host] = time.time()


def http(url, *, data=None, headers=None, gap=1.0, tries=4):
    host = urllib.parse.urlparse(url).netloc
    last = None
    for attempt in range(tries):
        polite(host, gap * (1 + 2 * attempt))
        try:
            req = urllib.request.Request(url, data=data, headers=headers or {})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code == 403:  # WAF block (Met: Incapsula, AIC: Cloudflare): stop, do not hammer
                raise Challenged(f"{url}: blocked (403); wait and rerun, the cache resumes")
            if e.code == 404:
                break
            time.sleep(3 * (attempt + 1))
        except Exception as e:  # network blips: retry, then give up on this item
            last = e
    raise RuntimeError(f"{url}: {last}")


def cached_json(path, fetch):
    if path.exists():
        return json.loads(path.read_text())
    value = json.loads(fetch())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value))
    return value


def cached_bytes(path, fetch):
    if path.exists():
        return path.read_bytes()
    value = fetch()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)
    return value


def key(text):
    return hashlib.sha1(text.encode()).hexdigest()[:12]


def pick(seed, options):
    return options[int(hashlib.sha1(seed.encode()).hexdigest(), 16) % len(options)]


# ---------------------------------------------------------------- sources

def met_candidates(q, dept):
    params = {"q": q, "hasImages": "true", "limit": 80}
    if dept:
        params["departmentId"] = dept
    url = f"{MET}/v1.1/search?{urllib.parse.urlencode(params)}"
    ids = cached_json(CACHE / "met" / f"search-{key(url)}.json",
                      lambda: http(url, headers={"User-Agent": API_UA})).get("objectIDs") or []
    for oid in ids:
        try:
            obj = cached_json(CACHE / "met" / "objects" / f"{oid}.json",
                              lambda: http(f"{MET}/v1/objects/{oid}", headers={"User-Agent": API_UA}))
        except Challenged:
            raise
        except RuntimeError as e:
            print("skip met", oid, e)
            continue
        if obj.get("isPublicDomain") is not True or not obj.get("primaryImageSmall"):
            continue
        cls = f"{obj.get('classification', '')} {obj.get('objectName', '')}".lower()
        if not FLAT_ART.search(cls) or NOT_FLAT.search(cls):
            continue  # flat works only: no vases, netsuke, boxes, portfolios, scrolls
        tags = " ".join(t.get("term", "") for t in obj.get("tags") or [])
        yield {
            "museum": "met", "id": str(oid), "title": obj.get("title") or "Untitled",
            "artist": obj.get("artistDisplayName") or obj.get("culture") or "Unknown artist",
            "date": obj.get("objectDate") or "", "url": obj.get("objectURL")
            or f"https://www.metmuseum.org/art/collection/search/{oid}",
            "image": obj["primaryImageSmall"], "text": f"{obj.get('title')} {tags} {obj.get('objectName')}",
            "paper": any(w in cls for w in ("print", "drawing", "watercolor")) or "paper" in
            (obj.get("medium") or "").lower(),
        }


def aic_candidates(q):
    body = {"q": q, "limit": 60, "fields": AIC_FIELDS, "query": {"bool": {"must": [
        {"term": {"is_public_domain": True}}, {"exists": {"field": "image_id"}}]}}}
    if "aic" in BLOCKED:
        return
    raw = json.dumps(body).encode()
    res = cached_json(CACHE / "aic" / f"search-{key(raw.decode())}.json", lambda: http(
        f"{AIC}/artworks/search", data=raw, gap=1.5,
        headers={"Content-Type": "application/json", "AIC-User-Agent": API_UA, "User-Agent": API_UA}))
    iiif = (res.get("config") or {}).get("iiif_url") or "https://www.artic.edu/iiif/2"
    for a in res.get("data") or []:
        if "aic" in BLOCKED:
            return
        if a.get("is_public_domain") is not True or not a.get("image_id"):
            continue
        th = a.get("thumbnail") or {}
        w, h = th.get("width") or 0, th.get("height") or 0
        if w and h and max(w, h) / min(w, h) > 2.5:
            continue
        cls = f"{a.get('classification_title') or ''}".lower()
        med = (a.get("medium_display") or "").lower()
        if any(w_ in cls for w_ in ("photograph", "sculpture", "vessel", "textile", "book", "ceramic",
                                    "furniture", "coin", "fan", "screen", "scroll")):
            continue
        yield {
            "museum": "aic", "id": str(a["id"]), "title": a.get("title") or "Untitled",
            "artist": a.get("artist_title") or (a.get("artist_display") or "Unknown artist").split("\n")[0],
            "date": a.get("date_display") or "", "url": f"https://www.artic.edu/artworks/{a['id']}",
            "image": f"{iiif}/{a['image_id']}/full/843,/0/default.jpg",
            "text": " ".join([a.get("title") or "", *(a.get("subject_titles") or []),
                              *(a.get("term_titles") or [])]),
            "paper": any(w_ in cls for w_ in ("print", "drawing", "watercolor", "woodcut", "etching",
                                              "lithograph")) or "paper" in med,
        }


def curl_image(url, gap):
    """Images via curl: AIC's Cloudflare challenges Python's TLS client but serves curl with an honest UA."""
    polite(urllib.parse.urlparse(url).netloc, gap)
    r = subprocess.run(["curl", "-sS", "-m", "60", "--retry", "2", "-A", API_UA, "-w", "%{http_code}",
                        "-o", "-", url], capture_output=True)
    body, code = r.stdout[:-3], r.stdout[-3:].decode(errors="replace")
    if code == "403":  # WAF block or challenge page: stop instead of hammering
        raise Challenged(f"403 on {url}; wait and rerun (cache resumes)")
    if code != "200" or r.returncode:
        raise RuntimeError(f"{url}: HTTP {code} {r.stderr.decode()[:200]}")
    return body


def load_image(c):
    path = CACHE / c["museum"] / "images" / f"{c['id']}.jpg"
    try:
        data = cached_bytes(path, lambda: curl_image(c["image"], 1.5 if c["museum"] == "aic" else 1.0))
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Challenged as e:
        if c["museum"] != "aic":
            raise
        BLOCKED.add("aic")  # AIC images behind a challenge: backfill this run from the Met
        print("AIC images blocked, backfilling from the Met:", e, flush=True)
        return None
    except Exception as e:
        print("skip image", c["museum"], c["id"], e)
        return None
    img = trim_dark_border(img)
    w, h = img.size
    if max(w, h) / min(w, h) > 2.5 or max(w, h) < 400:
        return None
    small = np.asarray(img.resize((64, 64)), dtype=np.float32) / 255
    lum = small @ np.array([0.2126, 0.7152, 0.0722])
    if lum.mean() < 0.22 or lum.mean() > 0.95 or lum.std() < 0.05:
        return None  # very dark, blank or washed-out scans
    if max(w, h) > 1024:
        s = 1024 / max(w, h)
        img = img.resize((round(w * s), round(h * s)), Image.LANCZOS)
    return img


def trim_dark_border(img, limit=0.06):
    """Crop dark scan edges (the photographed frame rebate), at most `limit` of each side."""
    a = np.asarray(img.convert("L"), dtype=np.float32) / 255
    h, w = a.shape
    dark = lambda line: line.mean() < 0.2
    t = next((i for i in range(int(h * limit)) if not dark(a[i])), int(h * limit))
    b = next((i for i in range(int(h * limit)) if not dark(a[h - 1 - i])), int(h * limit))
    l = next((i for i in range(int(w * limit)) if not dark(a[:, i])), int(w * limit))
    r = next((i for i in range(int(w * limit)) if not dark(a[:, w - 1 - i])), int(w * limit))
    if t or b or l or r:  # a couple of extra pixels past the dark line
        t, b, l, r = (x + 2 if x else 0 for x in (t, b, l, r))
        img = img.crop((l, t, w - r, h - b))
    return img


# ---------------------------------------------------------------- colour

def colour_name(rgb):
    r, g, b = (x / 255 for x in rgb)
    mx, mn = max(r, g, b), min(r, g, b)
    v, s = mx, (mx - mn) / mx if mx else 0
    if mx == mn:
        hue = 0
    elif mx == r:
        hue = (60 * (g - b) / (mx - mn)) % 360
    elif mx == g:
        hue = 60 * (b - r) / (mx - mn) + 120
    else:
        hue = 60 * (r - g) / (mx - mn) + 240
    if v < 0.18:
        return "black"
    if s < 0.12:
        return "white" if v > 0.85 else "grey"
    if 15 <= hue < 55 and s < 0.35 and v > 0.6:
        return "beige"
    if 10 <= hue < 50 and v < 0.6:
        return "brown"
    if s < 0.18:
        return "grey"
    if hue < 12 or hue >= 340:
        return "pink" if s < 0.4 and v > 0.7 else "red"
    for limit, name in ((40, "orange"), (68, "yellow"), (170, "green"), (255, "blue"), (290, "purple")):
        if hue < limit:
            return name
    return "pink"


def palette(img):
    q = img.resize((96, 96)).quantize(colors=6, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()
    counts = sorted(q.getcolors(), reverse=True)
    total = sum(n for n, _ in counts)
    swatches = [(n / total, tuple(pal[i * 3:i * 3 + 3])) for n, i in counts]
    hexes = ["#%02x%02x%02x" % rgb for _, rgb in swatches[:5]]
    weights = Counter()
    for wgt, rgb in swatches:
        weights[colour_name(rgb)] += wgt
    names = [n for n, wgt in weights.most_common(3) if wgt >= 0.12] or [weights.most_common(1)[0][0]]
    return names, hexes


# ---------------------------------------------------------------- geometry

class Mesh:
    def __init__(self):
        self.pos, self.nrm, self.uv, self.idx = [], [], [], []

    def quad(self, pts, normal, uvs=None):
        """Two triangles over 4 corner points, wound so that they face `normal`."""
        pts = [np.asarray(p, float) for p in pts]
        normal = np.asarray(normal, float)
        normal /= np.linalg.norm(normal)
        order = [0, 1, 2, 0, 2, 3]
        if np.dot(np.cross(pts[1] - pts[0], pts[2] - pts[0]), normal) < 0:
            order = [0, 2, 1, 0, 3, 2]
        base = len(self.pos)
        for i, p in enumerate(pts):
            self.pos.append(p)
            self.nrm.append(normal)
            self.uv.append(uvs[i] if uvs else (0.0, 0.0))
        self.idx.extend(base + o for o in order)


def rect(hw, hh, y0, inset, z):
    """Corners (ccw seen from +Z) of the outer rectangle shrunk by `inset`, at depth z."""
    return [(-hw + inset, y0 + inset, z), (hw - inset, y0 + inset, z),
            (hw - inset, y0 + 2 * hh - inset, z), (-hw + inset, y0 + 2 * hh - inset, z)]


def loft(mesh, hw, hh, y0, profile, closed):
    """Mitred ring: sweep a (inset, z) profile around the rectangle; one flat quad per side and step.

    The profile runs counter-clockwise in (outward u = -inset, z) so its outward normal is (tz, -tu).
    """
    outs = [(0, -1), (1, 0), (0, 1), (-1, 0)]  # bottom, right, top, left sides (x, y)
    steps = list(zip(profile, profile[1:] + (profile[:1] if closed else [])))
    for (s0, z0), (s1, z1) in steps:
        a, b = rect(hw, hh, y0, s0, z0), rect(hw, hh, y0, s1, z1)
        tu, tz = -(s1 - s0), z1 - z0
        nu, nz = tz, -tu
        for side, (ox, oy) in enumerate(outs):
            i, j = side, (side + 1) % 4
            mesh.quad([a[i], a[j], b[j], b[i]], (ox * nu, oy * nu, nz))


def build_glb(img, *, seed, style, paper):
    frame_color = pick(seed + "c", STYLE_FRAMES[style])
    profile_names = ["flat", "bevel"] if frame_color == "gold" else list(PROFILES)
    profile_name = pick(seed + "p", profile_names)
    face, depth = PROFILES[profile_name]
    long_side, price = pick(seed + "s", SIZES[:3] * 3 + SIZES[3:])  # 1.2 m is rarer
    face *= max(1.0, long_side / 0.6) ** 0.5
    mat = round(0.07 * long_side + 0.02, 3) if paper else 0.0
    w_px, h_px = img.size
    aspect = w_px / h_px
    art_long = long_side - 2 * face - 2 * mat
    art_w, art_h = (art_long, art_long / aspect) if aspect >= 1 else (art_long * aspect, art_long)
    W, H = art_w + 2 * face + 2 * mat, art_h + 2 * face + 2 * mat
    hw, hh, zf, zb = W / 2, H / 2, depth / 2, -depth / 2

    frame, matm, back, art = Mesh(), Mesh(), Mesh(), Mesh()
    if profile_name == "bevel":
        prof = [(0, zb), (0, zf - 0.006), (0.006, zf), (face * 0.55, zf), (face, zf - 0.012), (face, zb)]
    elif profile_name == "box":
        prof = [(0, zb), (0, zf), (face, zf), (face, zb)]
    else:
        prof = [(0, zb), (0, zf - 0.002), (0.002, zf), (face - 0.002, zf), (face, zf - 0.002), (face, zb)]
    loft(frame, hw, hh, 0.0, prof, closed=True)
    rebate = 0.012 if profile_name == "bevel" else 0.006
    z_art = zf - rebate - (0.003 if paper else 0.0)
    if paper:  # mat ring with a bevelled window down to the art
        z_mat = zf - rebate
        loft(matm, hw, hh, 0.0, [(face, z_mat), (face + mat - 0.002, z_mat), (face + mat, z_art)], closed=False)
    inner = face + mat
    a = rect(hw, hh, 0.0, inner, z_art)
    # glTF UV origin is the image's top-left: bottom-left corner -> (0, 1)
    art.quad(a, (0, 0, 1), uvs=[(0, 1), (1, 1), (1, 0), (0, 0)])
    back.quad(rect(hw, hh, 0.0, face, zb), (0, 0, -1))

    for mesh, want in ((art, (0, 0, 1)), (back, (0, 0, -1))):  # winding sanity check
        p = mesh.pos
        n = np.cross(p[1] - p[0], p[2] - p[0]) if mesh.idx[:3] == [0, 1, 2] else np.cross(p[2] - p[0], p[1] - p[0])
        assert np.dot(n, want) > 0, "art/back quad faces the wrong way"

    parts = [(frame, FRAME_COLORS[frame_color], False), (back, BACK, False), (art, None, True)]
    if paper:
        parts.insert(1, (matm, MAT, False))
    for quality in (88, 82, 75, 68, 60, 50):
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True)
        glb = write_glb(parts, buf.getvalue())
        if len(glb) < MAX_GLB:
            break
    allpos = np.concatenate([np.array(m.pos) for m, _, _ in parts])
    x, y, z = (allpos.max(0) - allpos.min(0)).round(3).tolist()
    ext = [x, z, y]  # catalog order: width, depth, height
    return glb, ext, price, {"profile": profile_name, "color": frame_color, "mat": bool(paper),
                             "face_m": round(face, 3), "long_side_m": long_side}


def write_glb(parts, jpeg):
    bin_, views, accessors, prims, materials = bytearray(), [], [], [], []

    def add_view(data, target=None):
        while len(bin_) % 4:
            bin_.append(0)
        views.append({"buffer": 0, "byteOffset": len(bin_), "byteLength": len(data),
                      **({"target": target} if target else {})})
        bin_.extend(data)
        return len(views) - 1

    def add_acc(arr, typ, comp, target, minmax=False):
        v = add_view(arr.tobytes(), target)
        acc = {"bufferView": v, "componentType": comp, "count": len(arr), "type": typ}
        if minmax:
            acc["min"], acc["max"] = arr.min(0).tolist(), arr.max(0).tolist()
        accessors.append(acc)
        return len(accessors) - 1

    for mesh, mat, textured in parts:
        pos = np.array(mesh.pos, np.float32)
        attrs = {"POSITION": add_acc(pos, "VEC3", 5126, 34962, True),
                 "NORMAL": add_acc(np.array(mesh.nrm, np.float32), "VEC3", 5126, 34962)}
        if textured:
            attrs["TEXCOORD_0"] = add_acc(np.array(mesh.uv, np.float32), "VEC2", 5126, 34962)
            materials.append({"name": "artwork", "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0}, "metallicFactor": 0.0, "roughnessFactor": 0.8}})
        else:
            rgb, metal, rough = mat
            materials.append({"name": "frame" if mesh is parts[0][0] else "mat_or_back",
                              "pbrMetallicRoughness": {"baseColorFactor": [*rgb, 1.0],
                                                       "metallicFactor": metal, "roughnessFactor": rough}})
        idx = add_acc(np.array(mesh.idx, np.uint16), "SCALAR", 5123, 34963)
        prims.append({"attributes": attrs, "indices": idx, "material": len(materials) - 1})
    img_view = add_view(jpeg)
    while len(bin_) % 4:
        bin_.append(0)
    gltf = {"asset": {"version": "2.0", "generator": "varpet museum_art.py"},
            "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": "framed_art"}],
            "meshes": [{"primitives": prims}], "materials": materials, "accessors": accessors,
            "bufferViews": views, "buffers": [{"byteLength": len(bin_)}],
            "images": [{"bufferView": img_view, "mimeType": "image/jpeg"}],
            "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
            "textures": [{"source": 0, "sampler": 0}]}
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(bin_), 0x004E4942) + bytes(bin_))


# ---------------------------------------------------------------- main

def slugify(text, n=40):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:n].strip("-")
    return s or "untitled"


def clean_title(t):
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) <= 90 else t[:87].rsplit(" ", 1)[0] + "..."


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    entries, seen = [], set()
    for cat, style, subject, met_q, aic_q in CATEGORIES:
        got = {"met": [], "aic": []}
        chains = {"met": itertools.chain.from_iterable(met_candidates(q, d) for q, d in met_q),
                  "aic": itertools.chain.from_iterable(aic_candidates(q) for q in aic_q)}
        # PER_MUSEUM from each museum first, then backfill from either if one ran dry
        for museum, quota in (("met", PER_MUSEUM), ("aic", PER_MUSEUM),
                              ("met", 2 * PER_MUSEUM), ("aic", 2 * PER_MUSEUM)):
            for c in chains[museum]:
                if len(got[museum]) >= quota or len(got["met"]) + len(got["aic"]) >= 2 * PER_MUSEUM:
                    break
                uid = f"{c['museum']}-{c['id']}"
                if uid in seen or BLOCK.search(c["text"]) or BLOCK.search(c["artist"]):
                    continue
                seen.add(uid)
                img = load_image(c)
                if img is not None:
                    got[museum].append((c, img))
        print(f"{cat}: met {len(got['met'])}, aic {len(got['aic'])}", flush=True)
        for c, img in got["met"] + got["aic"]:
            if len(entries) >= MAX_TOTAL:
                break
            entries.append(make_entry(c, img, style, subject))
    (OUT / "entries.json").write_text(json.dumps(entries, indent=1, ensure_ascii=False))
    print(f"wrote {len(entries)} entries,",
          f"{sum((OUT / e['glb']).stat().st_size for e in entries) / 1e6:.1f} MB of GLB")
    print("per museum:", dict(Counter(e["museum_id"].split(":")[0] for e in entries)))
    print("per style:", dict(Counter(e["style"] for e in entries)))


def make_entry(c, img, style, subject):
    uid = f"{c['museum']}-{c['id']}"
    slug = f"{uid}-{slugify(c['title'])}"
    glb, ext, price, frame = build_glb(img, seed=uid, style=style, paper=c["paper"])
    (OUT / f"{slug}.glb").write_bytes(glb)
    names, hexes = palette(img)
    museum = "The Metropolitan Museum of Art" if c["museum"] == "met" else "Art Institute of Chicago"
    title = clean_title(c["title"])
    return {
        "slug": slug, "name": f"{title} by {c['artist']}, framed", "kind": "wall_art",
        "source_url": c["url"],
        "license": "CC0 (The Met Open Access)" if c["museum"] == "met" else "CC0 (Art Institute of Chicago)",
        "attribution": ", ".join(x for x in (c["artist"], c["date"], museum) if x),
        "glb": f"{slug}.glb", "size_m": ext, "mesh_extents_m": ext, "colors": names,
        "price_amd": int(price), "materials": ["wood", "paper"] if c["paper"] else ["wood", "canvas"],
        "style": style, "notes": "Wall-hung; front faces +Z; back at z=-d/2",
        "placement": "wall", "palette": hexes, "subject": subject,
        "museum_id": f"{c['museum']}:{c['id']}", "frame": frame,
    }


def prefetch_met():
    """Warm the Met cache (objects + images) for every category, enough to backfill a category."""
    seen = set()
    for cat, _, _, met_q, _ in CATEGORIES:
        n = 0
        for c in itertools.chain.from_iterable(met_candidates(q, d) for q, d in met_q):
            if n >= 2 * PER_MUSEUM:
                break
            if c["id"] in seen or BLOCK.search(c["text"]) or BLOCK.search(c["artist"]):
                continue
            seen.add(c["id"])
            n += load_image(c) is not None
        print(f"{cat}: {n} Met images cached", flush=True)


def sheet(n=24, cols=6, tile=256):
    files = sorted(PREVIEWS.glob("*.png"))
    if not files:
        sys.exit(f"no previews in {PREVIEWS}")
    step = max(1, len(files) // n)
    chosen = files[::step][:n]
    rows = -(-len(chosen) // cols)
    canvas = Image.new("RGB", (cols * tile, rows * tile), "white")
    for i, f in enumerate(chosen):
        canvas.paste(Image.open(f).convert("RGB").resize((tile, tile)), ((i % cols) * tile, (i // cols) * tile))
    canvas.save(SHEET)
    print(f"sheet: {SHEET} ({len(chosen)} of {len(files)})")


if __name__ == "__main__":
    {"sheet": sheet, "prefetch-met": prefetch_met}.get((sys.argv[1:] or ["build"])[0], build)()
