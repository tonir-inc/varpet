# Renovation domain verification and limits

Updated 2026-09-26 after the v2 implementation. This checklist distinguishes modeled data and deterministic checks from the remaining simulation and engineering work. Browser verification is recorded separately in `verification.md`.

## Implemented and checked

- [x] Atomic shell operations, connected wall endpoint/T-junction movement, hosted opening/component continuity, strict import validation and undo/redo.
- [x] Split/join preserves finish area and costs. Joining walls with conflicting classification, elevation, phase or finish stacks is rejected rather than discarding those distinctions.
- [x] Evidence/assumptions persist through project exchange, baseline restore and option switching. Direct edits and indirect mounted-component, route-endpoint and connected-opening changes invalidate associated inferences. Dependency invalidation is transitive.
- [x] Furniture floor support and wall/footprint clashes persist as review issues in v2. Invalid shell geometry still rejects the transaction; v1 placement behavior is preserved.
- [x] Single and double hinged-door swept envelopes use the corresponding leaf width and wall orientation. Checks ignore removed furniture, fixtures and walls, and use the world orientation of wall-mounted equipment.
- [x] Removed electrical routes and switches do not satisfy live supply/control review checks. An active route terminating at removed equipment produces a relocation/removal issue. Removed wall hosts produce a mounted-equipment relocation issue.
- [x] Material area/length/count units are checked. Removed surfaces, components and routes are excluded from represented-work quantities and cost. Material waste and explicit work allowances are included.

The new core acceptance suite currently contains 102 assertions. Existing v1 assertions remain unchanged. Relevant checks are `pnpm --filter @varpet/editor typecheck`, `pnpm --filter @varpet/editor test`, and `node apps/editor/scripts/check-renovation.mjs`.

## Remaining limits

- [ ] Use/maintenance clearance boxes are recorded and drawn, but they do not yet produce obstruction or room-containment checks. They are not circulation or accessibility simulations.
- [ ] Hinged-door review samples a 90-degree swept envelope. It does not test door-to-door interaction, drawer/cabinet motion, sliding/pocket-door travel, or opening-window clearance. Wall interference uses wall centerlines, and does not subtract another wall's openings. These are approximate review issues, not exact product-mesh collision results.
- [ ] Multi-gang controls share one target group. Independent target groups per rocker and electrical traveler wiring are not modeled. Group dimming and multiple controls targeting the same lights are temporary previews; physical circuit topology remains separate.
- [ ] Electrical routes validate compatible endpoint kinds, references and attachment positions. They do not calculate load, breaker/conductor sizing, voltage drop, protection, isolation or circuit correctness.
- [ ] Waste-route review checks overall fall between endpoints; individual segments, minimum slopes, pipe sizing, venting and water pressure need specialist review. Gas, heating and ventilation routes are conceptual paths with typed endpoints, not engineered systems.
- [ ] Service penetration review tests line crossings through walls. There is no general volumetric route-to-route, route-to-equipment, ceiling/beam clash or penetration-sealing simulation.
- [ ] Room areas are summed from individual polygons. Overlapping rooms are not union-deduplicated. Skirting quantities use the gross perimeter/length; door deductions and trade-specific takeoff rules are not automatic. Material thickness is recorded but is not a full assembly or finished-clearance solver.
- [ ] The estimate totals represented products/materials/routes and explicit task allowances. It is not an incremental renovation quote: existing retained items can remain priced, demolition labour is an explicit allowance, and tax, delivery, procurement availability and currency conversion are not automatic.
- [ ] Baselines/options snapshot geometry, metadata, fixtures, routes and finish assignments. Evidence, assumption records, material definitions/prices, currency and work packages are shared project data. Use different material records for alternative finishes rather than editing a shared material and expecting the old definition to remain option-specific.
- [ ] Assumptions attach to individual properties, but invalidation is conservative at the affected-entity level. A changed entity can require re-review of unaffected properties. Measured/verified statuses require a source reference; software cannot establish the truth or professional authority of that evidence.
- [ ] Review flags and geometric checks are not structural, electrical, fire, accessibility or construction approval. Specialist requirements and site verification remain explicit project work.
