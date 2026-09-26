---
id: "20260926T211049Z-catalog-catalog-find-similar-image-fetches-any-url-and-o-36ace52005844fc4a7033ea8baacba98"
lane: "catalog"
severity: "major"
status: "open"
title: "Catalog find_similar(image=...) fetches any URL and opens any local path on the VM (blind SSRF, unbounded read)"
reported_by: "bughunt-security"
created: "2026-09-26T21:10:49.449802Z"
---

**Steps**

/tmp/bughunt-security/mcp_call.sh '{"image":"http://127.0.0.1:18999/red.png","limit":1}' (a listener on 18999 logged 'GET /red.png' from the catalog process and the tool returned results). Also '{"image":"/tmp/bughunt-security/red.png"}' returns results, so it reads local files.

**Expected**

The image argument only takes an uploaded image (bytes or data URL, size-capped), or at least only http(s) URLs to public hosts with a byte cap and no redirects to private addresses. Never a server filesystem path.

**Actual**

embed_siglip_query.py:49-53: any string starting with 'http' goes to urllib.request.urlopen(url, timeout=20).read(). That follows redirects and has no size cap. Anything else goes straight to PIL Image.open(path). mcp_server.py:118-141 passes the MCP argument through unchanged (search.py:299-301). The VM service at 100.107.246.46:8765/mcp has no auth, and the tailnet (Felix's) is shared. So any tailnet peer or agent can make the VM send GETs to its own localhost-only services (Grafana, llama.cpp, honcho, Postgres port probe via error/timing) and probe local files that decode as images. A large or slow body gets read fully into memory under MemoryMax=2G, so the service can be OOM-killed and the watchdog restart-loops it. Errors are masked as 'Error executing tool find_similar', so the SSRF is blind. OK: the editor relay (apps/editor/server/catalog.mjs:103) only exposes search/items/vocab, so browsers can't reach find_similar. The local 127.0.0.1 instance rejects text/plain and foreign Host headers.

**Evidence**



**Notes**
