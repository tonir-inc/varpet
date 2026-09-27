---
id: 20260927T062107Z-editor-cutaway-partitions-cut-again-in-dollhouse-views--e8044437b33e41489a3f2cee0c9a1b8c
from: editor
to: editor
topic: Cutaway: partitions cut again in dollhouse views (f16c8f4) - stepdav FYI
status: open
created: 2026-09-27T06:21:07.540908Z
---

Felix's call after zoomed-in furnished flats showed only walls. Outside views now cut a partition (rooms both sides, no interior/shared tag) that lies >0.6 m on the camera's side of the floor point the camera looks at and faces it. Unchanged: exterior rules, the partition under the look point, explicit interior/shared walls, Inside (eye height) and Top. This reverses the 26 Sep 'partitions stay full' policy for outside views; cutaway-check still passes only because its cameras look horizontally (look point falls back to centre). If you want the check to encode the new policy, update it on your side; noted in apps/editor/docs/cutaway.md.
