# Catalog opening previews

The editor and blueprint construction stage use the authored models from `catalog/openings` for stock door and window previews. Vite emits their GLBs as versioned production assets. Interior doors use the white flush model; entrance doors use the armored model. Unspecified windows preview as the PVC pair in casement mode. Explicit fixed, sliding, double and tilt mechanisms remain respected. The inspector still identifies unspecified types as provisional, and previewing an opening never writes a mechanism into the project.

In the editor viewport, an explicit `Opening.assetId` takes precedence over these stock defaults. Its catalog model and mechanism survive resize previews; unknown IDs keep the procedural fallback. Stock loading is skipped for assigned IDs so asynchronous model loads cannot replace the chosen asset.

Models retain their bottom-centre origin and scale to the wall aperture and thickness. Named leaf/sash meshes and their handles move together around the manifest pivots; frames stay fixed. PVC tilt uses its bottom sash rail. Explicit frame width, leaf thickness or a raised threshold retains the existing dimension-driven geometry because a stock model cannot faithfully represent those custom dimensions. Supported procedural fallbacks remain available if an asset fails to load.

Tap a door or window in Select to open it, then tap again to close. Window dragging and resize handles remain direct manipulation. Shift selection and Move do not open a door. Preview angles remain temporary viewport state. The existing demand-driven animation loop owns playback and settles immediately when reduced motion is active.

Verification on 2026-09-26: `opening-assets-qa.html` loads eight stock variants and checks that each moving mesh changes pose and returns exactly to its closed matrix. Chrome native pointer checks exercised the default door and PVC window from closed to open and back; source JSON remained unchanged. Existing opening preview (49), projection motion (16), sun occluder (25), and inspector opening (12) assertions passed. The production build emitted the catalog GLBs successfully. The source cache and model instances release independently; rebuilding a preview cancels late asset attachment through its disposed fallback geometry.

Default PVC window fitting (26 September 2026): fit named parts to the aperture
before attaching the moving sashes. Frame and sash profiles remain 65 mm, the
centre mullion 80 mm, and handles retain physical dimensions at ordinary sizes.
Only exceptionally small apertures compress profiles to leave a positive glass
area. Sills span the host wall; wall thickness no longer enlarges the whole sash.
The parent applies hinge/swing reflections only, so opening a window cannot squash
its panel. The source aperture, position, and metadata remain unchanged. The
layout follows `catalog/openings/build.py`; changes to that model's part names or
construction must update `window-asset-fit.ts` too. Other stock mechanisms retain
their existing fitting path.

Verification on 2026-09-26: `window-proportions-qa.html` passed 224 geometric
assertions over 32 aperture sizes (0.2–3.6 m wide, 0.2–2.1 m high), including
frame dimensions, sill alignment, rigid sash motion and unchanged input data.
At 2.7 m width the vertical profile measures 65 mm, previously 117 mm. Native
Chrome inspection confirmed closed/open appearance; the existing catalog QA
passed all eight mechanisms. Untargeted `pnpm test`, `pnpm typecheck`, and the
editor production build passed. Logs: `output/window-proportions/`.
