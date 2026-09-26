# Blueprint prefetch browser verification

Command: `node output/blueprint-prefetch-verification/probe.cjs`

Run date: 2026-09-27. Browser: 153.0.8010.12. Isolated Vite port: 5186.

Result: **13 checks passed; 0 page errors; 0 real architect requests.**

A valid 120×90 test PNG started `/flat` at 36.2 ms; reveal enabled Submit at 4179.6 ms, a 4.14 s head start before any user delay.

Checks:

- picker starts exactly one request before reveal ends or Submit
- normal-motion handoff completes before buffered shell replay; repeated Submit is ignored
- Back during normal handoff prevents queued shell and progress replay
- drop prefetch buffers progress and shell, then replays in order on Submit
- pasted plan completed before Submit opens review without a second request
- replacing a plan aborts old prefetch and stale events never reach new stage
- photo add and removal each replace prefetch using current evidence only
- multi-file drop starts one prefetch with the selected plan and all room photos
- failed prefetch is handled before Submit; Submit and explicit retry each start fresh work
- invalid format, empty, oversized, and undecodable plans never start work
- invalid replacement or photo preserves a valid in-flight prefetch
- Back cancels current work; late callbacks stay inert and resubmission starts fresh
- disposing landing aborts prefetch and late events never create a stage

The actual stage and UI run in Chromium. The probe wraps the served stage factory to observe callbacks, intercepts every `/flat` call with controlled NDJSON streams, blocks all other external/API requests, and disables the Vite HMR connection. No app or fixture files are changed. Fonts use local fallbacks because remote font requests are blocked. Some cancellation checks deliberately keep mocked streams alive after abort to verify stale callbacks stay inert.

Visually checked desktop plan reveal / construction handoff and 390px completed mobile review. Screenshots and detailed machine-readable results are in this directory.
