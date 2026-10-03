# From apartment visualization to renovation planning

Product analysis and proposed roadmap, 2026-09-26. Requested direction: reconstruct an apartment from photos and/or its layout blueprint, make mistakes easy to correct, expose assumptions, then support renovation decisions. These are proposed capabilities, not implemented features.

**Implementation update:** the local renovation tools have since been added. See [the current workflow and explicit limits](renovation-implementation.md). The audit below preserves the starting point and broader product checklist; it does not describe the current shipped feature set.

## What the editor offers now

The editor is a functioning furniture-layout prototype over an imported apartment shell. Source inspection and a read-only inspection of the running Chrome editor confirmed that distinction. No runtime editing regression suite was repeated for this documentation task.

| Area | Present capability | Gap for the requested product |
| --- | --- | --- |
| Apartment view | Furnished procedural apartment, perspective/top camera, full/cutaway/hidden walls, Preview | No reconstruction of the user's apartment from evidence |
| Furniture | Selection, position/rotation/size, catalog, duplicate/delete, snapping | Built-ins, mounted components, product fidelity, use/maintenance envelopes |
| Shell | Room polygons; walls with height and thickness; door/window holes | No wall or opening selection/editing UI, connected topology, ceiling or level editing |
| Openings | Offset, width, height, sill in the contract | Entrance role, window type, leaf/frame dimensions, hinge and swing data |
| Doors | Static leaf rendered at a fixed angle | Click to open/close, swing envelope, obstruction checks |
| Lighting | Global presentation lighting; decorative lamp meshes | Actual fixture lights, switches, groups, circuits, routes |
| Recovery | Checked commands, atomic validation, undo/redo, explicit local save/load, JSON import/export | Durable evidence, review decisions, existing-state baseline and design options |
| Agent interaction | Review/apply/dismiss; stale proposal rejection | Real reconstruction/designer services and persistent uncertainty |
| Checks | Geometry validity, furniture inside floor and clear of solid walls, overlap warnings | Door operation, circulation, service access, system connectivity, rule-based review |

Code landmarks: `../src/contracts.ts`, `../src/core/{store,validation,persistence}.ts`, `../src/render/{structure,viewport,assets}.ts`, `../src/adapters/mock.ts`, and `../src/main.ts`. See [architecture](architecture.md) and [integration contracts](integrations.md) for implementation details.

The live Scene panel explicitly labels structure as imported and furniture as editable. The current opening dimensions are a useful starting point, but fields in JSON do not yet give the person correction tools.

## The central workflow

**Collect sources → calibrate → reconstruct the empty shell → review and correct → save the existing apartment → compare renovation options → furnish and connect services → review and hand off.**

Support plan-only, photo-only, and combined projects. Missing scale, unobserved rooms, hidden services, and contradictory evidence must remain visible. A plausible furnished render is not completion of reconstruction.

The model needs at least three distinct concepts:

- **Existing state:** what we believe is there now, including unresolved assumptions and evidence.
- **Proposed design:** retained, removed, replaced, or newly added elements in a selected renovation option.
- **Test state:** temporarily open doors, enabled lights, cutaway walls, camera and visibility settings.

They can belong to one authoritative project model without becoming independent, conflicting scene stores. Test state need not enter construction history; design changes do.

## Walls and fixed features: the right vocabulary

Use **structural walls** (including load-bearing and lateral-resisting roles), **non-load-bearing partitions**, and **unknown structural role**. Exterior, interior, and shared/neighbour boundaries are a different classification. A wall can be internal and structural, or exterior and non-load-bearing.

Do not reduce this to a permanent "can move / cannot move" flag. Model correction must be possible even on a structural element. Alteration of the real element is a separate proposal with its own review requirements. The same applies to columns, beams, slabs, shafts, risers, façade elements, and shared infrastructure.

Suggested independent properties, to be designed in a future contract:

| Concern | Examples |
| --- | --- |
| Structural role | Structural, non-load-bearing, unknown; more detailed role when supported by evidence |
| Boundary role | Interior divider, exterior envelope, shared boundary |
| Physical description | Endpoints, thickness, height, material/layers, surface finishes |
| Knowledge | Source, measured/inferred/unknown, conflicting observations, verification |
| Renovation action | Retain, remove, replace, add; review required and decision record |
| Interaction | User lock against accidental edits; separate correction workflow |

Our proposed review policy is informed by the need for assessment before altering potentially load-bearing structure; [HSE describes that assessment requirement](https://www.hse.gov.uk/construction/safetytopics/buildings.htm). This is general product grounding, not adoption of UK rules for the project's jurisdiction. A non-load-bearing label alone also does not establish that an alteration is feasible or permitted.

## Renovation coverage checklist

This is a coverage map for apartment renovation planning. Each category can start with simple geometry and explicit unknowns; detailed engineering comes later.

| Area | What to represent | What the editor should let the person do |
| --- | --- | --- |
| Sources and survey | Plans, room photos, measurements, date/version, source locations, incomplete coverage | Associate sources with rooms/elements; calibrate scale; correct orientation; compare conflicts; request a missing measurement |
| Apartment boundaries | External perimeter, neighbour/common-area boundaries, entrance, floor level, orientation | Correct the footprint and entrance; understand which side of a wall is inside/outside |
| Walls and partitions | Connected wall segments, corners, thickness, height, material, structural role | Select, dimension, drag endpoints, add, split, join, remove from a proposal; preserve connected geometry |
| Fixed structure | Columns, beams, slabs, shafts, risers, recesses, niches, bulkheads | Add missing fixed obstructions; inspect dimensions and evidence; flag changes needing review |
| Rooms and levels | Room boundaries/names/use, floors, ceilings, steps, lowered floors, ceiling drops | Split/merge rooms consistently; set floor and ceiling elevations; represent non-square corners |
| Entrance | Apartment entry versus common circulation, door connection, threshold, approach | Identify the entrance explicitly; edit the modeled opening; test passage and adjacent door conflicts |
| Internal doors | Wall opening, frame, leaf, handle, hinge side, swing direction, hinged/sliding/pocket/double type | Edit opening width/height/location; choose mechanism; open/close; scrub angle; inspect swing and clear passage |
| Windows and glazing | Offset, width, height, sill/head height, frame, panes, fixed/openable parts, opening mechanism | Correct each dimension; compare regular/full-height/French-style alternatives; open leaves; show obstructions |
| Balconies, loggias, terraces | Exterior/semi-enclosed zone, slab/elevation, connecting door, threshold, railing/parapet, glazing, drains | Include in shell and area breakdown; inspect access, fixed façade features, slope/drainage assumptions and finish zones |
| Circulation and accessibility | Door approaches, routes between rooms, furniture clearances, level changes, reach zones | Test chosen clearance envelopes; locate bottlenecks and blocked routes; apply supplied requirements with their source |
| Kitchens and built-ins | Cabinet runs, worktops, wardrobes, storage, fillers, appliances, connection points | Size and align; test drawers/doors/appliances opening; inspect installation and maintenance space |
| Bathrooms and wet areas | Sanitary fixtures, showers/baths, screens, floor drains, waterproofing zones | Arrange fixtures; test access; relate wet areas to connection points and risers; flag unknown drainage constraints |
| Lighting | Ceiling/wall/pendant/task fixtures, height, aiming, brightness, colour, groups | Place on actual surfaces; switch on/off; dim; inspect scenes; optionally preview approximate daylight |
| Switches and outlets | Controls, gangs, dimmers, sockets, appliance outlets, data/TV/intercom points | Edit type, mounting height and position; assign controlled fixtures; support control from multiple locations |
| Electrical routes | Panel, circuit labels, supply endpoints, junctions, proposed cable/conduit paths | Show an electrical layer; trace connections; distinguish observed from proposed routes; flag disconnected endpoints and clashes |
| Water and drainage | Hot/cold supply, waste, vents, risers, shutoffs, meters, access panels | Connect fixtures; inspect routes, elevations, penetrations and service access; retain supplied sizing/slope constraints |
| Heating/cooling/ventilation | Radiators, heated-floor zones, thermostats, AC units, ducts, exhausts, grilles, condensate | Place components; inspect routes and maintenance space; expose conflicts with ceilings, joinery and façade |
| Other systems | Gas where present, smoke/security devices, network/router, smart-home controls | Record endpoints and equipment; show specialist review needs; connect supported logical controls |
| Finishes and assemblies | Wall faces, flooring, ceilings, tiles, paint, skirting, trims, insulation/acoustic layers, waterproofing | Edit per surface; account for thickness and changed finished dimensions; calculate areas and quantities |
| Furniture and products | Existing belongings, proposed catalog products, real dimensions, keep/replace decisions | Preserve recognizable existing items; compare alternatives; test placement and use envelopes |
| Demolition and construction | Existing/retained/removed/new/replaced work, dependencies, room/trade packages | Compare baseline and proposal; see what is changing and why; record review and execution status |
| Costs and purchasing | Counts, lengths, areas, materials, allowances, labour, price source/date/currency | Produce transparent estimates and lists; show which quantities depend on uncertain dimensions |
| Review and handoff | Measurements still needed, clashes, comments, decisions, versions, schedules, quantities | Focus an issue in 3D; export a reproducible project and review package; preserve source references |

Stairs, duplex apartments, curved/sloped geometry, and complex multi-level services are extension cases. Record their presence explicitly if encountered; never flatten them silently to claim a complete reconstruction.

## An assumptions system the person can actually use

An "AI confidence" number on the whole apartment is insufficient. Confidence and evidence vary between properties on the same object.

Illustrative window review (values are examples, not measurements of a real apartment):

| Property | Current representation | Knowledge and next action |
| --- | --- | --- |
| Width | 1.40 m | Measured; linked to a named measurement |
| Height | 1.50 m | Inferred from photo 3; confirm on site |
| Sill height | 0.90 m temporary display value | Unknown; measure from finished floor |
| Opening mechanism | Unresolved | Fixed, casement, or another type; request a photo of the open window |
| Full-height glazing | Alternative under review | Photo crops the bottom; do not silently pick a conventional sill |
| Downstream effect | Proposed cabinet below window | Cabinet fit remains unresolved until sill height is checked |

"French window" or "full-height" is not enough to infer panel count, operability, or whether it is a passage to a balcony. Store these as separate properties and show a preview of alternatives.

The inspector should show the current value, its status, and a route to the evidence. A dedicated Assumptions/Issues panel should support:

1. Filtering by room, element, uncertainty, conflict, and impact on a decision.
2. Selecting an issue to focus the object and identify the exact property.
3. Reviewing the original source and rationale, including contradictory observations.
4. Entering a measurement, choosing an alternative, accepting a temporary assumption, or leaving it unresolved.
5. Seeing which placements, quantities, or proposals depend on that answer.
6. Recording who changed the decision and why; marking dependent checks stale after relevant edits.

Use explicit source categories (measurement, plan, photo, user statement, inference, default) separately from review categories (unreviewed, accepted assumption, confirmed with evidence, disputed). A measured width says nothing about structural verification. Professional review, where relevant, needs its own reference.

Unknown/temporary values must stay visible in exported projects. If source media is stored outside scene JSON, use stable references and define a portable project package or attachment manifest; show unavailable evidence when a file is missing. Do not promise offline evidence recovery from a filename alone.

## Correction should be a first-class workflow

Reconstruction will make mistakes. The person should not need to regenerate the whole apartment or hand-edit JSON to fix a door.

- Select walls, corners, openings, floors, and fixed features directly in 3D or the scene hierarchy.
- Edit dimensions numerically as well as with handles; provide dimension labels and precision appropriate to the task.
- Snap to adjacent geometry and measurements; preserve non-orthogonal geometry when the evidence supports it.
- Move an opening along its host wall, change width/height/sill, or change type without replacing the whole scene.
- Split/join walls and repair corners while updating room boundaries and hosted components atomically.
- Show resulting conflicts with openings, furniture and fixtures; allow deliberate resolution rather than silently deleting content.
- Undo/redo complete user intentions. Show what a new reconstruction would replace, preserve human corrections, and ask about conflicts through reviewable proposals.
- Distinguish **Correct existing model** from **Propose renovation** in the interaction so changing a mistaken measurement does not become a demolition task.

Examples: "This window is 20 cm further left," "There is a column here," "This is the balcony, not the bedroom," "The entrance opens outward," and "The plan is old; this partition is already gone."

## Interactive doors, windows, and switches

For doors, model the host opening and the installed assembly separately. Persist type, hinge, handing, leaf dimensions, and allowed motion. Provide click-to-open/close and angle controls, a visible swept envelope, and checks against walls, furniture, other leaves, and approach space. Sliding/pocket doors need their own travel/clearance representation. A raised balcony threshold must not disappear to fit an interior-door assumption.

Opening width, leaf width, and usable clear passage must have distinct meanings. Collision testing should cover the path of movement, not only the fully open endpoint. Test state is temporary unless the person explicitly commits a design property.

For lights, first implement actual fixture lights and a logical control graph. One switch may control several fixtures; several controls may operate the same group. The user's "reverse" switching likely means controlling the same light from both ends of a corridor or from entrance and bedside. Describe that behavior in the UI; do not require the person to know regional switch terminology. [Lutron documents two-location control as a three-way application in its terminology](https://support.lutron.com/us/en/product/casetawireless/article/product-installation/how-to-wire-a-caseta-switch-or-dimmer-in-a-3-way-configuration).

Fixture placement, mounting height, brightness, dimming and groups are design configuration. Clicking a switch tests behavior. Supply circuits, cable paths and control relationships are different data. Visible cables can be schematic proposed routes without claiming an engineered wiring design. Hidden existing routes remain unknown unless evidence supports them.

Water, waste, ventilation, heating and electrical components need ports, hosts, elevations and connections. Build a service layer with visibility controls after the host/geometry model works; decorative lines alone cannot support connectivity or quantities.

## Architectural changes needed

These are design tasks, not changes made by this analysis.

1. **Evolve the contract deliberately.** Add evidence/assumptions, semantic structural entities, hosting, existing/proposed states and later service networks. The current v1 validator rejects unsupported fields. Define migrations and coordinate mapping to the shared engine; do not patch arbitrary metadata into renderer objects.
2. **Generalize selection and the inspector.** They currently accept furniture IDs only. Introduce entity-specific controls and picking for shell elements without treating a wall as a scalable furniture mesh.
3. **Add semantic structural operations.** Current `replace-structure` replaces all rooms/walls. Fine-grained edits need stable IDs, shared junctions, hosted-opening rules, room-boundary updates and atomic validation.
4. **Persist reconstruction evidence.** Current adapter notes become proposal description text and are lost after application. Reconstruction needs explicit source inputs/references and property-level assertions, not just geometry plus notes.
5. **Represent mounting and elevation.** Current objects must have Y=0; door sill must be zero; rooms have no elevation/ceiling/holes. Mounted lights, outlets, raised thresholds and service routes need appropriate domain types and rules.
6. **Keep approximation explicit.** Current collision uses furniture bounds and wall openings. Extend it for motion and access envelopes without presenting it as physics or professional compliance analysis.
7. **Retain validated commands and history.** Reuse the sound approval/revision/undo foundation. Reconstruction correction, uncertainty resolution, and agent proposals must use the same checked state transition.
8. **Make project persistence complete.** Version the baseline, options, assertions, decisions and source references together. Browser local save is useful but is not a complete durable source/evidence package.

Do not turn the editor into a full engineering suite in one step. Each system should begin with meaningful placement, relationships, uncertainty, and reviewable behavior.

## Recommended delivery order

| Milestone | Scope | Observable completion |
| --- | --- | --- |
| 1. Correctable shell | Existing model correction, walls/junctions, room boundary, entrance, openings, basic balcony/fixed features, dimensions, property-level assumptions, undo/save | A person fixes a misplaced wall and wrong window dimensions without JSON editing, and reopens those corrections and assumptions |
| 2. Reconstruction integration | Source intake, scale/orientation, real reconstruction adapter, evidence, incomplete coverage, comparison/review, preservation of human corrections | A real plan/photo set produces a reviewed empty shell; unknowns remain visible and a rerun cannot overwrite accepted corrections silently |
| 3. Renovation options and operation | Baseline versus proposals, door/window types, clickable door motion, swing/access checks, built-in and furniture fit | Compare a layout proposal with the existing apartment; identify a door that hits a wardrobe; undo the proposed change without losing the baseline |
| 4. Lighting and services | Surface mounting, fixture lights, multi-location controls, sockets and connection points, electrical/plumbing/HVAC layers | Switches control intended lights; devices stay hosted; disconnected components and route conflicts can be reviewed |
| 5. Finishes and handoff | Material layers, quantities/costs, work scope, issues/review records, portable exports | Deliver a traceable design option with quantities, source references, pending questions and clear review status |

Milestones 1 and 2 form the first complete product slice. Work on the correction UI and reconstruction adapter can proceed in parallel behind an agreed boundary; reliable correction is required before calling reconstruction finished. Balcony shell geometry belongs in that slice even if detailed drainage/glazing tools arrive later.

Prioritize uncertainties by their effect: scale, footprint, structural role, opening location, ceiling/floor levels and fixed service points can invalidate later choices. A decorative finish can wait. Do not spend the next iteration expanding the furniture catalog while the apartment itself cannot be corrected.

## First end-to-end acceptance scenario

1. Start a project with a plan and/or room photos. Supply or request a known dimension; record the origin of scale.
2. Produce an empty shell with the entrance and balcony identified. Mark incomplete rooms and inferred properties.
3. Select and correct a misplaced wall; connected boundaries and hosted openings update or report a clear conflict.
4. Edit entrance-door opening width/height and an internal opening's position. Undo each complete edit.
5. Inspect an ambiguous window: change its sill or full-height assumption and keep unresolved mechanism details visible.
6. Record structural role as unknown when evidence is insufficient. Correct its modeled geometry without creating a renovation removal action.
7. Save a reviewed existing-state version, export, and reopen with stable identities, measurements, assumptions and evidence references intact.
8. Rerun reconstruction and review a conflicting result without losing the person's correction.

Next acceptance slice: propose a partition/opening change, preview the difference from the baseline, open a door through its full swing, and identify an obstruction. Later: place one ceiling light and two controls, verify both operate that light, then inspect their logical relationship separately from a proposed cable route.

## Scope boundaries and evidence

The existing constitution prohibits generated images and 2D previews. Keep editing, overlays, measurements, cutaways and top views on the live 3D model; separate 2D drawing/export work is not included here. Original source evidence is not to be replaced by generated imagery.

This analysis read the repository constitution, current editor code and documentation, the running editor, and the Notion Docs landing page. The latter repeats the fidelity-first, one-scene, checked-ops principles. The Design doc could not be opened during this audit because browser access timed out; no agreement with unread detailed specifications is claimed. Reconcile the proposed roadmap with them before treating it as a delivery schedule.

The structural and lighting references above inform terminology and product distinctions. They do not set local construction rules. Any future compliance feature needs an explicit jurisdiction, versioned rule sources, required inputs, and professional review boundaries. A successful geometry or switch simulation means only that the stated modeled test passed.
