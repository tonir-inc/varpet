# Browser rendering

The editor uses Three.js `WebGLRenderer` and the same live scene for perspective and orthographic top views. It produces an editable architectural visualization with procedural furniture. It does not claim photographic reconstruction, measured accuracy from photos, or physically simulated lighting. No generated image or 2D-preview artifact is part of this implementation.

## Projection and geometry

`src/render/viewport.ts` projects the authoritative JSON into Three.js groups keyed by scene object IDs. Selection, camera state, and transient drag previews stay outside scene JSON. On pointer release, the viewport returns a transform patch to the application; the command processor decides whether it can commit. The viewport then restores the authoritative transform, including after a rejected edit.

`src/render/structure.ts` triangulates and extrudes simple floor polygons into 14 cm slabs. Walls are thick segments split around explicit openings. Door frames, open leaves, window frames/glass, skirting, and floor seams are procedural. Door leaves are presentation geometry; validation checks the wall opening rather than the leaf swing. Floor and wall data are imported and read-only in furniture tools.

Full, hidden, and cutaway wall modes change visibility only. Cutaway chooses lower walls based on the camera's relation to the floor bounds; it is a visibility heuristic rather than structural editing or a full occlusion solver. Top view uses an orthographic camera over the same 3D meshes.

`src/render/assets.ts` builds nine furniture kinds using rounded boxes, cylinders, and low-resolution spheres, with separate upholstery, wood, metal, and plant materials. Each result is normalized to catalog dimensions, centred in XZ, and grounded at Y=0. These shapes are original approximations; product names and demo prices are illustrative.

## Imported models

Optional GLTF/GLB sources use Three.js `GLTFLoader` with a source cache keyed by URL. Instances clone skeletons and render resources, then normalize to catalog dimensions. Scaling axes independently makes catalog dimensions authoritative but can distort a model when dimensions have incorrect proportions. Empty or nonfinite bounds fail safely.

The procedural object remains visible while a model loads and is retained as a fallback on failure, with an error message. Generation tokens discard late loads for replaced or deleted objects; model installation waits until an active transform gesture finishes. The default catalog is fully procedural and needs no model download. URL syntax checks do not establish model licensing, host approval, CORS availability, or offline caching; real catalog integrations own those requirements.

## Controls and lighting

Left drag orbits the perspective camera, right drag pans, and the wheel zooms. A short left click raycasts furniture for selection, respecting visible opaque structure in front of it. Top view disables orbit rotation. Gizmos move along the floor, rotate around Y, and resize on local axes. Snap increments are 0.25 m, 15°, and 0.1 scale. Scale is clamped to the domain's `[0.1, 4]` range; dimensions and placement still pass domain checks. Quaternion-based yaw extraction preserves rotations beyond 90°.

Lighting combines a restrained hemisphere light, a warm shadow-casting key, cool fill and rim lights, and a PMREM environment made with Three.js `RoomEnvironment`. Light positions, shadow coverage, and studio fog follow the shell's center and size, including imported apartments away from the origin. Materials use standard physically based shading, sRGB output, and ACES filmic tone mapping. This provides readable form and contact shadows; it is not baked global illumination, path tracing, or a photo-matched lighting solve.

`src/render/studio-stage.ts` presents the apartment on a beveled charcoal pedestal with a limestone cap, recessed foot, and fine brass trim. Its top meets the underside of the apartment's 14 cm floor slab. The pedestal adapts to structural bounds and floor elevation; perspective framing includes the base while selected-entity focus and Top framing retain their editing behavior. The surrounding charcoal floor uses a procedural soft contact shadow. All stage geometry is disposable, unselectable presentation scenery outside the scene document, quantities, and edit history.

## Performance and lifecycle

Rendering is event-driven: scene, camera, selection, resize, and asset-load changes request a frame; there is no idle animation loop or orbit damping. Furniture groups are reused for transform-only edits. Asset/style changes rebuild the affected object, while a room/wall change rebuilds structure. `ResizeObserver` updates both cameras and canvas dimensions.

Balanced quality caps pixel ratio at 1.5 and uses a 2048² shadow map. High quality caps pixel ratio at 2 and uses a 4096² shadow map, trading memory and render time for resolution. Geometry, materials, textures, controls, listeners, cached sources, and renderer resources have explicit disposal paths.

There is no instancing, mesh LOD system, compressed-texture pipeline, animation playback, or measured GPU performance guarantee. Repeated furniture owns separate meshes/resources; large imported assets can be expensive even when the scene meets domain count limits. The validation complexity cap bounds geometry checking, not GLTF triangle count or GPU memory. Actual browser observations and checks belong in `verification.md`.
