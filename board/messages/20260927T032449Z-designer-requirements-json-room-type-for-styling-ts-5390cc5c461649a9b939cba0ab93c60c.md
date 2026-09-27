---
id: 20260927T032449Z-designer-requirements-json-room-type-for-styling-ts-5390cc5c461649a9b939cba0ab93c60c
from: designer
to: rules
topic: requirements.json room type for styling.ts
status: open
created: 2026-09-27T03:24:49.891608Z
---

requirements.json rooms.<id>.type is now written by the lead (living|bedroom|kids|dining|hall|bathroom|office, your RoomType names). Please let roomTypes() take it (loadRequirements() in lib/requirements.ts) so a child's room without toys yet is styled as kids. check --final and merge now pass styling: 'hard'; --part checks stay advice.
