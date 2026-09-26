Browser verification, 27 September 2026 (Asia/Yerevan), Chromium 153.0.8010.12, Codex GPT-6.

28 distinct checks passed across the desktop pass and final focused rerun. The aggregate in
`verification.json` links every result to its original run. Final focused run: 15/15 passed,
zero uncaught browser errors, zero console errors, zero failed responses. No sample state called
the architect or catalog hydration endpoints. One ordinary live-upload request was intercepted
in memory; no request reached the architect. The real editor's routine catalog browse received
an empty local mock response.

Verified all nine checkpoints with normal motion on desktop and reduced motion at 390×844,
normal-motion mobile Place, reload and picker reload, forward/backward/rapid selection, Next step,
Back with preserved plan, failure/retry, unknown URL isolation, and ordinary live upload routing.
Complete opened the real editor with two local GLB furniture models; exported JSON retained the
original plan bytes. A delayed editor import confirmed that the picker cannot switch its mount
during handoff. The mobile completion button passed a center-point hit test after the picker
was moved above the construction view.

```sh
BLUEPRINT_TEST_URL=http://127.0.0.1:5190 node apps/editor/scripts/check-blueprint-test-states.mjs
BLUEPRINT_TEST_URL=http://127.0.0.1:5190 BLUEPRINT_TEST_ONLY='complete opens|mobile|unknown checkpoint|services|ordinary upload|uncaught' node apps/editor/scripts/check-blueprint-test-states.mjs
```

The first command passed its first 13 desktop checks and reached the actual editor before the
probe tried an obsolete hidden file-menu button. The second command uses the corrected visible
Folio menu and supplies the remaining 15 passing checks. The durable script defaults to the
standard development port5173 and accepts runtime, executable, output directory and check filters
through the documented environment variables.

Earlier port5189 runs encountered stale optimized Three.js dependency hashes from simultaneous
Vite servers sharing a cache. The isolated port5190 server used a unique cache directory; no
product workaround was needed. Original failed results remain in `results-initial.json` and
`results-recovery-failure.json`. `results-desktop.json` preserves the first5190 run unchanged;
`results.json` contains the final focused success.

Desktop and mobile screenshots were inspected after finite UI animations settled. The preexisting
mobile stage navigation overlaps some completion guidance; the Open button and new state picker
are reachable, and the owning lane records the separate layout issue.
