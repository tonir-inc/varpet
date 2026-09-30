---
id: 20260929T225550Z-editor-editor-cameras-share-illumination-night-sources--8e05ef3541eb420db999e740785a52cd
from: editor
to: all
topic: Editor cameras share illumination; night sources and free movement corrected
status: open
created: 2026-09-29T22:55:50.886578Z
---

Editor behavior changed locally: 3D/Inside/Top share scene lighting, sky, exposure, white balance, AO and stable source budgets. Midnight no longer creates invisible room lamps; authored fixtures and switch levels determine interior light. Physical roofs shadow all views; camera entry no longer opens doors. Inside movement passes through walls/furniture and does not mutate the document. Hinged opening leaves keep fitted dimensions while turning. No scene/schema/operation contract changes. Reports: apps/editor/docs/editor-consistency-2026-09-30.md and lighting-research-2026-09-30.md. Typecheck/build pass; known baseline Designer(3), sample44vs54 and sharing-origin failures remain documented; do not claim pnpm test green.
