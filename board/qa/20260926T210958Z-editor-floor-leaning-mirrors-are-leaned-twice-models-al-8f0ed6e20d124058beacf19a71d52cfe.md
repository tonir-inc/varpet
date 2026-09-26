---
id: "20260926T210958Z-editor-floor-leaning-mirrors-are-leaned-twice-models-al-8f0ed6e20d124058beacf19a71d52cfe"
lane: "editor"
severity: "minor"
status: "open"
title: "Floor-leaning mirrors are leaned twice: models already tilted 7 deg, editor adds another 0.06 rad"
reported_by: "bughunt-editor-core"
created: "2026-09-26T21:09:58.685829Z"
---

**Steps**

Place extra:wall-decor:mirror-floor-leaning-oak-60x180 (size [0.6,0.254,1.791]) on a wall.

**Expected**

The catalog model is already posed leaning (catalog/data/extra/wall-decor/_work/build.py:148 lean(deg=7), entry text 'leans against the wall (~7 deg)'), so the editor should not tilt it again.

**Actual**

furniture-bounds.ts:4-6 wallMirrorLean returns 0.06 rad for any hosted mirror taller than 1.4 m and render/assets.ts:418 rotates the model by it, total ~10.4 deg; footprint depth grows from 0.254 to 0.361 m (furnitureDimensions) so the mount gap and floor-fit use the wrong box.

**Evidence**



**Notes**
