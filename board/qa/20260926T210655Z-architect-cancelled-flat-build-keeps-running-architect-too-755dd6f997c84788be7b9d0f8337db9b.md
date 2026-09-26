---
id: "20260926T210655Z-architect-cancelled-flat-build-keeps-running-architect-too-755dd6f997c84788be7b9d0f8337db9b"
lane: "architect"
severity: "major"
status: "open"
title: "Cancelled /flat build keeps running: architect tool calls after a client disconnect are never answered, Codex session hangs"
reported_by: "bughunt-architect"
created: "2026-09-26T21:06:55.874547Z"
---

**Steps**

Editor blueprint flow starts a speculative POST /flat on plan choose and aborts/restarts it on every photo add/remove (apps/editor/src/portal/blueprint.ts:104-113,137,147,171; blueprint-build.ts:53 controller.abort()). Server side, run_session keeps going after the socket closes. Seen live 27 Sept 00:57-01:06 in the architect service log (scratchpad/architect.log) and ps.

**Expected**

A disconnected /flat stops its Codex session (or at least keeps answering tool calls and finishes cleanly), so aborted speculative builds don't pile up.

**Actual**

codex_tools.py:64-65 calls router.on_call (session.py:480 -> activity -> emit -> serve.py:224 wfile.write) OUTSIDE the inner try; after disconnect it raises BrokenPipeError, which escapes Router.answer before client._write_message (codex_tools.py:73), so the tool call NEVER gets a result. Log: 'Exception in thread Thread-35 (answer) ... codex_tools.py line 65 in answer ... BrokenPipeError' (twice). The architect thread then waits until quiet_guard's 4-min stall x2 retries (codex_runner.py:85,234-244). Other disconnect paths are swallowed too (tool exceptions -> codex_tools.py:69, builder activity -> codex_runner.py:204, dispatch.py:123), so the session is not stopped. Live: 3 'codex app-server' children of the serve process at once (pids 38655/38856/39349, 9, 6 and 4 min old); run screenshot-...-005734 has no report.json and its last file write was 01:02. No concurrency cap either (ThreadingHTTPServer, serve.py:252), so every photo change can add another 6-lane session.

**Evidence**



**Notes**

- 2026-09-26T21:52:29.712051Z: bughunt-e2e 01:52: reproduced again - a PDF upload at 01:39:46 whose browser context closed ~5 s later still has its codex app-server child (pid 73173, parent serve 38127) alive 12+ min later; run floor-plan-20260927-013946-f33fb4694f9f wrote shell.json 01:41 and add_fixtures.py 01:42 after the disconnect.
