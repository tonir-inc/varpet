# Blueprint construction stage

Implemented 26 September 2026, Codex (GPT-6). The portal and existing architect
workflow share `src/ui/architect-stage.ts`. This is a temporary Three.js projection
of uploaded evidence and actual streamed events; it never writes scene data.

The source image lands on the drawing board and receives one scan. A `shell` event
provides the room and wall geometry that is traced above that source. Floors fill
and walls extrude only after the trace is visible. A soft directional sweep erases
the source sheet while catalog doors and windows slide into their openings. Other
furniture and placement events keep the existing workbench choreography. No shell
or furniture geometry is invented to fill gaps between service responses.

`ArchitectStageOptions.holdOnFinish` retains the final apartment for the portal's
review action. The legacy default still fades into the editor. Completion waits
for the current shell reveal, including a replacement received during that wait.
An emitted `done` phase also settles queued phases so a later frame cannot return
the heading to `checking`.

Openings use the same `makeOpening` and owned `OpeningAssetLoader` as the editor.
The shared catalog renderer preserves the modeled frame origin, hinge/sash pivots,
glass transparency and authored fixed mechanisms. A tap changes temporary opening
state only; keyboard buttons expose the same action. Repeated taps retarget the
280 ms animation from its current displayed angle. The stage's small mounting
translation stays outside the projection group, so an asynchronous catalog model
replacement cannot overwrite installation motion.

Motion and resource behavior:

- Reduced motion is observed both at startup and during construction. Existing
  jobs settle in their scheduled order; newly requested jobs settle immediately.
- A replacement shell cancels its old animation jobs, disposes its projection and
  invalidates late model loads through the renderer's existing disposal guards.
- The frame loop sleeps after construction or interaction. Idle scanning and
  perpetual camera/photo motion are absent. Resize, a new event or asset, and a
  tap request a frame.
- Keep the previous RAF timestamp during an active sequence. Resetting it after
  GPU/label rendering subtracts work from elapsed time and stretches animation.
- Cancel a losing completion timeout after `Promise.race`; leaving it scheduled
  keeps the stage rendering even though its actual work has finished.
- `dispose()` releases pending jobs, renderer/context, geometry/materials/textures,
  object URLs, opening cache, resize observer and media/pointer subscriptions.

Open `/blueprint-stage-qa.html` and select **Run construction checks**. This isolated
QA page uses the repository's existing Avani plan and scene and samples rendered
frames. It does not contact the architect service or mutate the user's project.
Use a Vite server with HMR disabled when other agents are editing simultaneously.

The source image is fitted beneath the returned shell using its aspect ratio and
shell bounds. This is presentation alignment, not pixel-calibrated registration;
the checked shell geometry remains authoritative. The page supports image-plan
textures; document rasterization is outside this stage.

Browser verification, Chrome, 26 September 2026:

```text
PASS uploaded plan lands through intermediate rendered positions
PASS no apartment is invented before the shell event
PASS traced footprint remains readable before walls rise
PASS walls extrude through intermediate rendered heights
PASS original blueprint erases progressively while the shell appears
PASS source sheet is fully removed after construction
PASS real catalog door is installed
PASS real catalog window is installed
PASS canvas tap toggles the visible door or window
PASS opening tap has an intermediate articulated pose
PASS rapid close/open retargets to the exact latest pose
PASS second tap closes all moving leaves exactly
PASS completed stage returns to idle rendering
PASS holdOnFinish keeps the apartment available for review
PASS all animation and opening previews preserve input geometry
PASS live reduced motion settles construction to exact final state
PASS replacement shell cancels old work without duplicate geometry
PASS reduced-motion completion also stays idle
PASS dispose releases canvas and motion subscriptions
COMPLETE 19 browser checks.
```

Focused command results:

```text
pnpm --filter @varpet/editor typecheck
tsc -p . — exit 0

pnpm --filter @varpet/editor test:architect
architect adapter check passed
Reconstruction proposal checks passed (41 assertions).

pnpm --filter @varpet/editor build
200 modules transformed; built in 393 ms
Existing Vite configuration and bundle-size advisories remain.

git diff --check
exit 0
```
