"""Furniture search: hard filters in code, soft scores blended, a `why` per result.

Every soft signal is optional and switchable so approaches can be compared on the eval set:
  colour_mode: listing | image | both      text_mode: fts | vector | both
"""
import functools
import json
import os
import re
import time
import threading
import unicodedata
from dataclasses import dataclass, field

import numpy as np
import psycopg

from colors import PALETTE, listing_palette
from select_editor_set import EDITOR_KIND_OF, EDITOR_KINDS

DEFAULT_WEIGHTS = {"text": 1.0, "colour": 1.0, "tags": 0.5, "visual": 1.5, "size": 0.3, "room": 0.8}

# ABO items the editor and the designer bridge can place exactly: an editor kind (or a mapped subtype), a mesh, a price, a name, one size
# (no listing/mesh conflict, not a sideways mesh) inside the editor's 0.01-20 m. Everything that passes is
# placeable; there is no count cap, so clients search and fetch by id instead of loading a set.
PLACEABLE_KINDS = (*EDITOR_KINDS, *EDITOR_KIND_OF)  # subtypes the editor and the bridge map to an editor kind
NATIVE_EXTRA_KINDS = (
    "toilet", "sink", "bathtub", "shower", "fridge", "stove", "oven", "washing_machine",
    "dryer", "dishwasher", "microwave", "tv", "monitor", "computer", "laptop", "speaker",
    "printer", "game_console", "kitchen_cabinet", "kitchen_counter", "kitchen_island",
    "radiator", "fan", "coat_rack", "shoe_rack", "plant", "decor", "wall_art", "mirror",
)

# Only decoration aliases extend the existing extra-model allowlist.
EXTRA_DECOR_KINDS = tuple(kind for kind, target in EDITOR_KIND_OF.items() if target in {"decor", "wall_art"})
# Wall-hung fittings the editor places through its wall_art kind (always hung on a wall). They stay their own catalog
# kinds: kind=wall_art does not return them.
WALL_FITTING_KINDS = ("range_hood", "water_heater", "towel_rail")
WALL_EXTRA_KINDS = ("wall_art", "mirror", "clock", "wall_hanging", *WALL_FITTING_KINDS)
# Floor and table lamps; a wall or ceiling lamp passes only when its name is one the editor mounts (lamp_mount in build_placeable_sql).
EXTRA_LAMP_KINDS = ("lamp",)
# The editor wall-mounts a lamp named like a sconce and hangs one named like a ceiling light from the ceiling
# (apps/editor/src/core/decoration-placement.ts SCONCE_NAME, CEILING_LAMP_NAME); any other name would stand on the floor.
SCONCE_NAME_SQL = "(^|[^a-z])(sconces?|wall[- ](lamp|light)s?)([^a-z]|$)"
CEILING_LAMP_NAME_SQL = "(^|[^a-z])(ceiling (light|lamp)s?|pendant|flush[- ]mount(ed)?)([^a-z]|$)"
# The editor hangs a hood over the hob only when its name says hood (decoration-placement.ts HOOD_NAME); any other
# range_hood would hang at picture height, so it stays out.
HOOD_NAME_SQL = "(^|[^a-z])(cooker|extractor|chimney|range) ([a-z0-9]+ )?hoods?([^a-z]|$)"
PLACEMENTS = ("ceiling", "floor", "surface", "wall", "window")
# Furniture and window textiles from pipelines that normalise their models and record a placement
# (tags.extra.placement: bpy lanes, Poly Haven, pilot). Older extra furniture without one stays out.
EXTRA_FURNITURE_KINDS = (*(k for k in PLACEABLE_KINDS if k not in EXTRA_DECOR_KINDS), "curtain", "blind")

# Decorative editor kinds are families: searching kind=decor finds toys, vases, cushions... (the catalog keeps the fine
# kind; the editor maps it). Furniture kinds stay exact so kind=chair does not start returning stools and benches.
FAMILY_KINDS = ("decor", "wall_art", "curtain")


def editor_size_ok(size) -> bool:
    """The editor takes a catalog product only when every size is 0.01-20 m (apps/editor/src/adapters/database-catalog.ts)."""
    return bool(size) and len(size) == 3 and all(0.01 <= v <= 20 for v in size)


def kinds_for(kind):
    if kind not in FAMILY_KINDS:
        return [kind]
    return [kind, *(k for k, target in EDITOR_KIND_OF.items() if target == kind and k not in WALL_FITTING_KINDS)]


def build_placeable_sql():
    """Combine unchanged ABO eligibility with extra models, including supported wall decorations."""
    abo = (
        f"(kind in ({', '.join(repr(k) for k in PLACEABLE_KINDS)}) and source = 'abo'"
        " and glb_url is not null and price is not null and name is not null and size_status <> 'conflict'"
        " and not coalesce((size_evidence->>'wd_swapped')::boolean, false)"
        " and least(size_m[1], size_m[2], size_m[3]) >= 0.01 and greatest(size_m[1], size_m[2], size_m[3]) <= 20)"
    )
    # Explicit mounting evidence only; incidental prose and slugs are not evidence.
    supported_wall = (*WALL_EXTRA_KINDS, "curtain", "blind")
    placement = "lower(coalesce(tags->'extra'->>'placement', ''))"
    lamp_mount = (
        "(kind = 'lamp' and ("
        f"({placement} = 'wall' and not (name !~* '{SCONCE_NAME_SQL}'))"
        f" or ({placement} = 'ceiling' and not (name !~* '{CEILING_LAMP_NAME_SQL}') and name !~* '{SCONCE_NAME_SQL}')"
        "))"
    )
    mount_ok = (
        f"(kind in ({', '.join(repr(k) for k in supported_wall)}) or {lamp_mount} or ("
        "lower(coalesce(tags->'extra'->>'placement', '')) not in "
        "('wall', 'wall-mounted', 'ceiling', 'ceiling-mounted')"
        " and coalesce(tags->'extra'->>'notes', '') !~* '^(wall-mounted|wall-hung|ceiling)([^a-zA-Z0-9_]|$)'))"
    )
    extra = (
        f"(kind in ({', '.join(repr(k) for k in (*NATIVE_EXTRA_KINDS, *EXTRA_DECOR_KINDS, *EXTRA_LAMP_KINDS))}) and source = 'extra'"
        f" and glb_url is not null and {mount_ok} and (kind <> 'range_hood' or not (name !~* '{HOOD_NAME_SQL}')))"
    )
    furniture = (
        f"(kind in ({', '.join(repr(k) for k in EXTRA_FURNITURE_KINDS)}) and source = 'extra'"
        " and glb_url is not null and coalesce(tags->'extra'->>'placement', '') in ('floor', 'wall', 'surface')"
        f" and {mount_ok})"
    )
    return f"({abo} or {extra} or {furniture})"


PLACEABLE = build_placeable_sql()


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
    like_image: str | None = None                          # allowlisted image URL for visual similarity
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
    placement: str | None = None                           # tags.extra.placement: ceiling | floor | surface | wall | window


_FAMILY_COLORS = set(PALETTE) | set(
    "navy charcoal ivory cream walnut espresso oak grey gray black white blue green "
    "beige brown red pink yellow orange purple gold silver brass natural light dark".split()
)
_SIZE = re.compile(r'\b\d+(?:\.\d+)?\s*(?:["″”][wdh]?|(?:cm|mm|inches|inch|in)\b)', re.I)


@functools.lru_cache(maxsize=65536)
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


def size_limits(max_w=None, max_d=None, max_h=None, allow_rotate=True):
    """Per-axis limits to (fit_box, rotate). Turning an item only helps fit a real w x d box: with one
    horizontal bound the other is open, so any item passes turned and max_w/max_d alone would filter nothing."""
    if all(v is None for v in (max_w, max_d, max_h)):
        return None, allow_rotate
    box = [99.0 if v is None else v for v in (max_w, max_d, max_h)]
    return box, allow_rotate and max_w is not None and max_d is not None


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

_NAME_STOPWORDS = set("a an and are as at be by for from in is it of on or the to with".split())
# Generic descriptors alone are not evidence of a product-name lookup. They still
# count for exact, phrase and all-token matches; only partial overlap ignores them.
_NAME_GENERIC = (_FAMILY_COLORS | set(PLACEABLE_KINDS) | set(NATIVE_EXTRA_KINDS)
                 | set("painting print framed frame furniture velvet leather fabric wood wooden metal plastic cotton linen modern small large".split()))


@functools.lru_cache(maxsize=65536)
def _name_words(text):
    folded = unicodedata.normalize("NFKD", (text or "").casefold())
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return tuple(re.findall(r"[^\W_]+", folded))


def _name_match(query_words, name):
    """Return a priority tier and a small, distinctive partial-name bonus."""
    words = _name_words(name)
    tokens = set(query_words) - _NAME_STOPWORDS
    if not tokens:
        return 0, 0.0
    if query_words == words:
        return 3, 0.0
    if f" {' '.join(query_words)} " in f" {' '.join(words)} ":
        return 2, 0.0
    overlap = tokens & set(words)
    if overlap == tokens:
        return 1, 0.0
    distinctive = tokens - _NAME_GENERIC
    return 0, 0.1 * len(overlap & distinctive) / max(1, len(distinctive))


def _text_vec(conn, text, model):
    """Embed the query text with the same SigLIP model; parallel room designers repeat queries, so cache them."""
    return _cached_text_vec(" ".join(text.lower().split()), model)


@functools.lru_cache(maxsize=4096)
def _cached_text_vec(text, model):
    import embed_siglip_query  # lazy: torch is heavy
    vec = embed_siglip_query.text(text, model)
    vec.setflags(write=False)
    return vec


def _openai_vec(text):
    """Query embedding with the model the 'doc' rows were built with, through OpenRouter."""
    import embed_openrouter
    return np.array(embed_openrouter.embed([text], f"openai/{OPENAI_TEXT}")[0])


KIND_TTL_S = 60
_KINDS = {}


def kind_counts(conn):
    """Shared vocabulary for validation and MCP list_vocab; recounted at most once a minute (it ran on every search)."""
    now = time.monotonic()
    hit = _KINDS.get("v")
    if hit and now - hit[0] < KIND_TTL_S:
        return dict(hit[1])
    counts = dict(conn.execute("select kind, count(*) from item group by 1 order by 2 desc").fetchall())
    _KINDS["v"] = (now, counts)
    return dict(counts)


def validate_query(q):
    if not 1 <= q.limit <= 20:
        raise ValueError("limit must be between 1 and 20")
    if q.offset < 0:
        raise ValueError("offset must be >= 0")
    if q.placement is not None and q.placement not in PLACEMENTS:
        raise ValueError(f"placement must be one of: {', '.join(PLACEMENTS)}")
    if q.scope not in ("placeable", "editor", "all"):
        raise ValueError("scope must be one of: placeable, editor, all")
    for field in ("target_size", "fit_box"):
        value = getattr(q, field)
        if value is not None and len(value) != 3:
            raise ValueError(f"{field} must contain exactly 3 dimensions [w, d, h]")


def search(conn, q: Query):
    validate_query(q)
    if q.kind is not None:
        valid = kind_counts(conn)
        if q.kind not in valid:
            raise ValueError(f"Unknown kind {q.kind!r}. Valid kinds: {', '.join(sorted(valid))}")
    ref = None
    if q.like_item:
        if not conn.execute("select id from item where id=%s", (q.like_item,)).fetchone():
            raise ValueError(f"no item {q.like_item}")
        row = conn.execute("select emb::text from item_embedding where item_id=%s and model=%s and modality='image'", (q.like_item, q.model)).fetchone()
        if not row:
            raise ValueError(f"no image embedding for item {q.like_item}")
        ref = np.array(json.loads(row[0]))
    elif q.like_image:
        import embed_siglip_query
        ref = embed_siglip_query.image(q.like_image, q.model)
    w = {**DEFAULT_WEIGHTS, **q.weights}
    where, args = ["true"], []
    if q.kind:
        where.append("kind = any(%s)"); args.append(kinds_for(q.kind))
    if q.placement:
        where.append("lower(coalesce(tags->'extra'->>'placement', '')) = %s"); args.append(q.placement)
    excluded = excluded_ids(q)
    if excluded:
        where.append("not (id = any(%s))"); args.append(excluded)
    if q.scope in ("placeable", "editor"):
        where.append(PLACEABLE)
    fts_text = q.text if q.text and "fts" in modes(q.text_mode, TEXT_ALIASES) else None
    passed, misses = [], []
    placeable = q.scope in ("placeable", "editor")
    for static, cimg, size, price in _candidate_rows(conn, where, args, fts_text):
        if placeable and not editor_size_ok(size):
            continue  # the SQL bounds ABO sizes only; a 6 mm extra rug would come back and then fail to place
        rec = dict(static)
        fail = []
        margins = fits(size, q.fit_box, q.allow_rotate) if q.fit_box else None
        if margins and min(margins) < 0:
            fail.append({"fit": [round(m, 3) for m in margins]})
        if q.price_max is not None and (price is None or price > q.price_max):
            fail.append({"price_over": (price or 0) - q.price_max})
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
    if q.text:
        # All eligible rows are already candidates (no SQL/vector top-k). Apply
        # before paging AND variant collapse so the matching variant represents
        # its family. A tier exceeds the entire base-score span, even with custom
        # weights; semantic scores still order equally strong name matches.
        query_words = _name_words(q.text)
        matches = [_name_match(query_words, rec["name"]) for rec, _ in passed]
        tier_span = float(np.ptp(total)) + 1.0
        scores["name"] = np.array([tier * tier_span + partial for tier, partial in matches])
        total = total + scores["name"]
        used.add("name")
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


# Candidate rows per filter set, parsed once: the SQL and JSON decoding cost ~70 us per candidate (a kind-less search
# decoded ~16k JSON fields, ~0.5 s) and serialised parallel room designers. Text only changes scoring, so rows are shared
# across query texts; the full-text rank depends on the text and stays uncached. Dropped when the catalog changes.
ROWS_TTL_S = 10
_ROWS = {}
_ROWS_LOCK = threading.Lock()
_ROWS_VER = {"t": float("-inf"), "v": None}
_ROW_SQL = """select id, name, kind, coalesce(fit_size_m, size_m), size_status, price, color_std, colors_img, styles,
                     materials, main_image_url, preview_url, glb_url, size_evidence, tags, {rank}, currency, source,
                     price_source from item where {where}"""


def _catalog_version(conn):
    now = time.monotonic()
    if now - _ROWS_VER["t"] > ROWS_TTL_S:
        _ROWS_VER["v"] = tuple(conn.execute("select count(*), max(ingested_at) from item").fetchone())
        _ROWS_VER["t"] = now
    return _ROWS_VER["v"]


def _static_rec(r):
    (iid, name, kind, size, status, price, cstd, cimg, styles, mats, img, preview, glb, ev, tags, fts,
     currency, source, price_source) = r
    astra = {k: _words(v) for k, v in ((tags or {}).get("astra") or {}).items() if k in ("main_color", "other_colors", "materials", "style")}
    rec = {"id": iid, "name": name, "kind": kind, "size_m": size, "size_status": status, "price": price,
           "currency": currency, "source": source, "price_source": price_source, "size_evidence": ev,
           "colors_listing": listing_palette(cstd), "colors_image": [c["name"] for c in cimg or []],
           "styles": styles, "materials": mats, "image": img, "preview": preview, "glb_url": glb,
           "colors_astra": (astra.get("main_color") or []) + (astra.get("other_colors") or []),
           "style_astra": astra.get("style") or [], "materials_astra": astra.get("materials") or [],
           "wd_swapped": bool((ev or {}).get("wd_swapped")), "_fts": float(fts), "_astra": astra,
           "placement": ((tags or {}).get("extra") or {}).get("placement")}
    return rec, cimg, size, price


def _freeze(value):
    return tuple(_freeze(v) for v in value) if isinstance(value, (list, tuple)) else value


def _candidate_rows(conn, where, args, fts_text=None):
    """[(static record, image colours, fit size, price)] for the filters; cached unless ranked by full-text."""
    where_sql = " and ".join(where)
    if fts_text:
        sql = _ROW_SQL.format(rank="ts_rank_cd(fts, plainto_tsquery('english', %s), 32)", where=where_sql)
        return [_static_rec(r) for r in conn.execute(sql, [fts_text, *args]).fetchall()]
    if not isinstance(conn, psycopg.Connection):  # test doubles and other callers: plain query, no shared cache
        return [_static_rec(r) for r in conn.execute(_ROW_SQL.format(rank="0", where=where_sql), args).fetchall()]
    key, version = (where_sql, _freeze(args)), _catalog_version(conn)
    hit = _ROWS.get(key)
    if hit and hit[0] == version:
        return hit[1]
    with _ROWS_LOCK:
        hit = _ROWS.get(key)
        if hit and hit[0] == version:
            return hit[1]
        rows = [_static_rec(r) for r in conn.execute(_ROW_SQL.format(rank="0", where=where_sql), args).fetchall()]
        if len(_ROWS) > 256:
            _ROWS.clear()
        _ROWS[key] = (version, rows)
        return rows


# Embeddings held in memory per (model, modality): parsing ~8k vectors from text on every query cost ~0.5 s of
# CPU and serialised concurrent searches (6-8 s each under 12 parallel calls). Reloaded when the row count changes.
_EMB = {}
_EMB_LOCK = threading.Lock()


def _emb_matrix(conn, model, modality):
    count = conn.execute("select count(*) from item_embedding where model=%s and modality=%s", (model, modality)).fetchone()[0]
    cached = _EMB.get((model, modality))
    if cached and cached[0] == count:
        return cached[1], cached[2]
    with _EMB_LOCK:
        cached = _EMB.get((model, modality))
        if cached and cached[0] == count:
            return cached[1], cached[2]
        rows = conn.execute("select item_id, emb::text from item_embedding where model=%s and modality=%s", (model, modality)).fetchall()
        index = {iid: n for n, (iid, _) in enumerate(rows)}
        matrix = np.array([np.array(e[1:-1].split(","), dtype=np.float32) for _, e in rows]) if rows else np.zeros((0, 1), np.float32)
        _EMB[(model, modality)] = (count, index, matrix)
        return index, matrix


def _sims(conn, ids, model, modality, qv):
    index, matrix = _emb_matrix(conn, model, modality)
    if not len(index):
        return np.full(len(ids), -1.0)
    scores = matrix @ np.asarray(qv, dtype=np.float32)
    return np.array([float(scores[index[i]]) if i in index else -1.0 for i in ids])


def _minmax(x):
    lo, hi = x.min(), x.max()
    return (x - lo) / (hi - lo) if hi > lo else np.zeros_like(x)


def _public(rec):
    return {k: v for k, v in rec.items() if not k.startswith("_")}


if __name__ == "__main__":
    import sys
    with psycopg.connect(os.environ["VARPET_DB_URL"]) as c:
        print(json.dumps(search(c, Query(**json.loads(sys.argv[1]))), indent=1, ensure_ascii=False)[:4000])
