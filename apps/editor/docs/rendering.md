# Browser rendering

The editor uses Three.js `WebGLRenderer` and the same live scene for perspective and orthographic top views. It produces an editable architectural visualization with procedural furniture. It does not claim photographic reconstruction, measured accuracy from photos, or physically simulated lighting. No generated image or 2D-preview artifact is part of this implementation.

## Projection and geometry

`src/render/viewport.ts` projects the authoritative JSON into Three.js groups keyed by scene object IDs. Selection, camera state, and transient drag previews stay outside scene JSON. On pointer release, the viewport returns a transform patch to the application; the command processor decides whether it can commit. The viewport then restores the authoritative transform, including after a rejected edit.

`src/render/structure.ts` triangulates and extrudes simple floor polygons into 14 cm slabs. Walls are thick segments split around explicit openings. Door frames, open leaves, window frames/glass, skirting, and floor seams are procedural. Door leaves are presentation geometry; validation checks the wall opening rather than the leaf swing. Floor and wall data are imported and read-only in furniture tools.

Full, hidden, and cutaway wall modes change visibility only. Automatic cutaway preserves interior partitions and explicitly interior/shared boundaries. A wall qualifies as exterior only when room-facing spans occupy one side; ambiguous walls stay intact. In perspective, the camera must be outside the room footprints and beyond the wall's exterior face. Nearly edge-on exterior walls stay full-height using the existing angular hysteresis (enter at about 17.5° from parallel, restore below about 12.7°; first frame about 15.1°). This is a conservative visibility heuristic, not a general occlusion solver. See [cutaway verification](cutaway.md). Exterior-wall openings fade with their walls; selecting an opening reveals its host's openings for inspection and movement. Top lowers exterior walls while preserving partitions and openings. Standalone walls without room data retain their legacy low Top projection unless marked interior/shared. Full and Hidden remain explicit overrides. Top uses an orthographic camera over the same 3D meshes; camera/display changes never edit scene data.

`src/render/assets.ts` builds nine furniture kinds using rounded boxes, cylinders, and low-resolution spheres, with separate upholstery, wood, metal, and plant materials. Each result is normalized to catalog dimensions, centred in XZ, and grounded at Y=0. These shapes are original approximations; product names and demo prices are illustrative.

`src/render/furniture-materials.ts` adds procedural wood grain, roughness variation, and textile weave to the existing furniture, preserving catalog geometry and base colors. Lamp shades emit a warm tint; catalog floor lamps also carry a warm point light in the disposable projection.

Exterior wall faces and wall caps use fixed matte gray (`#999999`); floor slab edges and undersides use `#888888`. The presentation border uses darker gray (`#6e6e6e`) so it reads separately from the apartment floor. Room-facing wall spans and upward floor faces retain their editable finishes. Geometry determines the room-facing spans, including reversed walls and concave boundaries; this does not assign structural or boundary metadata. Only those finish surfaces accept paint drops, and exterior-only inspector sides show the fixed-gray treatment. Existing finish records remain intact.

## Imported models

Optional GLTF/GLB sources use Three.js `GLTFLoader` with a source cache keyed by URL. Instances clone skeletons and render resources, then normalize to catalog dimensions. Scaling axes independently makes catalog dimensions authoritative but can distort a model when dimensions have incorrect proportions. Empty or nonfinite bounds fail safely.

The procedural object remains visible while a model loads and is retained as a fallback on failure, with an error message. Generation tokens discard late loads for replaced or deleted objects; model installation waits until an active transform gesture finishes. The default catalog is fully procedural and needs no model download. URL syntax checks do not establish model licensing, host approval, CORS availability, or offline caching; real catalog integrations own those requirements.

## Controls and lighting

The **Sun** control now adjusts direction, elevation and strength. A full shell shadow
projection keeps sunlight entering through windows in cutaway views. See
[adjustable sunlight](sunlight.md) for the current rig, controls and verification;
the old warm studio pools described below are now disabled.

Left drag orbits the perspective camera, right drag pans, and the wheel zooms. A short left click raycasts furniture for selection, respecting visible opaque structure in front of it. Top view disables orbit rotation. Gizmos move along the floor, rotate around Y, and resize on local axes. Snap increments are 0.25 m, 15°, and 0.1 scale. Scale is clamped to the domain's `[0.1, 4]` range; dimensions and placement still pass domain checks. Quaternion-based yaw extraction preserves rotations beyond 90°.

Lighting combines a restrained hemisphere light, a warm shadow-casting key, two broad warm spotlights, cool fill and rim lights, and a PMREM environment made with Three.js `RoomEnvironment`. Light positions, shadow coverage, and studio fog follow the shell's center and size, including imported apartments away from the origin. Materials use standard physically based shading. This is an architectural presentation light rig, not baked global illumination, path tracing, or a photo-matched lighting solve.

`src/render/studio-renderer.ts` renders a linear half-float HDR scene, contact ambient occlusion (GTAO), subtle color grading/vignette, then one ACES/sRGB output pass. Glass, transparent wall fades, editor helpers, and distant studio scenery are excluded from the AO normal/depth pass. Top disables AO and grading. Horizon math is clamped to avoid nonfinite shading at grazing angles, and clear-depth pixels receive no AO.

`src/render/studio-stage.ts` presents the apartment on a tall beveled charcoal pedestal with a neutral gray cap, recessed foot, and fine brass trim. Its height is 32% of the widest structural footprint plus border, clamped to 2.8–5.5 m; its top meets the underside of the apartment's 14 cm floor slab. Perspective framing includes the entire pedestal and biases the target toward its combined bounds, while selected-entity focus and Top framing retain their editing behavior. A seamless sage floor and soft contact shadow anchor it. The camera-relative backdrop suggests distant stone forms, warm light and greenery with broad analytic falloffs: no repeating curtain bands, floor grid, image downloads or full-scene blur. Background and fog share the muted sage palette. All scenery follows the daylight cycle and remains disposable, unselectable presentation outside the scene document, quantities, and edit history. The legacy curtain and empty inlay group names remain available to scenery visibility integrations.

Selectable local sky backgrounds and their measured behavior are documented in [Skyboxes](skyboxes.md).

## Performance and lifecycle

Rendering is event-driven: scene, camera, selection, resize, and asset-load changes request a frame; there is no idle animation loop or orbit damping. Furniture groups are reused for transform-only edits. Asset/style changes rebuild the affected object, while a room/wall change rebuilds structure. `ResizeObserver` updates both cameras and canvas dimensions.

Balanced quality caps pixel ratio at 1.5 and uses a 2048² shadow map, up to 2× MSAA, and 16 AO samples. High quality caps pixel ratio at 2 and uses a 4096² shadow map, up to 4× MSAA, and 32 AO samples with stronger denoising, trading memory and render time for resolution. Geometry, materials, textures, controls, listeners, cached sources, postprocessing targets, and renderer resources have explicit disposal paths.

There is no instancing, mesh LOD system, compressed-texture pipeline, animation playback, or measured GPU performance guarantee. Repeated furniture owns separate meshes/resources; large imported assets can be expensive even when the scene meets domain count limits. The validation complexity cap bounds geometry checking, not GLTF triangle count or GPU memory. Actual browser observations and checks belong in `verification.md`.
