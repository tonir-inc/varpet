"""Furniture catalog MCP server (stdio). Read-only.

Run: uv run mcp_server.py (stdio), or with CATALOG_HTTP_HOST set for HTTP at /mcp. Needs VARPET_DB_URL.
Sizes are metres [w, d, h]; prices whole dram. Hard constraints (kind, fit, price) are filters;
colour, style, text and visual likeness only rank what passed.
"""
import os
import re

import psycopg
from mcp.server.mcpserver import MCPServer

from colors import PALETTE
from search import Query, fits, search

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
    return psycopg.connect(os.environ["VARPET_DB_URL"])


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
    scope: str = "editor",
) -> dict:
    """Find furniture. kind/max size/price are hard filters; colors (palette names), styles, materials
    and free text rank the rest. Returns up to `limit` (max 20) items, or nearest_misses when none pass.
    scope 'editor' (default) searches only the items the editor has loaded, so any result can be placed;
    'all' searches the whole catalog."""
    box = None
    if any(v is not None for v in (max_w, max_d, max_h)):
        box = [max_w or 99.0, max_d or 99.0, max_h or 99.0]
    q = Query(kind=kind, text=text, colors=colors or [], styles=styles or [], materials=materials or [],
              fit_box=box, allow_rotate=allow_rotate, target_size=target_size, price_max=price_max,
              exclude_ids=exclude_ids or [], limit=min(limit, 20), scope=scope)
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
    scope: str = "editor",
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
                  scope=scope)
        return search(c, q)


@server.tool()
def get_item(item_id: str) -> dict:
    """Scene-ready record: kind, name, size_m [w, d, h] with status and evidence, price, 3D model URL, images, tags."""
    with _conn() as c:
        cur = c.execute(
            """select id, source, source_id, kind, name, brand, size_m, fit_size_m, size_status, size_evidence, price, currency,
                      price_source, color_std, colors_img, materials, styles, glb_url, main_image_url, image_urls, license
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
            "shelf": "Storage", "lamp": "Lighting", "rug": "Textiles"}


def _cors(request, response):
    origin = request.headers.get("origin")
    if origin and EDITOR_ORIGIN.match(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    return response


def editor_assets():
    """The editor's CatalogAsset[] (apps/editor/src/contracts.ts) for every item in the editor set.
    dimensions are [w, h, d]: the same size_m the designer gets from search, reindexed, so the editor
    bridge's exact size check passes."""
    with _conn() as c:
        rows = c.execute("""select id, name, kind, size_m, colors_img, price, glb_url from item
                            where editor_set order by kind, id""").fetchall()
    out = []
    for iid, name, kind, s, cimg, price, glb in rows:
        colour = (cimg or [{}])[0].get("hex") or "#9a9a9a"
        out.append({"id": iid, "name": (name or iid)[:80], "category": CATEGORY.get(kind, "Other"), "kind": kind,
                    "dimensions": [s[0], s[2], s[1]], "color": colour, "price": price,
                    "source": {"type": "gltf", "url": glb}})
    return out


try:
    from starlette.requests import Request
    from starlette.responses import JSONResponse, Response

    @server.custom_route("/editor/assets", methods=["GET", "OPTIONS"])
    async def editor_assets_route(request: Request) -> Response:
        if request.method == "OPTIONS":
            r = Response(status_code=204)
            r.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
            r.headers["Access-Control-Allow-Headers"] = "Content-Type"
            return _cors(request, r)
        return _cors(request, JSONResponse(editor_assets(), headers={"Cache-Control": "max-age=300"}))
except ImportError:  # stdio-only installs
    pass


MODELS_DIR = os.environ.get("CATALOG_MODELS_DIR", "/opt/varpet-catalog/models-web")
try:
    from starlette.responses import FileResponse

    @server.custom_route("/models/{name}", methods=["GET", "HEAD"])
    async def model_file(request: Request) -> Response:
        """Optimized GLBs (optimize_models.py). Immutable per id, so browsers cache them for a year."""
        name = request.path_params["name"]
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}\.glb", name) or not os.path.isfile(os.path.join(MODELS_DIR, name)):
            return _cors(request, Response(status_code=404))
        return _cors(request, FileResponse(os.path.join(MODELS_DIR, name), media_type="model/gltf-binary",
                                           headers={"Cache-Control": "public, max-age=31536000, immutable"}))
except ImportError:
    pass


@server.tool()
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


@server.tool()
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


if __name__ == "__main__":
    # Default stdio. For the shared service: CATALOG_HTTP_HOST=<tailscale ip> [CATALOG_HTTP_PORT=8765]
    host = os.environ.get("CATALOG_HTTP_HOST")
    if host:
        server.run("streamable-http", host=host, port=int(os.environ.get("CATALOG_HTTP_PORT", "8765")), stateless_http=True)
    else:
        server.run()
