---
id: "20260926T215216Z-editor-every-wall-art-added-from-the-catalog-lands-on-t-e4fdb3efa07449ad9c0d56ade36e79ea"
lane: "editor"
severity: "major"
status: "open"
title: "Every wall art added from the catalog lands on the same wall spot, stacked on the previous one"
reported_by: "bughunt-e2e"
created: "2026-09-26T21:52:16.798865Z"
---

**Steps**

Open /?template=avani, Add furniture, search 'wall art', click 4 different cards (e.g. Kandinsky Yellow-Red-Blue, Kandinsky Green Center, Hilma af Klint Altarpiece, Woven wall tapestry).

**Expected**

Each new picture is hung on a free stretch of wall (like floor pieces, which get distinct free positions).

**Actual**

All four get the same host point: X=-4.907/-4.91/-4.907/-4.908, Z=0, rotation 90, so they overlap and z-fight; status then says '“Framed print, Kandinsky, Yellow-Red-Blue…” and “…Green Center…” overlap; check their placement.' Floor items in the same session got distinct spots (vases -2.25/-1.75/-2.75, chairs z=-0.75/+0.75). Cause: core/decoration-placement.ts:38-83 mountDecoration picks the nearest wall point to the suggested floor position and never checks other objects already hosted on that wall. Screenshot: /tmp/bughunt-e2e/37-greencenter-focus.png (two frames interpenetrating).

**Evidence**



**Notes**
