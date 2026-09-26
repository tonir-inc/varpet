# Local renovation workflow

Implemented 2026-09-26. The user chose local tools first, with an AI provider to be connected later. No account or upload to an external service is required. This guide distinguishes working tools from the broader [renovation roadmap](renovation-scope.md).

## Start with the existing apartment

Open **Renovate** (shortcut **4**). **Add evidence** imports local PNG, JPEG, WebP or PDF originals, or records measurements and source notes. Each file is limited to 2 MB in the import dialog. Sources remain in project JSON. Viewing originals is input inspection; the apartment output is the existing Three.js 3D scene.

**Build from plan** offers three paths:

1. Enter measured rectangular spaces, their X/Z positions, floor elevation, ceiling height and room/balcony/loggia/terrace type. Dimensions describe wall centreline footprints. Adjacent rooms share walls; overlapping rectangles are rejected. Unmeasured common wall thickness and structural function remain assumptions.
2. Calibrate an imported image plan using two points and a known distance. Trace the perimeter and partition segments on the original image. Intersections form shared junctions and enclosed room floors. This supports concave outlines and partial partitions. Nested floor holes are rejected; divide their surrounding area into non-overlapping closed spaces. PDFs must first be provided as an image for tracing.
3. Compare a reconstructed project JSON with the current model, choose changed rooms/walls and retain unselected human corrections. Stable IDs must match; new IDs add new entities. This is the future provider handoff point, not an AI implementation.

Review the proposed dimensions, then **Inspect proposed 3D** in Assistant. This temporarily renders the candidate without altering the project. **Apply changes** commits one reversible command; Dismiss retains the original. A revision change invalidates the proposal. No entrance, window, load-bearing classification, or hidden utility is automatically invented.

## Correct the shell

Select a room, wall or opening in the scene or Shell list. Edit dimensions numerically; drag wall endpoint handles with Move. Connected endpoints and matching floor vertices move together; openings and mounted components remain relative to their host. Invalid combinations reject atomically. Splits preserve quantities, hosts and evidence; joining requires compatible collinear walls and finish stacks.

To reposition a door or window, select it and choose **Move** (**G**), then drag the opening or its purple arrows along the wall. Its opening, frame and leaves move together. Movement stays on the same wall and stops at wall ends, neighbouring openings and intersecting solid walls, accounting for thickness and elevation. Typed edits and wall changes that obstruct an opening are rejected too. Opening and wall endpoint movement snap to **0.05 m**; toggle the grid button for finer placement. Release to commit one undoable edit, or press **Esc** to cancel. A locked opening or host wall must be unlocked in Renovate before moving.

Set structural role (**unknown**, **structural**, or **non-load-bearing partition**) separately from exterior/interior/shared boundary, material, edit lock, renovation phase, and review status. An unlocked wall is a model correction permission, not approval to alter the building. Mark an entrance or balcony opening explicitly. Openings support offset, width, height, sill, hinge side, swing direction, threshold and frame/leaf dimensions.

Hinged, double, sliding, pocket, fixed, casement and tilt mechanisms have 3D representations and applicable test movement. In **Select** mode, select a door, then click it again or use its inspector controls to test opening. Swing overlays and approximate obstacle checks help identify conflicts. Temporary opening angles do not create history entries.

Room elevation and ceiling height represent split levels and balconies. Railings, steps, columns, beams, service shafts, ceilings and bulkheads are editable components. Furniture from the original catalog remains at Y=0; use building components for elevated or mounted fixtures.

## Keep uncertainty visible

Evidence and Assumptions provide property-level records: value, observed/inferred/measured/design source kind, unresolved/accepted/measured/verified/stale status, source IDs, source region, rationale, alternatives, next measurement and dependencies. Source kind and review status are independent. Accepting a visualization default does not claim a measurement.

Corrections invalidate affected assumptions and their dependants. Evidence remains shared across baseline and options, including references to entities only present in an inactive option. Enable the assumptions overlay to locate unresolved elements; Review lists open issues with selection links.

## Plan components and services

Systems places 30 component types, including lights, switches, outlets, panels, junctions, plumbing fixtures, valves/risers, heating/HVAC, cabinets, worktops, appliances, detectors, network points and access panels. Components have position, dimensions, rotation, room, phase, notes, allowance and optional use/maintenance envelope. Wall hosts specify centre offset, absolute base elevation and wall side. Host changes move the component and connected route endpoints.

Switches can control multiple lights; multiple switches can control the same lights for testing control from different locations. Dimmers have a temporary level slider. Light enabled state and brightness are saved design settings; interactive switching/dimming is view state. Multi-gang metadata and appearance are supported, but all targets on one switch currently share a control group. Represent independent circuits as separate switch components.

Draw physical polylines for electrical, cold/hot water, waste, ventilation, heating, gas and data. Compatible endpoint components, diameter, circuit name, phase and cost per metre are persisted. Individual system visibility is configurable. Supply routes and logical switch targets are distinct. The app reports missing endpoints/connections and selected placement conflicts; it does not simulate current, voltage drop, pressure, drainage performance or thermal load.

## Compare renovation options and prepare handoff

Capture the reviewed existing apartment as a baseline. Switch to renovation mode and record retain/remove/new/replace phases. Save named options, switch between them and show the baseline ghost. Options carry geometry, phases, components, routes and finish assignments; evidence, material definitions and work tasks stay project-wide.

Review includes materials and surface assignments, waste percentages, quantities, component/route allowances and work packages with dependencies. Costs are entered locally in the project's chosen currency. Finish thickness is recorded, but quantities and clearances are conceptual rather than a construction assembly solver.

Export full project JSON, a CSV schedule, or an HTML review package. JSON includes original evidence and all options; the report lists the model, assumptions, issues, services, quantities and work packages. Explicit browser Save can hit localStorage quota with large attachments; JSON export remains the portable fallback. Reload opens the demo until **File → Load saved scene** is chosen.

## Deliberate limits

See the [domain verification and limits](renovation-domain-limitations.md) for the precise boundaries of quantities, collision approximations and service checks.

- No automatic photo recognition, metric recovery from uncalibrated photos, external AI provider, photogrammetry or generated meshes.
- One apartment level with elevation differences; no stair connectivity, multiple storeys, curved/sloped walls, arbitrary floor holes or full BIM interchange.
- Door swings and furniture/component extents are approximations; no exhaustive reachability, accessibility, cabinet/appliance articulation, or product-specific collision certification. Use clearance envelopes and review measurements.
- Service lines are planning geometry, not engineered electrical/plumbing/HVAC calculations. Structural and regulatory approval remains a separate review process.
- Sources have no EXIF processing or automatic registration across images. Reconstructed IDs must be mapped deliberately before selective updates.
- Local save/export and optimistic revision checks exist; accounts, cloud backup and multi-user synchronization do not.

## Implementation map

- `src/renovation-contracts.ts`: explicit v2 project types and semantic operations.
- `src/core/renovation.ts`, `geometry.ts`, `validation.ts`, `store.ts`: migrations, atomic edits, dependent updates, checks and quantities.
- `src/features/reconstruction.ts`, `intake.ts`: local source input, measured/trace reconstruction, selective merge and approval.
- `src/ui/renovation.ts`: Shell, Evidence, Assumptions, Systems, Options and Review forms.
- `src/render/structure.ts`, `services.ts`, `annotations.ts`, `viewport.ts`: disposable 3D projection, interaction and overlays.
- `src/features/handoff.ts`: escaped standalone report and spreadsheet-safe CSV.
- `scripts/check-renovation.mjs`: additional v2/reconstruction acceptance checks. The original acceptance suite remains intact.
