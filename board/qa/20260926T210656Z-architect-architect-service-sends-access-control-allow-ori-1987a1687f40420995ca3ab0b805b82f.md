---
id: "20260926T210656Z-architect-architect-service-sends-access-control-allow-ori-1987a1687f40420995ca3ab0b805b82f"
lane: "architect"
severity: "major"
status: "open"
title: "Architect service sends Access-Control-Allow-Origin: * so any website can start /flat builds and read /runs"
reported_by: "bughunt-architect"
created: "2026-09-26T21:06:56.005206Z"
---

**Steps**

curl -si -X OPTIONS http://127.0.0.1:8788/flat ; curl -si http://127.0.0.1:8788/runs

**Expected**

CORS limited to the editor origins (localhost:5173/5174), like the catalog service does.

**Actual**

serve.py:158-161 sends Access-Control-Allow-Origin: * with POST and Content-Type allowed on every response, including the preflight (do_OPTIONS serve.py:163). Any page open in the user's browser can POST /flat (an 8-minute gpt-6-astra session on the user's ChatGPT/Codex account, unbounded in count) and read the NDJSON stream, /runs and /pieces. Confirmed: GET /runs response carries 'Access-Control-Allow-Origin: *'.

**Evidence**



**Notes**
