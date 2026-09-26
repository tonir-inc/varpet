---
id: "20260926T210845Z-designer-editor-replaces-every-designer-service-validatio-686b53498b7a4747aab26aa06b8b786d"
lane: "designer"
severity: "minor"
status: "fixed"
title: "Editor replaces every designer-service validation error with 'Designer service returned HTTP 400.' (e.g. requests over 16000 chars)"
reported_by: "bughunt-designer-service"
created: "2026-09-26T21:08:45.352662Z"
fixed_in: "afb2bb2"
---

**Steps**

Type or paste a message of 16001-20000 characters into the designer box (textarea maxlength=20000), or let queue()/followUp() build one, then send.

**Expected**

Either the client limit matches the server (16000), or the server's message ('request must contain 1-16000 characters') reaches the user.

**Actual**

The server returns HTTP 400 with an NDJSON body {type:error, message:'request must contain 1–16000 characters'} (harness/designer_context.py:7,22-24, checked in do_POST designer_service.py:571-575). apps/editor/src/adapters/designer-http.ts:227 throws 'Designer service returned HTTP 400.' without reading the body, so this message and every other validation message are lost. Client limits allow 20000 (designer-panel.ts:293 queue slice, :412 textarea maxlength, designer-http.ts:198). Repro: POST a 16001-char request to http://127.0.0.1:8787/designer/propose -> 400 with that message.

**Evidence**



**Notes**

- 2026-09-26T23:22:18.142951Z: Adapter shows the service's NDJSON error message on non-2xx
