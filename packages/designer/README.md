# Designer

Run `pnpm --silent --filter @varpet/designer start --scene /absolute/path/to/scene.json`
from any worktree root, or `pnpm --silent --dir /absolute/path/to/packages/designer start --scene ...`
from any directory. `VARPET_SCENE` is an alternative to `--scene`.

Assumed pending engine integration: metres, x right, y plan-up; item rotation counterclockwise
from local x, front local -y; north_deg clockwise from plan-up. Item pos is its footprint centre.
Adapter input is validated; no tool writes the source scene or scene file.

Measured card 01 blocker: protect-contract refused adding `varpet-designer` to `.codex/config.toml`.
That registration requires a team-owned configuration change. The package and real stdio transport
can be exercised independently. Unbuilt tools return explicit tool errors.
