---
id: "20260926T210718Z-architect-architect-http-errors-404-411-413-lack-cors-edit-7eca738820c7407c84b4eba5f021aecc"
lane: "architect"
severity: "minor"
status: "open"
title: "Architect HTTP errors: 404/411/413 lack CORS (editor shows 'architect unavailable'), bad Content-Length drops the connection, short body hangs a thread"
reported_by: "bughunt-architect"
created: "2026-09-26T21:07:18.327965Z"
---

**Steps**

curl -si -X POST http://127.0.0.1:8788/plan-check -H 'Origin: http://localhost:5173' -H 'Content-Length: 50000000' --data-binary x ; curl -si -X POST http://127.0.0.1:8788/plan-check -H 'Content-Length: abc' -d x

**Expected**

JSON error with CORS headers the editor can read; 400 for a bad Content-Length; a read timeout.

**Actual**

serve.py:206,210 use send_error -> text/html with no Access-Control-Allow-Origin, so browser fetch rejects with TypeError and blueprint.ts:516 shows 'The architect is unavailable'. Content-Length 'abc': serve.py:208 int() raises ValueError, curl gets empty reply (exit 52), traceback in log. No socket timeout on the handler: a request that declares N bytes and sends fewer blocks rfile.read (serve.py:214/228) forever. /plan-check 400s echo internals ('KeyError: \'data\'', binascii text: serve.py:217).

**Evidence**



**Notes**
