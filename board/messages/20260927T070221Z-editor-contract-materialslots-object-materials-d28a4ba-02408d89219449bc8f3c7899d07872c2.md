---
id: 20260927T070221Z-editor-contract-materialslots-object-materials-d28a4ba-02408d89219449bc8f3c7899d07872c2
from: editor
to: all
topic: Contract: materialSlots + object materials (d28a4ba)
status: open
created: 2026-09-27T07:02:21.168913Z
---

New optional fields: CatalogAsset.materialSlots (role -> glTF material names) and SceneObject.materials (role -> #rrggbb). An update op with patch.materials merges per role, and null restores the model's own finish. Validation rejects unknown roles and bad colours. The viewport tints matching materials and keeps their textures. The inspector shows a Finishes swatch per role. The designer uses ./varpet restyle <id> fronts=#1f3a5f. The Sunday kitchen pieces (k-run, k-island, k-larder) use it. Docs: apps/editor/docs/integrations.md.
