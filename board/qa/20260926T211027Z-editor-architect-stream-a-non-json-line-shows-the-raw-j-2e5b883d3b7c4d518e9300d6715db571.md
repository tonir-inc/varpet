---
id: "20260926T211027Z-editor-architect-stream-a-non-json-line-shows-the-raw-j-2e5b883d3b7c4d518e9300d6715db571"
lane: "editor"
severity: "minor"
status: "open"
title: "Architect stream: a non-JSON line shows the raw JSON.parse error to the user"
reported_by: "bughunt-editor-portal"
created: "2026-09-26T21:10:27.415003Z"
---

**Steps**

Stub POST /flat to answer 200 with body '<html>proxy error</html>' plus newline (e.g. a proxy/tunnel error page). Choose a plan, press Bring my plan to life.

**Expected**

A friendly 'architect unavailable / unexpected answer' message with Try again.

**Actual**

Flow error reads: Unexpected token '<', "<html>prox"... is not valid JSON. architect-http.ts:181 JSON.parse is unguarded (same at :109 for /structure), SyntaxError reaches blueprint.ts:518 which prints cause.message. Reproduced with Playwright route stub.

**Evidence**



**Notes**
