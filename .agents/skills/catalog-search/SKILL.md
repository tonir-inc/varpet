---
name: catalog-search
description: Find, compare and fit furniture through the catalog MCP server when choosing pieces for a flat or integrating catalog search into code.
---

# Search the furniture catalog

Use this for catalog furniture, visual alternatives and size checks before choosing a piece.
Use returned product IDs and records; never invent a product, price, dimension or model URL.

## Connect

- Streamable HTTP MCP: `http://100.107.246.46:8765/mcp`.
- Run Tailscale with `mc-server` shared to you (ask Felix).
- Or use SSH access to the VM (send Sergey your public key):
  `ssh -fN -L 18765:100.107.246.46:8765 <vm>`; connect to `http://localhost:18765/mcp`.
- Register the reachable URL with your MCP client. For Codex:
  `codex mcp add varpet-catalog --url http://100.107.246.46:8765/mcp`.
  For Claude Code: `claude mcp add --transport http varpet-catalog http://100.107.246.46:8765/mcp`.
  Substitute the localhost URL when tunnelling. No laptop DB access or password is needed.

## Tools

Call `list_vocab()` first: valid kinds with counts, palette colours, common styles and materials.
Keep native catalog kinds such as `desk`; editor kind mapping happens at the integration boundary.

- `search_furniture`: optional `kind`, `text`, `colors`, `styles`, `materials`, `max_w`, `max_d`,
  `max_h`, `allow_rotate=true`, `target_size`, `price_max`, `exclude_ids`, `limit=10`, `scope="editor"`.
  Colours, styles, materials and excluded IDs are lists; `target_size` is `[w, d, h]`.
  Returns `results`; `limit` is capped at 20. Pass `room_items` (ids already in the flat) to rank
  pieces that go with them in look and style higher; they are excluded from the results.
- `find_similar`: supply `item_id` or `image` (URL or path accessible to the server).
  Optional `same_kind=true`, `kind`, `size_tolerance_m`, `cheaper_than_item=false`, `price_max`,
  `limit=10` (max 20), `scope="editor"`. Explicit `kind` overrides the reference kind.
  With a reference item, tolerance sets upper size bounds to its size plus tolerance; it is not
  a symmetric size band. Cheaper means strictly below its price. The reference ID is excluded.
- `get_item(item_id)`: full record with size evidence, price, tags, images, `glb_url` and license.
  Read before placement; preserve model attribution (ABO is CC BY 4.0).
- `check_fit(item_id, max_w, max_d, max_h, allow_rotate=true)`: all three bounds required;
  returns `fits`, `margin_m` keyed by `w/d/h`, and the size used. Negative margins mean too big.
- `show_candidates(item_ids, columns=4)`: up to 16 IDs, one numbered image grid plus a legend.
  The grid is for the agent's judgement, not shown to the customer.

## Constraints and units

- Metres, catalog arrays `[w, d, h]`; prices are whole Armenian dram (AMD), currently mock prices.
  At the editor boundary, dimensions use `[w, h, d]`: reorder explicitly.
- Hard filters: exact `kind`, `max_w/max_d/max_h`, `price_max`. Excluded IDs and scope also restrict
  the pool. Set the actual free box; omitted size bounds are effectively unconstrained (99 m).
- Rotation is allowed by default: width and depth may swap, height stays fixed. Set
  `allow_rotate=false` when the piece must face a particular way or its native width is bounded.
- Soft ranking: `colors`, `styles`, `materials`, `text`, visual likeness and `target_size`.
  These preferences do not exclude mismatches. A high score does not guarantee a blue sofa.
- `scope="editor"` is the MCP default: the editor set. Use `scope="all"` for broader exploration;
  do not assume an all-scope result is already available in the editor.
- Colour variants collapse into one best-scoring representative. Its `variants` contains up to
  eight alternatives with `id`, `colors_astra`, `price`, `size_m`, already through the filters.
  Fetch and inspect a variant by its own ID before choosing it; there is no MCP collapse toggle.

## Read, look, then choose

1. Read `why`, the component scores behind the rank (`colour`, `tags`, `text`, `visual`, `size`
   when used). They explain ranking, not certainty. `candidates` counts passes before collapsing.
2. Read `fit_margin_m` as remaining `[w, d, h]` space in the best allowed orientation.
   `fits_turned=true` means only a 90-degree turn fits; account for that in placement.
   Both fields appear when a fit box was supplied.
3. Distinguish `wd_swapped`: the source mesh faces sideways and needs a 90-degree orientation
   correction. It is separate from turning a piece to fit the room.
4. Read `size_status`: `confirmed`, `estimated` or `conflict`. Fit uses `fit_size_m` when present,
   the larger size on conflict; search `size_m` is this conservative fit size. Inspect
   `get_item` for the original size and evidence; an estimated fit is not a measured guarantee.
5. Call `show_candidates` on the top 8–12 IDs (all if fewer) before choosing. Judge colour,
   shape, style and broken models against the request and existing room furniture.
   `preview` is a render of the exact 3D model, possibly null; `image` is the shop photo.
   The grid prefers the render and falls back to the photo. Say when none looks suitable.
6. Fetch the chosen record and run `check_fit` against the final free box before placement.

## Nothing fits

An empty `results` may include up to three `nearest_misses`. Read each `failed` entry:
`fit` is a margin array `[w, d, h]` (negative = excess); `price_over` is excess dram.
Name the returned product and say which bound it misses by how much. Check for a missing price
before interpreting `price_over`. Suggest relaxing one specific constraint and rerun only with
an acceptable revised brief. Changing soft preferences cannot fix a hard-filter failure.
If there are no misses either, report no candidates in this kind/scope; do not fabricate one.

## Three examples

These calls follow `list_vocab`; numeric outcomes below illustrate interpretation, not live stock.

- **Blue sofa under 2.2 m:** `search_furniture(kind="sofa", colors=["blue"], max_w=2.2,
  allow_rotate=false, limit=12)`. This enforces native width at most 2.2 m. Inspect the top 12
  with `show_candidates`; pick a visibly blue match, then fetch its record and check the room box.
- **Desk for a 1.2 m alcove, only turned:** suppose the free box is `[1.2, 1.5, 1.0]`.
  Call `search_furniture(kind="desk", max_w=1.2, max_d=1.5, max_h=1.0, allow_rotate=true)`.
  If a returned desk measures `[1.4, 0.6, 0.75]`, `fits_turned=true` and margins are
  `[0.6, 0.1, 0.25]`. Inspect it, confirm with `check_fit`, and place turned 90 degrees.
- **Nothing fits:** `search_furniture(kind="sofa", max_w=1.5, max_d=0.9, max_h=1.0,
  allow_rotate=false)`. If empty and a returned miss has `failed=[{"fit":[-0.12,0.05,0.1]}]`,
  report that product is 0.12 m too wide. Suggest a width allowance of 1.62 m if the room permits;
  keep the other constraints. Do not present the miss as fitting or invent a smaller sofa.

Filter for fit and budget, rank for preferences, then look at the actual model before choosing.
Use real returned IDs; explain misses numerically and relax only an acceptable constraint.
