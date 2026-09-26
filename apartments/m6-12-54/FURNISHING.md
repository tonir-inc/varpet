# M6-12-54 furnished interpretation

`scene.furnished.json` is an optional furnished version of `scene.json`. The generator always reads the current shell afresh, preserves all rooms, walls, existing components, source attachments, metadata and assumptions, and then appends the furnishing interpretation. The shell remains a separate working file.

Run from the repository root with Node 22.18+ (native TypeScript stripping):

```sh
node apartments/m6-12-54/furnish.mjs
node apartments/m6-12-54/check.mjs apartments/m6-12-54/scene.furnished.json
```

Coordinates use source-pixel origin `[635, 575]`, scale `1/97` metre per pixel, positive X toward plan-right and positive Z toward plan-down. Dimensions are approximate drawn footprints. Heights are ordinary visualization assumptions. Models and colors come from the editor's existing local catalog; prices attached to those catalog models are demo values and are **not an estimate or shopping list for this apartment**. Fixture component prices are zero placeholders. No rugs or new decorative layout have been added.

| Space | Added interpretation |
| --- | --- |
| Entrance hall | Empty; no legible furniture symbol is drawn. |
| Bathroom | Shower, WC, basin, ambiguous laundry/storage rectangle: 4 components. |
| Kitchen | Sink, north cabinets, cooker with dark hob surface, south cabinet run: 8 components. |
| Bedroom 1 | West-headboard double bed, two nightstands, north-alcove wardrobe: 4 furniture objects. |
| Bedroom 2 | East-headboard double bed, two nightstands, north wardrobe: 4 furniture objects. |
| Living/dining | Eight-seat dining group, sofa, two armchairs, three occasional tables, media console, plant: 17 furniture objects. |
| East balcony | Two chairs, small table, two plants, ambiguous end bench/storage: 6 furniture objects. |
| Shared south balcony | Two chairs, small table, two plants, ambiguous end bench/storage: 6 furniture objects. |

Total: **37 furniture objects and 12 fixture components added**. Every item has an unresolved source-linked assumption with its source-image region. Existing balcony railings remain unchanged.

## Representation limits

- Furniture is a trace of the developer illustration, not a proposed redesign. No legible exact dimensions, finishes or heights are supplied.
- The apartment title obscures much of the sofa and coffee-table group. Visible fragments establish the arrangement; some extents remain uncertain.
- The catalog has rectangular tables and conventional chairs. Round occasional tables and round balcony seats use those models as proxies. Two balcony chair centers move about 3 pixels to keep the rotated rectangular proxies supported on their floors; two nightstands move about 2 pixels for the same reason.
- The north bathroom wet-area rectangle might be a shower or bath. The southwest rectangle might be laundry or storage. Both remain explicitly unresolved.
- The striped rectangles at the ends of the balconies are represented as low bench/storage pieces. They may instead be planters or service elements.
- The media console is represented; an exact TV screen is omitted because the catalog lacks a screen model. The hob is a thin dark component without modeled burners. No unshown electrical, plumbing or gas routes are invented.
- Dining chairs overlap the table footprint because the source draws them tucked beneath it. The current validator reports these eight overlaps; preserving them keeps the source arrangement.
- Scene objects have no native `roomId` field. Their room is recorded in metadata notes and their placement; fixture components use their supported `roomId` field.
- The shell's inherited `assumption-room-living-furniture` describes the original empty shell. It remains intact for provenance, and `assumption-furnished-variant` explains why this optional copy has furniture.

## Validation evidence — 26 September 2026

The generator asserts that the shell geometry, source attachments, all pre-existing metadata, assumptions and components remain identical as JSON values. Regenerating after shell edits picks up those edits.

```text
Furnished variant: 37 furniture objects and 12 fixture components added; shell/evidence unchanged.
PASS apartments/m6-12-54/scene.furnished.json: 8 rooms, 2 balconies, 11 openings;
3 balcony doors connect correctly; all internal doors connect floor;
embedded source and assumptions survive normalized save/reimport.
Raw wall spans 38; normalized wall spans 48; floor polygons 75.93 m².
```

Direct `validateScene(scene, localCatalog)` additionally returned `ok: true`, `errors: []`, eight dining/table footprint-overlap warnings, and no floor-support or wall-intersection warnings for furniture. Component shape validation is included, but fixtures do not receive furniture clearance or collision checks. This is not a clearance/compliance approval.

This furnishing lane has not run repository-wide tests or typecheck; it changes only apartment data and its generator. Rendered visual QA remains unverified: editor browser screenshot capture failed. Import, schema/geometry and save/reimport checks passed.

`furnish_timing: START=1790418572 END=1790418614 seconds=42` — generation and validation portion; excludes source/contract reading.
