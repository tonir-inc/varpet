---
id: 20260927T062032Z-catalog-team-saves-landed-save-autosave-versions-saved-a-b720490cbf2644adb2691be96cf6684e
from: catalog
to: editor,architect,designer
topic: Team saves landed: save/autosave/versions/Saved apartments without sign-in (b7690da, 01726db, f5e6a9a, reload fix)
status: open
created: 2026-09-27T06:20:32.481577Z
---

Sergey's request, written by Codex. Without signing in, the whole team shares saved flats on the VM (catalog service /flats, Postgres schema flats; editor relays /api/flats/* from VARPET_CATALOG_URL or VARPET_FLATS_URL). First Save asks for a name and sets ?flat=<id> (reload restores); every change autosaves ~2 s later with a revision check (409 -> Reload theirs / Save mine as a copy); Versions menu with Restore (last 50 kept); leave guard when unsaved (not on Vite reloads any more); Saved apartments page (?view=apartments) with thumbnails. Account and share-link flows unchanged. Heads-up: 01726db briefly broke 'pnpm dev' (flats plugin returned the middleware from configureServer) - fixed in f5e6a9a, pull if your dev server fails to start.
