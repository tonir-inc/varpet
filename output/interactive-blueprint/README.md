# Interactive blueprint browser verification

Verified in Chromium on 2026-09-27 with the local editor dev server. The architect stream is stubbed with the repository's Avani demo shell; no architect/model service runs and no user project data is changed.

Commands (from the repository root):

```sh
node output/interactive-blueprint/probe.cjs
node output/interactive-blueprint/regression.cjs
node output/interactive-blueprint/blur-cursor.cjs
```

`probe.cjs` passed **59/59** checks, covering the actual upload → construction → editor workflow in normal and reduced motion:

- Native mouse orbit, wheel zoom, right-button pan, Space drag, held W and arrow-key travel, immediate release, and released cursor feedback.
- Camera continuity when interrupting the entry tilt, receiving the shell, completing the stream, and resizing. Reset recovers after substantial travel, with reset position error below 4×10⁻¹⁵ m in this run.
- Actual visible opening ray pick, click articulation, and no click activation after an orbit drag.
- Native CDP one-finger orbit, two-finger pinch/pan, no unintended opening activation, and released cursor feedback.
- Camera input remains usable under reduced motion; completion returns to zero idle frames over the sampled 550 ms interval.
- Navigation stays clear of the build/completion footer on desktop and at 390×844; the mobile completion screenshots were visually reviewed.
- The finished apartment opens in the real editor, and the disposed stage stops rendering and responding to input.

Final machine-readable details and camera samples are in `results.json`; all checks pass with zero page errors, console warnings, or console errors. Screenshots use `normal-` and `reduced-` prefixes. `normal-mobile-complete.png` and `reduced-mobile-complete.png` show the 390px completion layout.

`regression.cjs` ran the existing `/blueprint-stage-qa.html?autorun` unchanged: **19/19** checks passed, including shell reveal, real catalog openings, articulation interruption, live reduced motion, replacement shells, geometry immutability, idle rendering, and disposal. See `regression.json`.

`blur-cursor.cjs` exercises the release sequence separately on a fresh page: right drag → Space drag → keyboard movement → blur during an active drag → release away from the canvas → hover return → a new drag. `blur-cursor.json` records cursor/class state and camera coordinates before/after these transitions.

The probe scripts use rendered-mesh callbacks for telemetry. They do not add production debug hooks or modify existing tests, fixtures, or schemas. The earlier `first-pass-results.json` and `initial-mixed-load-results.json` are historical diagnostic runs; `results.json` is the final result.
