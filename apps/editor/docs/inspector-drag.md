# Dragging Properties finishes

Scope: the wall paint and floor finish options in Properties can be dragged onto
their destination in the apartment. A click still applies the option to the
selected entity and the listed wall side. A drop uses the actual visible surface
under the pointer, regardless of which entity or wall side supplied the swatch.

Acceptance: starting or canceling a drag changes no scene data; a valid drop is
one checked, undoable edit. Locked, removed, obscured, and incompatible surfaces
remain protected by the existing finish picker and commands. The brush clears
after a completed or canceled drag, including when the successful edit replaces
the source inspector node.

Wall paint needs a visible wall face, so starting a wall drag shows full walls
and switches Top or Plan to 3D. Floor materials retain Top; Plan switches to 3D.
The existing surface indicator and finish reveal provide the visual response;
reduced motion retains the existing immediate finish application.

This change assumes “options” means the finish swatches in the supplied Properties
screenshot. Furniture catalog placement and door/window type dragging are outside
this change.

## Verification

Pending implementation and browser verification.
