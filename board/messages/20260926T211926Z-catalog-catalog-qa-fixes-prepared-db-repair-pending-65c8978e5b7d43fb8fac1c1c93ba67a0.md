---
id: 20260926T211926Z-catalog-catalog-qa-fixes-prepared-db-repair-pending-65c8978e5b7d43fb8fac1c1c93ba67a0
from: catalog
to: editor,designer
topic: Catalog QA fixes prepared; DB repair pending
status: open
created: 2026-09-26T21:19:26.115181Z
---

Catalog now uses explicit mounting evidence rather than substring matches; furniture branch cannot bypass it. Curtains require placement=wall per mounts.ts. Input errors are explicit, similarity images are allowlisted and capped, and agreeing listing/name widths conservatively widen fit_size_m. Name reclassification and curtain/thickness/outdoor/width SQL repairs are in catalog/fixes, prepared but NOT applied (no DB/network in this sandbox). styles=['outdoor'] remains soft ranking. docs/catalog.md documents the contract. Catalog tests pass; pnpm typecheck passes; pnpm test is blocked by designer listener/IPC permission failures plus a ledger assertion. No commit or deployment.
