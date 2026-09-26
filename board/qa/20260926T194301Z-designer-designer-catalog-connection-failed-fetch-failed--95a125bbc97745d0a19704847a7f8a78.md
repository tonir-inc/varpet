---
id: "20260926T194301Z-designer-designer-catalog-connection-failed-fetch-failed--95a125bbc97745d0a19704847a7f8a78"
lane: "designer"
severity: "major"
status: "fixed"
title: "Designer 'catalog connection failed' (fetch failed): preview step ignores the configured catalog URL"
reported_by: "Sergey"
created: "2026-09-26T19:43:01.318714Z"
fixed_in: "4ccf5da"
---

**Steps**

Local demo: designer service started with VARPET_CATALOG_URL=http://127.0.0.1:8765/mcp (no Tailscale on the laptop). Ask 'can u put one chair in living room?'.

**Expected**

search_catalog finds checked chairs, previews them, proposes.

**Actual**

search_catalog returns {ok:false, message:'fetch failed'} after ~10 s whenever it has candidates (searches with 0 candidates succeed). Repro: packages/designer/src/catalog-vision.ts candidateSheet() with VARPET_CATALOG_URL set → ok in 62 ms; with it unset → 'fetch failed' UND_ERR_CONNECT_TIMEOUT after 10.5 s (falls back to the tailnet default http://100.107.246.46:8765/mcp). So the designer MCP tool process runs the preview step without VARPET_CATALOG_URL even though search uses the configured URL. Suspect the env passed to the varpet-designer MCP server (harness/designer.py designer_mcp_env / config) or the per-turn process. Workaround applied on Sergey's laptop: ~/.config/varpet/env VARPET_CATALOG_URL=http://127.0.0.1:8765/mcp. Our local catalog is healthy (search 0.7 s, show_candidates 0.03 s).

**Evidence**

![Screenshot 1](img/20260926T194301Z-designer-designer-catalog-connection-failed-fetch-failed--95a125bbc97745d0a19704847a7f8a78-1.png)

**Notes**

- 2026-09-26T19:51:08.074412Z: Update: probably not an env problem. Later failures are intermittent (one search with candidates + preview succeeded in 3.4 s), and the catalog slows to 6-8 s under concurrent requests, so the designer's 10-12 s timeouts trip - see 20260926T195100Z-catalog-catalog-search-slows. The env fallback to the tailnet URL is real but may not be what users hit; verify after the catalog latency fix. Severity lowered to major.

- 2026-09-26T20:01:49.966123Z: Env hypothesis DISPROVED: captured the designer tool process env during a turn - VARPET_CATALOG_URL=http://127.0.0.1:8765/mcp is set. The fetch failures matched the catalog slowdown (fixed in the catalog lane: in-memory embedding matrix). The latest turn has no fetch failures. Candidate for close as duplicate if it doesn't recur.

- 2026-09-26T20:23:34.830034Z: All designer catalog calls (search, previews, broker) use one resolver of VARPET_CATALOG_URL (empty = unset); catalog fan-out capped at 2 (get_item details now 2 at a time: check here if searches get slower); timeouts return a retryable 'catalog busy, retry' message; search_catalog keeps checked slots when previews time out
