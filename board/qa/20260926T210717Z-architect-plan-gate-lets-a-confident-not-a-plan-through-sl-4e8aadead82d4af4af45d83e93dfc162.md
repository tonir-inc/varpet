---
id: "20260926T210717Z-architect-plan-gate-lets-a-confident-not-a-plan-through-sl-4e8aadead82d4af4af45d83e93dfc162"
lane: "architect"
severity: "minor"
status: "open"
title: "Plan gate lets a confident 'not a plan' through: slightly malformed verdict becomes is_plan=true, and is_plan=false below 0.6 still builds"
reported_by: "bughunt-architect"
created: "2026-09-26T21:07:17.969206Z"
---

**Steps**

cd harness && .venv/bin/python /tmp/bughunt-architect/gate.py (feeds classify_plan fake model outputs for an 800x600 image)

**Expected**

A verdict that says is_plan=false with high confidence rejects even if the reason is long or the JSON is fenced; a 'not a plan' answer does not start an 8-minute build just because confidence is 0.59.

**Actual**

reason of 301 chars with is_plan=false conf 0.97 -> is_plan=True conf=0.0 kind='unknown' (build proceeds); same verdict wrapped in a json code fence -> build proceeds; extra key also fails (Verdict extra='forbid', strict, reason max 300: plan_gate.py:34-39) and plan_gate.py:98 turns any ValidationError into unavailable() = is_plan True. is_plan=false conf 0.59 -> build proceeds (serve.py:232 threshold 0.6). Empty/malformed model output also -> build. Only the model call failing should fail open; a parseable is_plan=false should be tolerated (truncate reason, strip fences, ignore extras).

**Evidence**



**Notes**
