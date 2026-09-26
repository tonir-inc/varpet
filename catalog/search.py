"""Furniture search: hard filters in code, soft scores blended, a `why` per result.

Every soft signal is optional and switchable so approaches can be compared on the eval set:
  colour_mode: listing | image | both      text_mode: fts | vector | both
"""
import json
import os
import re
from dataclasses import dataclass, field

import numpy as np
import psycopg

from colors import PALETTE, listing_palette
from select_editor_set import EDITOR_KIND_OF, EDITOR_KINDS

DEFAULT_WEIGHTS = {"text": 1.0, "colour": 1.0, "tags": 0.5, "visual": 1.5, "size": 0.3, "room": 0.8}

# Items the editor and the designer bridge can place exactly: an editor kind (or a mapped subtype), a mesh, a price, a name, one size
# (no listing/mesh conflict, not a sideways mesh) inside the editor's 0.01-20 m. Everything that passes is
# placeable; there is no count cap, so clients search and fetch by id instead of loading a set.
PLACEABLE_KINDS = (*EDITOR_KINDS, *EDITOR_KIND_OF)  # subtypes the editor and the bridge map to an editor kind
PLACEABLE = (
    f"(kind in ({', '.join(repr(k) for k in PLACEABLE_KINDS)}) and source = 'abo'"
    " and glb_url is not null and price is not null and name is not null and size_status <> 'conflict'"
    " and not coalesce((size_evidence->>'wd_swapped')::boolean, false)"
    " and least(size_m[1], size_m[2], size_m[3]) >= 0.01 and greatest(size_m[1], size_m[2], size_m[3]) <= 20)"
)


@dataclass
class Query:
    kind: str | None = None
    text: str | None = None
    colors: list[str] = field(default_factory=list)        # palette names
    styles: list[str] = field(default_factory=list)
    materials: list[str] = field(default_factory=list)
    fit_box: list[float] | None = None                     # max [w, d, h] in metres
    allow_rotate: bool = True
    target_size: list[float] | None = None
    price_max: int | None = None
    like_item: str | None = None                           # item id for visual similarity
    like_image: str | None = None                          # photo path or URL for visual similarity
    exclude_ids: list[str] = field(default_factory=list)
    scope: str = "placeable"                               # placeable (editor is an alias) | all
    colour_mode: str = "astra"                            # Astra tags only: best on 20 photo-labelled queries (0.87 vs 0.81)
    text_mode: str = "vector"                             # SigLIP text-to-image: best in eval
    model: str = "siglip2-base-patch16-224"
    weights: dict = field(default_factory=dict)
    limit: int = 10
    collapse_variants: bool = True
    room_items: list[str] = field(default_factory=list)     # catalog ids already in the flat
    offset: int = 0


_FAMILY_COLORS = set(PALETTE) | set(
    "navy charcoal ivory cream walnut espresso oak grey gray black white blue green "
    "beige brown red pink yellow orange purple gold silver brass natural light dark".split()
)
_SIZE = re.compile(r'\b\d+(?:\.\d+)?\s*(?:["″”][wdh]?|(?:cm|mm|inches|inch|in)\b)', re.I)


def family_key(name, kind):
    """Normalised product name and kind; None means an ungroupable unnamed item."""
    if name is None:
        return None
    name = _SIZE.sub(" ", name.lower().rsplit(",", 1)[0])
    words = re.sub(r"[\W_]+", " ", name).split()
    return kind, " ".join(word for word in words if word not in _FAMILY_COLORS)


def collapse_variants(items):
    """Collapse filtered records by descending score without modifying the inputs."""
    families, out = {}, []
    for item in sorted(items, key=lambda item: item["score"], reverse=True):
        key = family_key(item["name"], item["kind"])
        if key is None or key not in families:
            representative = {**item, "variants": []}
            out.append(representative)
            if key is not None:
                families[key] = representative
        elif len(families[key]["variants"]) < 8:
            families[key]["variants"].append({
                field: item[field] for field in ("id", "colors_astra", "price", "size_m")
            })
    return out


def turned_fits(size, box):
    """True when the item fits only when turned 90 degrees (width and depth swapped)."""
    straight = min(box[0] - size[0], box[1] - size[1], box[2] - size[2]) >= 0
    turned = min(box[0] - size[1], box[1] - size[0], box[2] - size[2]) >= 0
    return turned and not straight


def fits(size, box, rotate=True):
    """Per-axis margins (box - size, metres) in the best orientation; all >= 0 means it fits."""
    straight = [box[0] - size[0], box[1] - size[1], box[2] - size[2]]
    if not rotate:
        return straight
    turned = [box[0] - size[1], box[1] - size[0], box[2] - size[2]]
    return max(straight, turned, key=lambda m: min(m))


ALIASES = {"both": "listing+image", "all": "listing+image+astra"}


def _words(v):
    """Model tags are sometimes a string, sometimes a list: always a list of strings."""
    if not v or isinstance(v, bool):
        return []
    return [str(x) for x in (v if isinstance(v, list) else [v]) if x]


def room_score(sim_norm, cand_tags, room_tags):
    """Blend image similarity with Jaccard overlap of Astra style/material tags.

    room_tags is a list of Astra dictionaries. Missing tag evidence falls back
    to similarity alone; colours and listing tags do not contribute.
    """
    def words(tags):
        return {word.lower() for key in ("style", "materials")
                for word in _words((tags or {}).get(key))}

    candidate = words(cand_tags)
    room = set().union(*(words(tags) for tags in room_tags))
    if not candidate or not room:
        return float(sim_norm)
    overlap = len(candidate & room) / len(candidate | room)
    return 0.6 * float(sim_norm) + 0.4 * overlap


def excluded_ids(q: Query):
    """Exclude explicit omissions and pieces already in the room, without mutation."""
    return list(dict.fromkeys(q.exclude_ids + q.room_items))


def modes(mode, aliases=ALIASES):
    """'listing+astra' -> {'listing', 'astra'}; 'both' and 'all' are shorthands."""
    return set(aliases.get(mode, mode).split("+"))


def colour_score(req, listing_cols, img_cols, astra, mode):
    if not req:
        return None
    parts = {
        "listing": 1.0 if set(req) & set(listing_cols) else 0.0,
        "image": min(1.0, sum(c["share"] for c in img_cols or [] if c["name"] in req) * 1.25),
        "astra": 1.0 if set(req) & set(_words(astra.get("main_color"))) else 0.5 if set(req) & set(_words(astra.get("other_colors"))) else 0.0,
    }
    use = [parts[m] for m in modes(mode)]
    return sum(use) / len(use)


TEXT_ALIASES = {"both": "fts+vector", "all": "fts+vector+openai"}
OPENAI_TEXT = "text-embedding-3-large"


def _text_vec(conn, text, model):
    """Embed the query text with the same SigLIP model (lazy import: torch is heavy)."""
    import embed_siglip_query
    return embed_siglip_query.text(text, model)


def _openai_vec(text):
    """Query embedding with the model the 'doc' rows were built with, through OpenRouter."""
    import embed_openrouter
    return np.array(embed_openrouter.embed([text], f"openai/{OPENAI_TEXT}")[0])


def search(conn, q: Query):
    w = {**DEFAULT_WEIGHTS, **q.weights}
    where, args = ["true"], []
    if q.kind:
        where.append("kind = %s"); args.append(q.kind)
    excluded = excluded_ids(q)
    if excluded:
        where.append("not (id = any(%s))"); args.append(excluded)
    if q.scope in ("placeable", "editor"):
        where.append(PLACEABLE)
    tsq = "plainto_tsquery('english', %s)"
    rank = f"ts_rank_cd(fts, {tsq}, 32)" if q.text else "0"
    rows = conn.execute(
        f"""select id, name, kind, coalesce(fit_size_m, size_m), size_status, price, color_std, colors_img, styles, materials,
                   main_image_url, preview_url, glb_url, size_evidence, tags, {rank}, currency, source, price_source
            from item where {' and '.join(where)}""",
        ([q.text] if q.text else []) + args,
    ).fetchall()

    passed, misses = [], []
    for r in rows:
        (iid, name, kind, size, status, price, cstd, cimg, styles, mats, img, preview, glb, ev, tags, fts,
         currency, source, price_source) = r
        astra = {k: _words(v) for k, v in ((tags or {}).get("astra") or {}).items() if k in ("main_color", "other_colors", "materials", "style")}
        fail = []
        margins = fits(size, q.fit_box, q.allow_rotate) if q.fit_box else None
        if margins and min(margins) < 0:
            fail.append({"fit": [round(m, 3) for m in margins]})
        if q.price_max is not None and (price is None or price > q.price_max):
            fail.append({"price_over": (price or 0) - q.price_max})
        rec = {"id": iid, "name": name, "kind": kind, "size_m": size, "size_status": status, "price": price,
               "currency": currency, "source": source, "price_source": price_source, "size_evidence": ev,
               "colors_listing": listing_palette(cstd), "colors_image": [c["name"] for c in cimg or []],
               "styles": styles, "materials": mats, "image": img, "preview": preview, "glb_url": glb,
               "colors_astra": (astra.get("main_color") or []) + (astra.get("other_colors") or []),
               "style_astra": astra.get("style") or [], "materials_astra": astra.get("materials") or [],
               "wd_swapped": bool((ev or {}).get("wd_swapped")), "_fts": float(fts), "_astra": astra}
        if fail:
            rec["failed"] = fail
            misses.append(rec)
        else:
            if margins:
                rec["fit_margin_m"] = [round(m, 3) for m in margins]
                # The designer must turn it 90 degrees to fit; straight it does not.
                rec["fits_turned"] = q.allow_rotate and turned_fits(size, q.fit_box)
            passed.append((rec, cimg))

    if not passed:
        def overshoot(m):
            f = m["failed"]
            fit = -min(min(x["fit"]) for x in f if "fit" in x) if any("fit" in x for x in f) else 0
            over = max([x["price_over"] for x in f if "price_over" in x] or [0]) / 100_000
            return fit + over
        misses.sort(key=overshoot)
        return {"results": [], "nearest_misses": [_public(m) for m in misses[:3]],
                "hint": "Nothing fits. Relax a constraint: nearest_misses show by how much."}

    ids = [p[0]["id"] for p in passed]
    scores = {k: np.zeros(len(passed)) for k in DEFAULT_WEIGHTS}
    used = set()

    if q.text:
        parts, tm = [], modes(q.text_mode, TEXT_ALIASES)
        if "fts" in tm:
            f = np.array([p[0]["_fts"] for p in passed]); parts.append(f / f.max() if f.max() > 0 else f)
        if "vector" in tm:
            qv = _text_vec(conn, q.text, q.model)
            parts.append(_minmax(_sims(conn, ids, q.model, "image", qv)))
        if "openai" in tm:
            parts.append(_minmax(_sims(conn, ids, OPENAI_TEXT, "doc", _openai_vec(q.text))))
        scores["text"] = np.mean(parts, axis=0); used.add("text")
    if q.colors:
        scores["colour"] = np.array([colour_score(q.colors, p[0]["colors_listing"], p[1], p[0]["_astra"], q.colour_mode) for p in passed]); used.add("colour")
    if q.styles or q.materials:
        want = {s.lower() for s in q.styles + q.materials}
        def have(rec):
            words = (rec["styles"] or []) + (rec["materials"] or []) + rec["materials_astra"] + rec["style_astra"]
            return {t.lower() for t in words}
        scores["tags"] = np.array([len(want & have(p[0])) / len(want) for p in passed]); used.add("tags")
    ref = None
    if q.like_item:
        row = conn.execute("select emb::text from item_embedding where item_id=%s and model=%s and modality='image'", (q.like_item, q.model)).fetchone()
        ref = np.array(json.loads(row[0])) if row else None
    elif q.like_image:
        import embed_siglip_query
        ref = embed_siglip_query.image(q.like_image, q.model)
    if ref is not None:
        sims = _sims(conn, ids, q.model, "image", ref)
        scores["visual"] = _minmax(sims); used.add("visual")
        for (rec, _), s in zip(passed, sims):
            rec["visual_similarity"] = round(float(s), 3)
    if q.target_size:
        t = np.array(q.target_size)
        scores["size"] = np.array([1 / (1 + np.abs(np.array(p[0]["size_m"]) - t).sum()) for p in passed]); used.add("size")

    if q.room_items:
        room_tags = [(tags or {}).get("astra") or {} for (tags,) in conn.execute(
            "select tags from item where id = any(%s)", (q.room_items,),
        ).fetchall()]
        refs = conn.execute(
            "select emb::text from item_embedding where item_id = any(%s) and model=%s and modality='image'",
            (q.room_items, q.model),
        ).fetchall()
        sims = [_sims(conn, ids, q.model, "image", json.loads(row[0])) for row in refs]
        sim_norm = _minmax(np.mean(sims, axis=0)) if sims else np.zeros(len(passed))
        scores["room"] = np.array([
            room_score(sim, rec["_astra"], room_tags)
            for (rec, _), sim in zip(passed, sim_norm)
        ])
        used.add("room")

    total = sum(w[k] * scores[k] for k in used) if used else np.zeros(len(passed))
    # Ties break on id, so offset pages are stable across calls.
    order = sorted(range(len(passed)), key=lambda i: (-total[i], ids[i]))
    out = []
    for i in order:
        rec = _public(passed[i][0])
        rec["score"] = float(total[i])
        rec["why"] = {k: round(float(scores[k][i]), 3) for k in used}
        out.append(rec)
    if q.collapse_variants:
        out = collapse_variants(out)
    # Pages count products after variants collapse, so a page never repeats a family.
    page = out[q.offset : q.offset + q.limit]
    for rec in page:
        rec["score"] = round(rec["score"], 3)
    more = q.offset + q.limit < len(out)
    return {"results": page, "candidates": len(passed), "next_offset": q.offset + q.limit if more else None}


def _sims(conn, ids, model, modality, qv):
    rows = dict(conn.execute("select item_id, emb::text from item_embedding where item_id = any(%s) and model=%s and modality=%s", (ids, model, modality)).fetchall())
    qv = np.asarray(qv, dtype=float)
    return np.array([float(np.dot(json.loads(rows[i]), qv)) if i in rows else -1.0 for i in ids])


def _minmax(x):
    lo, hi = x.min(), x.max()
    return (x - lo) / (hi - lo) if hi > lo else np.zeros_like(x)


def _public(rec):
    return {k: v for k, v in rec.items() if not k.startswith("_")}


if __name__ == "__main__":
    import sys
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as c:
        print(json.dumps(search(c, Query(**json.loads(sys.argv[1]))), indent=1, ensure_ascii=False)[:4000])
