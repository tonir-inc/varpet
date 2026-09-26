# Taste knowledge API (TASTE owns this directory and room-programs.ts)

[assumed design priors] Eight style records expose aliases, catalog_styles, colors, piece_count,
anchor, materials, textiles and lighting. `resolveStyles(request)` returns all requested styles;
minimalistic + cozy is a blend, never permission to remove essentials. `stylePalette(ids)` returns
shared colors. Style matching reads catalog `styles` and `colors_image`, never product names.

FAST recipes can import `styles`, `resolveStyles`, `stylePalette` from `./index.js`, and
`roomPrograms`, `inferRoomProgram` from `../room-programs.js`. Programs expose `search_kinds`,
`essentials` (role/kinds/count/optional preferred_kinds), and `relations`. Explicit customer exclusions override roles;
removing a couch excludes sofas until the customer explicitly requests one again. Two facing chairs
can supply the seating anchor. Customer history is enforced at MCP and editor proposal gates.

`src/taste/catalog.ts:searchRoomCatalog(program, styles, query?)` searches every program kind in
bounded batches, filters metadata, and orders confirmed sizes first. Empty groups remain explicit gaps.
`src/taste/composition.ts:scoreComposition(scene, roomId, options)` is pure grading;
`rankCompositions` requires two candidates. Pass the catalog evidence keyed by SKU in options.
Missing evidence cannot pass consistency. Physical checks remain separate and mandatory.

[derived limitation] Catalog metadata does not prove comfort, fabric feel or lamp color temperature.
These priors guide selection; customer preference remains the final taste judgment.

The catalog adapter preserves `styles_inferred` separately from listing `styles`; it comes from the
catalog's existing `style_astra` image annotations. The matcher accepts recognized style families from
either source. Product-type tags such as "Floor Lamp" alone are not style evidence. Adjacent modern,
Scandinavian and mid-century tags form one compatible family; arbitrary rustic/classic mixtures do not.
Search uses two concurrent kind queries at a time to protect the shared service, then filters the
returned image palette and style metadata. An unavailable response gets one bounded retry; retried_kinds exposes it. A second unavailable response remains an unresolved gap.

The existing `search_catalog` MCP tool accepts `room_id`, `style_request`, `remake`, `remove_ids` and
`excluded_roles`. Living, bedroom and office recipes return two physically and composition-checked candidates.
`propose(candidate_id, rationale)` selects exact code-generated ops and preserves any declared budget,
keeps, preferences and colours. A conflicting declared room is rejected. No proposal is applied.
Other room programs currently return knowledge/catalog data and no automatic compositions.

[measured, 2026-09-26] Bedrooms search real `nightstand`, `wardrobe` and `dresser` kinds, preferring
native nightstands over legacy tables/cabinets. An explicitly requested wardrobe or dresser stays
that kind; a removed kind cannot be restored. Offices search `desk` first, with a working-height table
fallback only when no desk is explicitly required. Entry programs search `bench`, `stool`, `ottoman`
and chair alternatives. Explicitly excluded office anchor roles currently decline automatic composition.
The native catalog aliases remain distinct in request-policy checks. Bedroom product variants are
bounded; equivalent same-product/orientation poses within 0.25 m do not count as a second candidate.
[assumed] Wardrobes at least 1.4 m high and 0.4 m deep are a proxy for freestanding clothes storage,
excluding shallow wardrobe panels; installation metadata is not verified. Nightstands allow up to 0.7 m edge reach (placed at 0.65 m to preserve the 0.6 m access strip); floor
lamps stay within 0.9 m lateral reach and 0.9 m longitudinally from the head. Bedside and storage
function-clearance regressions are checked before candidates are returned, matching the proposal gate.
These reach limits are assumed design priors; existing physical gates remain mandatory.
[measured] The current 900-asset editor export still maps desk→table and wardrobe/dresser/nightstand→cabinet.
Real SKU kinds are retained in planner evidence; native desk/wardrobe/dresser editor contract support
is tested separately. Entry seating kinds use existing chair aliases. Do not infer real types from names.

[not proven] Preserving a kept item is enforced; automatically designing a successful group around
an arbitrary kept anchor is not established.

Industrial and boho expose living-only `composition.program`, `roles`, `signatures` and `identity_styles` as data. Search uses
`searchStyleForKind`; filtering and grading use `styleMatchesKind`. Industrial needs industrial-tagged
table and shelving, with compatible neutral upholstery/rug/light. Boho needs a bohemian rug and
rustic/bohemian storage; a neutral modern sofa and shaded modern lamp can support that composition.
Explicitly excluded roles remove their signature requirement, while at least one remaining piece must
still carry the requested Industrial or Bohemian identity. Missing remaining signature evidence fails
grading; a shared neutral family alone cannot pass. Other styles and room programs retain the shared-family requirement. Listing and inferred tags retain provenance.
[assumed] These role recipes are design priors, not measured customer preferences. Living candidates
require focal shelving at least 0.7 m high and 0.2 m deep to avoid putting tiny wall racks on the floor;
size is only a proxy for freestanding use, not verified installation metadata.
