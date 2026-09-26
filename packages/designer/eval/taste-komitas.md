# Komitas furnishing contradictions — 26 September 2026

[Derived scope] This patch removes two contradictions: immutable/fixed structures do not need furniture style metadata, and the absence of a second candidate does not invalidate the first checked candidate. Walls, doors, collision, walkway and final request checks remain authoritative. A singleton is explicitly disclosed in the saved proposal rationale.

[Implemented] The children's program searches actual bed, desk, chair, shelf, wardrobe, cabinet and lamp kinds. It generates sleep, study and storage groups, checks headboard support, desk facing/reach, task lighting, physical access and a contiguous play area, and retains only complete proposals within the declared budget. Wardrobe panels cannot satisfy usable wardrobe storage. An incidental mention of children does not convert a living room into a bedroom.

[Assumed design priors] A school-age child's play area is a clear 1.2 × 1.2 m square. When a furnishing request supplies no recognized style, the planner proposes a coherent modern default and labels it as assumed in tool knowledge; it does not require a clarification merely for missing style. These are product priors, not measured customer preferences.

[Benchmark protocol] Nine published `.scene.json` files from the frozen Komitas cohort, excluding drawn showcase variants. Each of four requests begins from the original scene, initial catalog snapshot and a fresh conversation: living furnishing, the explicit double-bed/two-nightstand/wardrobe set, a named kids' room for one eight-year-old under 300,000 ֏, and adding a sofa to the living room. The kids target is the second bedroom when present, otherwise the primary bedroom. This is a clarified fresh-request benchmark, not the earlier sequential conversation benchmark or its move-existing-sofa request. FAST on/off is the actual service environment; unsupported request forms may fall back to the normal planner.

[Derived grading] The original independent Komitas physical/clearance rubric is retained. A pass requires an actual editor-accepted proposal, requested furniture, catalog purchases, no worsened preferred function clearance or sub-0.75 m route, and verified model/profile/path. Kids additionally require budget compliance and a clear 1.2 m square, measured independently using a summed-area raster. Every input scene and complete catalog is hashed against its initial state. Questions, messages, declines and incomplete searches are failures, not successful furnishing.

[Measurement setup] `gpt-6-astra`, low effort, `without-place`, `compact-base`, at most four live conversations. Source revision, service worktree, runner hash, input hashes and catalog snapshot hash are recorded in each manifest. Only owned spare ports are used. Search remains connected to the live catalog; inventory changes between times are a limitation of the paired measurement. Raw failed setup attempts (catalog-load timeout and missing installed `gltf-validator`) are excluded, retained locally, and are not counted as product outcomes. Locked dependencies were installed before the measured run.

Results and verification will be recorded after both runs complete.

```sh
python3 packages/designer/eval/taste-komitas-batch.py \
  --output /tmp/taste-komitas-measured-before --catalog /tmp/taste-catalog.json \
  --normal-port 8821 --fast-port 8822
pnpm --filter @varpet/designer exec tsx eval/taste-komitas-grade.ts /tmp/taste-komitas-measured-before
```
