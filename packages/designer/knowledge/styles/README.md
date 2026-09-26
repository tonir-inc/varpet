# Taste knowledge API (TASTE owns this directory and room-programs.ts)

[assumed design priors] Eight style records expose aliases, catalog_styles, colors, piece_count,
anchor, materials, textiles and lighting. `resolveStyles(request)` returns all requested styles;
minimalistic + cozy is a blend, never permission to remove essentials. `stylePalette(ids)` returns
shared colors. Style matching reads catalog `styles` and `colors_image`, never product names.

FAST recipes can import `styles`, `resolveStyles`, `stylePalette` from `./index.js`, and
`roomPrograms`, `inferRoomProgram` from `../room-programs.js`. Programs expose `search_kinds`,
`essentials` (role/kinds/count), and `relations`. Explicit customer exclusions override roles;
removing a particular couch does not exclude a replacement seating anchor.

`src/taste/catalog.ts:searchRoomCatalog(program, styles, query?)` searches every program kind in
parallel, filters metadata, and orders confirmed sizes first. Empty groups remain explicit gaps.
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
returned image palette and style metadata. A backend unavailable response remains an unresolved gap.

The existing `search_catalog` MCP tool accepts `room_id`, `style_request`, `remake`, `remove_ids` and
`excluded_roles`. Living and bedroom recipes return two physically and composition-checked candidates.
`propose(candidate_id, rationale)` selects exact code-generated ops and preserves any declared budget,
keeps, preferences and colours. A conflicting declared room is rejected. No proposal is applied.
Other room programs currently return knowledge/catalog data and no automatic compositions.

[not proven] Preserving a kept item is enforced; automatically designing a successful group around
an arbitrary kept anchor is not established. Industrial and boho currently expose catalog/coherence
gaps in the living-room eval instead of silently passing an incomplete room.
