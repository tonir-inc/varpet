"""Furniture catalog MCP server (stdio). Read-only.

Run: uv run mcp_server.py (stdio), or with CATALOG_HTTP_HOST set for HTTP at /mcp. Needs VARPET_DB_URL.
Sizes are metres [w, d, h]; prices whole dram. Hard constraints (kind, fit, price) are filters;
colour, style, text and visual likeness only rank what passed.
"""
import os
import re
from functools import wraps
from pathlib import Path
from time import monotonic, perf_counter

from starlette.concurrency import run_in_threadpool

import psycopg
from mcp.server.mcpserver import MCPServer

from colors import PALETTE
from search import Query, fits, search
from select_editor_set import EDITOR_KIND_OF

server = MCPServer(
    "varpet-catalog",
    instructions=(
        "Furniture catalog for placing real, sized pieces in a flat. Call list_vocab first for valid kinds "
        "and colours. Sizes are metres [w, d, h]. Results carry `why` (score parts) and fit margins; an "
        "empty result carries nearest_misses with the failing constraint. `wd_swapped` means the mesh "
        "faces sideways: rotate it 90 degrees when placing."
    ),
)


def _conn():
    return psycopg.connect(os.environ["VARPET_DB_URL"], connect_timeout=5,
                           options="-c statement_timeout=15000")


def _threaded(fn):
    """Run blocking custom route bodies off the event loop.

    MCP 2.x already delegates synchronous tools in FuncMetadata.call_fn to AnyIO.
    """
    @wraps(fn)
    async def route(*args, **kwargs):
        return await run_in_threadpool(fn, *args, **kwargs)
    return route


@server.tool()
def list_vocab() -> dict:
    """Valid kinds (with counts), palette colours, and the most common styles and materials."""
    with _conn() as c:
        kinds = dict(c.execute("select kind, count(*) from item group by 1 order by 2 desc").fetchall())
        styles = [r[0] for r in c.execute("select s, count(*) from item, unnest(styles) s group by 1 order by 2 desc limit 40")]
        mats = [r[0] for r in c.execute("select m, count(*) from item, unnest(materials) m group by 1 order by 2 desc limit 40")]
    return {"kinds": kinds, "colors": PALETTE, "styles": styles, "materials": mats}


@server.tool()
def search_furniture(
    kind: str | None = None,
    text: str | None = None,
    colors: list[str] | None = None,
    styles: list[str] | None = None,
    materials: list[str] | None = None,
    max_w: float | None = None,
    max_d: float | None = None,
    max_h: float | None = None,
    allow_rotate: bool = True,
    target_size: list[float] | None = None,
    price_max: int | None = None,
    exclude_ids: list[str] | None = None,
    limit: int = 10,
    offset: int = 0,
    scope: str = "placeable",
    room_items: list[str] | None = None,
) -> dict:
    """Find furniture. kind/max size/price are hard filters; colors (palette names), styles, materials
    and free text rank the rest. Returns up to `limit` (max 20) items from `offset`, `candidates` (how many
    passed) and `next_offset` for the next page (null at the end), or nearest_misses when none pass.
    `preview` is a render of the exact 3D model (null when missing); `image` is the shop photo.
    scope 'placeable' (default; 'editor' is the old name) searches every item the editor can place;
    'all' searches the whole catalog.
    room_items: ids already in the flat, to prefer pieces that go with them (style and look)
    """
    box = None
    if any(v is not None for v in (max_w, max_d, max_h)):
        box = [max_w or 99.0, max_d or 99.0, max_h or 99.0]
    q = Query(kind=kind, text=text, colors=colors or [], styles=styles or [], materials=materials or [],
              fit_box=box, allow_rotate=allow_rotate, target_size=target_size, price_max=price_max,
              exclude_ids=exclude_ids or [], limit=min(limit, 20), offset=max(offset, 0), scope=scope,
              room_items=room_items or [])
    with _conn() as c:
        return search(c, q)


@server.tool()
def find_similar(
    item_id: str | None = None,
    image: str | None = None,
    same_kind: bool = True,
    kind: str | None = None,
    size_tolerance_m: float | None = None,
    cheaper_than_item: bool = False,
    price_max: int | None = None,
    limit: int = 10,
    offset: int = 0,
    scope: str = "placeable",
) -> dict:
    """Items that look like a catalog item (item_id) or a photo (image: URL or path). Optional: keep the
    same kind, stay within size_tolerance_m of the item's size, or only cheaper than the item."""
    with _conn() as c:
        ref = c.execute("select kind, size_m, price from item where id=%s", (item_id,)).fetchone() if item_id else None
        box = None
        if ref and size_tolerance_m is not None:
            box = [s + size_tolerance_m for s in ref[1]]
        if ref and cheaper_than_item:
            price_max = min(price_max or ref[2], ref[2] - 1)
        q = Query(kind=kind or (ref[0] if ref and same_kind else None), like_item=item_id, like_image=image,
                  fit_box=box, price_max=price_max, exclude_ids=[item_id] if item_id else [], limit=min(limit, 20),
                  offset=max(offset, 0), scope=scope)
        return search(c, q)


@server.tool()
def get_item(item_id: str) -> dict:
    """Scene-ready record: kind, name, size_m [w, d, h] with status and evidence, price, 3D model URL, images, tags."""
    with _conn() as c:
        cur = c.execute(
            """select id, source, source_id, kind, name, brand, size_m, fit_size_m, size_status, size_evidence, price, currency,
                      price_source, color_std, colors_img, materials, styles, glb_url, main_image_url, preview_url, image_urls, license
               from item where id=%s""", (item_id,))
        row = cur.fetchone()
        if not row:
            return {"error": f"no item {item_id}"}
        rec = dict(zip([d.name for d in cur.description], row))
    rec["wd_swapped"] = bool((rec["size_evidence"] or {}).get("wd_swapped"))
    return rec


@server.tool()
def check_fit(item_id: str, max_w: float, max_d: float, max_h: float, allow_rotate: bool = True) -> dict:
    """Does the item fit a free box? Returns pass and per-axis margins in metres (negative = too big)."""
    with _conn() as c:
        row = c.execute("select coalesce(fit_size_m, size_m) from item where id=%s", (item_id,)).fetchone()
    if not row:
        return {"error": f"no item {item_id}"}
    m = fits(row[0], [max_w, max_d, max_h], allow_rotate)
    return {"fits": min(m) >= 0, "margin_m": {"w": round(m[0], 3), "d": round(m[1], 3), "h": round(m[2], 3)}, "size_m": row[0]}


# Any local dev server: each editor or Codex session picks its own port.
EDITOR_ORIGIN = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d{1,5})?$")
CATEGORY = {"sofa": "Living", "chair": "Living", "table": "Living", "bed": "Bedroom", "cabinet": "Storage",
            "shelf": "Storage", "lamp": "Lighting", "rug": "Textiles", "desk": "Office",
            "dresser": "Bedroom", "wardrobe": "Bedroom", "nightstand": "Bedroom",
            "stool": "Living", "ottoman": "Living", "bench": "Living"}


def editor_kind(kind: str) -> str:
    """Map catalog subtypes only at the editor boundary; search keeps the real kind."""
    return EDITOR_KIND_OF.get(kind, kind)


def _cors(request, response):
    origin = request.headers.get("origin")
    if origin and EDITOR_ORIGIN.match(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    return response


def editor_assets(models: str = "original"):
    """The editor's CatalogAsset[] (apps/editor/src/contracts.ts) for every item in the editor set.
    dimensions are [w, h, d]: the same size_m the designer gets from search, reindexed, so the editor
    bridge's exact size check passes."""
    with _conn() as c:
        rows = c.execute("""select id, name, kind, size_m, colors_img, price,
                                   case when %s = 'web' then coalesce(glb_web_url, glb_url) else glb_url end
                            from item where editor_set order by kind, id""", (models,)).fetchall()
    out = []
    for iid, name, kind, s, cimg, price, glb in rows:
        colour = (cimg or [{}])[0].get("hex") or "#9a9a9a"
        out.append({"id": iid, "name": (name or iid)[:80], "category": CATEGORY.get(kind, "Other"), "kind": editor_kind(kind),
                    "dimensions": [s[0], s[2], s[1]], "color": colour, "price": price,
                    "source": {"type": "gltf", "url": glb}})
    return out


try:
    from starlette.requests import Request
    from starlette.responses import JSONResponse, Response

    @server.custom_route("/health", methods=["GET"])
    @_threaded
    def health_route(request: Request) -> Response:
        try:
            with _conn() as c:
                started = perf_counter()
                items, editor_set = c.execute(
                    "select count(*), count(*) filter (where editor_set) from item"
                ).fetchone()
                db_ms = (perf_counter() - started) * 1000
        except Exception as exc:
            return _cors(request, JSONResponse(
                {"ok": False, "error": type(exc).__name__}, status_code=503,
                headers={"Cache-Control": "no-store"}))
        models = Path(MODELS_DIR)
        return _cors(request, JSONResponse(
            {"ok": True, "db_ms": db_ms, "items": items, "editor_set": editor_set,
             "models_web": sum(p.is_file() for p in models.glob("*")),
             "previews": sum(p.is_file() for p in (models / "previews").glob("*"))},
            headers={"Cache-Control": "no-store"}))

    @server.custom_route("/editor/assets", methods=["GET", "OPTIONS"])
    @_threaded
    def editor_assets_route(request: Request) -> Response:
        if request.method == "OPTIONS":
            r = Response(status_code=204)
            r.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
            r.headers["Access-Control-Allow-Headers"] = "Content-Type"
            return _cors(request, r)
        return _cors(request, JSONResponse(editor_assets(request.query_params.get("models", "original")),
                                           headers={"Cache-Control": "max-age=300"}))
except ImportError:  # stdio-only installs
    pass


MODELS_DIR = os.environ.get("CATALOG_MODELS_DIR", "/opt/varpet-catalog/models-web")
try:
    from starlette.responses import FileResponse

    @server.custom_route("/models/{name}", methods=["GET", "HEAD"])
    @_threaded
    def model_file(request: Request) -> Response:
        """Optimized GLBs (optimize_models.py). Immutable per id, so browsers cache them for a year."""
        name = request.path_params["name"]
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}\.glb", name) or not os.path.isfile(os.path.join(MODELS_DIR, name)):
            return _cors(request, Response(status_code=404))
        return _cors(request, FileResponse(os.path.join(MODELS_DIR, name), media_type="model/gltf-binary",
                                           headers={"Cache-Control": "public, max-age=31536000, immutable"}))
    @server.custom_route("/previews/{name}", methods=["GET", "HEAD"])
    @_threaded
    def preview_file(request: Request) -> Response:
        """Rendered previews of the same GLB the editor places (render_previews.py)."""
        name = request.path_params["name"]
        path = os.path.join(MODELS_DIR, "previews", name)
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}\.webp", name) or not os.path.isfile(path):
            return _cors(request, Response(status_code=404))
        return _cors(request, FileResponse(path, media_type="image/webp",
                                           headers={"Cache-Control": "public, max-age=31536000, immutable"}))
except ImportError:
    pass


def _preview_image(item_id, preview_url, photo_url, deadline):
    """Local rendered preview when the service has it, else the shop photo over HTTP."""
    import io
    import urllib.request
    from PIL import Image as PILImage
    asin = item_id.split(":", 1)[1]
    local = os.path.join(MODELS_DIR, "previews", f"{asin}.webp")
    if os.path.isfile(local):
        return PILImage.open(local).convert("RGB")
    for url in (preview_url, photo_url):
        remaining = deadline - monotonic()
        if remaining <= 0:
            break
        if url:
            try:
                with urllib.request.urlopen(url, timeout=min(5, remaining)) as response:
                    data = response.read()
                if monotonic() >= deadline:
                    break
                return PILImage.open(io.BytesIO(data)).convert("RGB")
            except Exception:
                continue
    return None


@server.tool()
def show_candidates(item_ids: list[str], columns: int = 4) -> list:
    """Look at candidates before choosing: one image with a numbered tile per item (a render of the exact 3D
    model that will be placed; the shop photo if no render exists), plus a legend: number, id, name, size, price.
    Use it to judge style and look against the request and the room (for example, not Scandinavian enough);
    pass at most 16 ids. The image is for your judgement only; it is not shown to the customer."""
    from PIL import Image as PILImage, ImageDraw
    from mcp.server.mcpserver import Image
    ids = list(dict.fromkeys(item_ids))[:16]
    with _conn() as c:
        rows = {r[0]: r for r in c.execute(
            "select id, name, kind, size_m, price, preview_url, main_image_url from item where id = any(%s)", (ids,))}
    ids = [i for i in ids if i in rows]
    if not ids:
        return ["No known item ids."]
    tile, cols = 256, max(1, min(columns, len(ids)))
    sheet = PILImage.new("RGB", (cols * tile, ((len(ids) + cols - 1) // cols) * tile), "white")
    draw = ImageDraw.Draw(sheet)
    legend = []
    deadline = monotonic() + 8
    for n, iid in enumerate(ids, 1):
        _, name, kind, size, price, preview, photo = rows[iid]
        img = _preview_image(iid, preview, photo, deadline) if monotonic() < deadline else None
        x, y = ((n - 1) % cols) * tile, ((n - 1) // cols) * tile
        if img is not None:
            img.thumbnail((tile - 8, tile - 8))
            sheet.paste(img, (x + (tile - img.width) // 2, y + (tile - img.height) // 2))
        draw.rectangle([x + 4, y + 4, x + 34, y + 30], fill="black")
        draw.text((x + 10, y + 9), str(n), fill="white")
        w, d, h = size
        legend.append(f"{n}. {iid} | {kind} | {(name or '')[:60]} | {w:.2f} x {d:.2f} x {h:.2f} m | {price} AMD")
    buf = __import__("io").BytesIO()
    sheet.save(buf, "JPEG", quality=80)
    return ["\n".join(legend), Image(data=buf.getvalue(), format="jpeg")]


def request_generation(kind: str, w: float, d: float, h: float, description: str,
                       reference_image_url: str | None = None) -> dict:
    """Queue a piece nobody sells in this size: it is built to exactly [w, d, h] metres from the description
    (colour, material, style, shape in plain words; optional reference photo URL). Use only after
    search_furniture found nothing that fits. Returns a request id; poll get_generation (takes minutes)."""
    if min(w, d, h) <= 0 or max(w, d, h) > 4:
        return {"error": "sizes must be between 0 and 4 m"}
    with _conn() as c:
        rid = c.execute(
            "insert into generation_request (kind, size_m, description, reference_image_url) values (%s,%s,%s,%s) returning id",
            (kind, [w, d, h], description[:1000], reference_image_url)).fetchone()[0]
    return {"request_id": rid, "status": "pending"}


def get_generation(request_id: int) -> dict:
    """Status of a queued piece: pending, building, done (with the new item, placeable like any other) or failed."""
    with _conn() as c:
        cur = c.execute("select id, kind, size_m, status, item_id, error, created_at, updated_at from generation_request where id=%s", (request_id,))
        row = cur.fetchone()
    if not row:
        return {"error": f"no request {request_id}"}
    rec = dict(zip([d.name for d in cur.description], row))
    rec["created_at"], rec["updated_at"] = str(rec["created_at"]), str(rec["updated_at"])
    if rec["item_id"]:
        rec["item"] = get_item(rec["item_id"])
    return rec


if os.environ.get("CATALOG_ENABLE_GENERATION") == "1":
    server.tool()(request_generation)
    server.tool()(get_generation)


if __name__ == "__main__":
    # Default stdio. For the shared service: CATALOG_HTTP_HOST=<tailscale ip> [CATALOG_HTTP_PORT=8765]
    host = os.environ.get("CATALOG_HTTP_HOST")
    if host:
        server.run("streamable-http", host=host, port=int(os.environ.get("CATALOG_HTTP_PORT", "8765")), stateless_http=True)
    else:
        server.run()
