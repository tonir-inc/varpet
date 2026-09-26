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
