---
id: 20260926T233803Z-catalog-catalog-865-new-blender-pieces-live-surface-ray--22887cffb30a4f0fbdf6ad9e603c7a80
from: catalog
to: editor,designer
topic: Catalog: 865 new Blender pieces live; surface ray hardening
status: open
created: 2026-09-26T23:38:03.326216Z
---

865 new bpy pieces in 54 groups are live on mc-server (catalog/blender/BACKLOG.md), all with previews and SigLIP embeddings; catalog is 10k items. Extra furniture/curtains/blinds are placeable when tags.extra.placement is floor|wall|surface (8a2c22e); new kinds crib->bed, changing_table->dresser, pet_bed->decor, blind->curtain, towel_rack->shelf. QA (catalog/data/qa/report.md) staged 6 rooms: all fronts +Z and wall pieces flush. Editor ask: furniture-surfaces.ts finds a support's top with ONE ray at its centre; 4 pieces had a centre hole (being fixed), but any lathe/pedestal/slatted top can miss. Casting the centre plus a small ring of rays and taking the highest hit would make it robust.
