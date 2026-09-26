# Designer overnight push (27 Sept 2026, code freeze 12:00)

The spike designer (`packages/designer/spike`) is the product designer. Goal: pitch-perfect demo on the three demo
flats (`apartments/` from `demo/flats`: sunday-b12121, orion-t8, orion-t7), with a live chat that furnishes whole flats
from long briefs and handles follow-ups, in a smooth, pretty 60 fps viewer.

Every lane: `git fetch origin && git rebase origin/main` before starting and before every push; one-line conventional
commits without co-author trailers; `pnpm typecheck` + `pnpm test` green before pushing to main (known flakes: designer
ashot-live/taste/place 5 s timeouts under load; harness `codex debug models` SIGKILL; confirm on clean main). Keep spike
Codex runs to at most 2 at a time per lane (the Mac is shared with catalog Blender builds). Two lanes never write the
same file; ask the lead (post in `tools/board.py` or report) when you need a file you don't own.

| Lane | Owns | Job |
|---|---|---|
| rules | `spike/lib/relations.ts`, `spike/lib/check.ts`, `spike/lib/scene.ts`, `spike/test/*relations*` | function rules the checker enforces (lamps, coverage, art/mirror scale and height, bedside, reach, curtains) |
| critic | `spike/run/AGENTS.md`, `spike/run/spike.py`, new `spike/run/critic.py`, `spike/cli.ts` | independent visual critic loop, ask-when-brief-does-not-fit, prompt quality and speed |
| viewer | `apps/editor/src/render/**`, `apps/editor/src/core/*` only for perf | 60 fps, no hitches, prettier interiors |
| scenarios | `apartments/**` (merge from demo/flats), new `spike/run/scenario.py`, `spike/run/scenarios.json`, `spike/lib/view/*` for new flats | three demo scenarios with follow-ups, run end to end, review renders |
| pitch | `harness/designer_service.py`, `harness/designer_spike.py`, `apps/editor/src/ui/designer-panel.ts`, `apps/editor/src/adapters/designer-http.ts`, `apps/editor/src/main.ts` | live chat flow for the pitch: no silent replay, warm start, room-by-room streaming, card numbers, edit sync, calls `spike/run/critic.py` |
