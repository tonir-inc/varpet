# Apartment editor

Applies to `apps/editor/**`. Follow the root `AGENTS.md` and `../../docs/CONSTITUTION.md` as well, except where this file gives an editor-specific override. This file records product intent and implementation guidance. The scope document is a broader roadmap; the implementation guide records shipped capabilities and limits.

## Working together

The user authorized coordinated edits to the same editor file on 2026-09-26. Within `apps/editor/**`, this overrides the root rule “Two agents never write the same file” and any inherited requirement for exclusive file ownership, including completion checks.

- All agents, including subagents, making editor changes must work directly on `main` in the shared primary checkout at `/Users/davitstepanyan/Documents/varpet`. Do not create or switch to another branch or use a separate worktree for editor work unless the user explicitly requests it for the current task. This overrides the root parallel-worktree rule.
- Before editor work, verify the checkout is on `main`, inspect local changes, fetch `origin`, and review the latest remote commits. Coordinate synchronization with other active agents: do not stash, reset, rebase, or switch the shared checkout over another agent's unfinished work. If that work prevents updating from `origin/main`, preserve it and defer the update until synchronization is safe. This overrides the root requirement to rebase before every task when the shared checkout is in use.
- Multiple agents may contribute to the same file, including sequential handoffs and separate changes in a shared file. Assign responsibility for the change or region instead of requiring a single lifetime owner of the file.
- Before applying a patch, reread the current affected code and preserve other agents' work. Coordinate overlapping edits and apply changes to the same region in sequence in the shared `main` checkout.
- Keep patches focused, reconcile changes against the latest version, and verify the combined behavior. Do not overwrite an entire shared file with a stale copy or discard unrelated edits.
- An active chat or a previous contributor to a file is not by itself a reason to leave an authorized change unapplied or withhold review approval. Resolve actual conflicts and report any remaining technical issue precisely.

## Purpose

Turn apartment photos, layout plans, and measurements into a faithful, editable 3D model of the existing apartment. A person must be able to correct reconstruction mistakes, understand what is uncertain, and work with an agent on renovation and furnishing options.

The first product milestone is a trustworthy empty apartment shell, including its entrance, internal and external walls, openings, fixed features, and balconies. Furniture, finishes, functional doors, and building services build on that shell. Preserve fidelity to the actual apartment; generic demo geometry is not evidence about a user's home.

Read [the renovation scope](docs/renovation-scope.md) for the original audit, full checklist, priorities, and acceptance scenarios. Read [the implementation guide](docs/renovation-implementation.md) for the current workflow. Existing implementation details live in `README.md` and `docs/{architecture,integrations,rendering,verification}.md`.

## Current implementation baseline

Audited 2026-09-26; recheck code when implementing changes.

- Vite, TypeScript, Three.js. `src/contracts.ts` and `src/renovation-contracts.ts` define an editor-local v1/v2 contract. `packages/engine` is still a placeholder. V1 imports remain valid; the first renovation operation migrates explicitly to v2.
- Furniture and shell editing use checked, revisioned commands with undo/redo and explicit save/load. The Renovate workspace has Shell, Evidence, Assumptions, Systems, Options, and Review tabs.
- Rooms, balconies, walls and openings are editable; wall junctions, hosts, source assumptions and finish assignments are maintained by domain operations. Wall endpoint dragging, splitting/joining, opening dimensions, structural classifications, locks and phases are supported.
- Local evidence import supports photos, image plans, PDFs, and measurement records. Measured rectangles or calibrated tracing of an original image produce reviewable 3D shell proposals. Selective geometry updates use stable IDs. **The user chose local tools now, AI later:** no automatic inference from photos or external AI service exists.
- Property assumptions retain evidence, review state and dependencies. Geometry/source changes stale affected assertions. Original sources survive project JSON export/import.
- Door/window mechanisms are interactive. Door angles, switch state, dimmer level, layer filters and comparison ghosts are temporary view state. Building components include hosted lights/switches, electrical/plumbing/HVAC points, cabinetry, balcony railings and other fixed elements. Physical routes and logical control links are separate.
- Room/wall elevation and ceiling heights are supported. Catalog furniture remains grounded at Y=0; elevated or mounted renovation objects use BuildingComponent. This is one floor layout with elevation changes, not a multi-storey BIM model.
- Baseline/options, renovation phases, materials, quantities, allowances, task dependencies, CSV schedules and HTML review reports are local project tools. They are conceptual checks/estimates, not engineered construction documents.

## Product distinctions to preserve

1. **Existing apartment versus proposed renovation.** Keep a reviewed existing-state baseline and explicit proposed changes. Correcting an inaccurate reconstruction is different from proposing to change the physical apartment.
2. **Structural role versus editability.** Structural/load-bearing, non-load-bearing partition, and unknown are structural classifications. Exterior/interior/shared boundary, material, verification, user edit lock, and alteration review are separate properties. Never infer permission to demolish from thickness, appearance, an AI label, or an unlocked editing handle.
3. **Correction versus alteration.** A structural wall's incorrectly modeled position or dimensions must remain correctable. That correction does not approve moving, cutting, or removing the real wall. Unknown or structural alterations need an explicit review state; a partition is not automatically unrestricted either.
4. **Opening versus installed product.** A hole in a wall, its frame, and its door/window leaves are distinct. Opening size is not automatically leaf size or usable clear passage. Entrance, internal, and balcony connections need semantic roles.
5. **Evidence versus assumptions versus choices.** An observed existing feature, an inferred property, a temporary visualization default, and a proposed design choice must not be presented as equivalent facts.
6. **Control versus supply.** A switch controlling a light is a logical relationship; a cable supplying it is a physical route. Plumbing likewise needs connection points and networks, not decorative lines.
7. **Interactive preview versus design change.** Testing a door angle or light switch should not modify the existing-state record or create renovation work. Committing hinge placement, fixture connections, or default configuration is a checked design edit.

## Assumptions are persistent project data

- Track uncertainty at the property level: a window width can be measured while its sill height and opening mechanism remain unknown.
- Retain the source reference and relevant location in a plan/photo, measurement units, rationale, alternatives, review status, and the question or measurement needed to resolve it. Missing evidence remains missing.
- Keep source kind, confidence, and review state separate. User acceptance for visualization does not mean measured or professionally verified. Do not invent precision with unsupported confidence percentages.
- If an unknown property needs a numeric value to render, mark it as a temporary assumption. Saving, rendering, or approving an agent edit must not silently promote it to confirmed fact.
- Show an Assumptions/Issues list with selection/focus, evidence, correction, and resolution actions. Highlight uncertain properties in the inspector and provide a scene overlay with labels as well as color.
- Preserve conflicts between plans, photos, and measurements. Ask for the specific missing measurement instead of silently choosing an authoritative source.
- Source changes and geometry edits must invalidate dependent inferences/checks when appropriate. Reconstruction reruns must surface conflicts with human corrections instead of overwriting them.
- Evidence links, assumptions, decisions, and design options must survive project save/export/import. Chat text, adapter notes, and Three.js `userData` are not their authoritative storage.

## Motion is part of editing

Follow [the editor motion rules](docs/motion.md) when changing a visible interaction. Every state change needs an intentional visual response: preserve continuity for object transforms, wall display, camera framing, and interface surfaces. Direct manipulation stays attached to the pointer; committed changes ease from the currently displayed state. Check interruption, undo/redo, reduced motion, and idle rendering before considering the interaction finished. Update the rules with measured results and implementation lessons when new motion ships.

## Editing and architecture

- One serializable scene/project document remains authoritative. The renderer projects it into disposable objects. Do not add a competing source of scene truth.
- Use semantic, validated commands for shell and service editing, following the existing furniture command path. Inspector edits, gestures, agent proposals, and imports must share validation, revision checks, and history behavior.
- Human gestures authorize their own changes. Agent changes are explicit reviewable proposals with Apply/Reject; retain stale-revision rejection. No additional permission prompt is needed for work already authorized by the user's task.
- Make connected edits atomic: a wall edit must account for junctions, room boundaries, hosted openings/components, evidence anchors, and affected furniture. Never silently detach or discard dependants.
- Preserve stable semantic IDs. Show a focused change preview and actionable conflicts before applying disruptive geometry changes. A failed operation leaves the document unchanged; a drag is one undo action.
- Provide direct selection, precise dimensions, appropriate snapping, and reversible correction for structural entities. Furniture's current 0.25 m grid must not dictate opening/measurement precision.
- Support host-relative mounting and elevation before representing sockets, lights, or services as furniture. Do not weaken floor-placement validation globally to simulate these entities.
- Adding evidence, phases, structural roles, hosts, or networks is a deliberate contract evolution. Plan explicit versioning/migration and update boundary validation; do not hide metadata in names or weaken schema checks. Coordinate shared-engine changes with its owner.
- Preserve the existing source/view separation and resource disposal. Geometry, clearance, quantity, and price calculations belong in deterministic code; agents propose inputs and explain results.
- Keep the product within the constitution's no-generated-images/no-2D-previews constraint. The current Top mode is an orthographic camera on the same 3D scene. Do not quietly introduce a separate 2D output pipeline.

## Priorities and verification

Recommended sequence: (1) editable empty shell plus evidence/assumptions, (2) connected reconstruction with human review, (3) door/window interaction and renovation options, (4) lighting/services, (5) finishes, quantities, and handoff. Include entrance and balcony geometry in the shell rather than bolting them on after furnishing.

Before implementing a feature, define observable success. For the first end-to-end milestone, a person can reconstruct a shell, correct a wall and opening, review ambiguous window details, identify the entrance and balcony, and reopen the project without losing evidence or corrections.

For implementation changes, use relevant `pnpm typecheck`, `pnpm test`, `pnpm --filter @varpet/editor test:renovation`, and `pnpm --filter @varpet/editor build` checks, plus focused browser verification of the changed workflow. Document what was actually exercised. Documentation-only changes need content/link/diff review, not a fabricated runtime test claim.

Follow the root restriction against editing tests, fixtures, or the schema merely to make checks pass. Do not overwrite unrelated local work. Follow the coordination rules above when using multiple agents.

Geometric checks and interactive previews do not establish structural, electrical, plumbing, fire, or accessibility compliance. Record professional review requirements as project issues where relevant; do not present a model's confidence or a successful collision check as construction approval.
