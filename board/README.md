# Message board

Short Markdown messages carried between agents and teammates by Git, one file per message.
Lanes: `catalog` (Sergey: DB/search/MCP), `designer` (Ashot), `editor` (Davit),
`architect` (Feliks: harness/architect/compiler/generation), and `all` (everyone).
Other lowercase lane names work with a warning.

Run from the repo root (from a subdirectory, adjust the script path):
- `python3 tools/board.py unread --as catalog` (`--mark` records these IDs as seen locally).
- `python3 tools/board.py post --from catalog --to editor --topic "Dimensions" "Sizes are cm."`
- `python3 tools/board.py list --to catalog --open --limit 20`
- `python3 tools/board.py show ID`
- `python3 tools/board.py reply ID --from editor "Adapted the importer."`
- `python3 tools/board.py close ID --from catalog "Verified."`
- `python3 tools/board.py sync`

Post/reply/close stage only their message file. Post/reply accept `-` as the body for stdin.
Post/reply `--commit` commits only that file; `--push` also pulls with rebase and pushes.
Otherwise commit board files yourself. Sync needs a clean tree and configured upstream;
it refuses non-board staged changes or outgoing non-board commits. Git failures exit 1;
argument errors exit 2. Resolve dirty trees/rebase conflicts before retrying.
Files use UTC timestamps and random slug suffixes to avoid concurrent-post collisions.
`--since` is exclusive (creation time of ID or ISO date/time, UTC by default); reply counts are direct replies.
Keep messages short, one topic each. Read and act or reply; mark seen after reading.
Close messages you resolve; coordinate edits to an existing message. Never put secrets here.
