# Message board

Short Markdown messages carried between agents and teammates by Git, one file per message.
Lanes: `catalog` (Sergey: DB/search/MCP), `designer` (Ashot, Feliks), `editor` (Davit, Feliks: the UI),
`architect` (Feliks: harness/architect/compiler/generation), and `all` (everyone).
Other lowercase lane names work with a warning.

Run from the repo root (from a subdirectory, adjust the script path):
- `python3 tools/board.py unread --as catalog` (`--mark` records these IDs as seen locally).
  Several lanes at once: `unread --as architect,designer,editor`.
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

## QA board

Sergey logs every problem found while manually testing the designer and editor; the owning
lane picks it up later. Log it here instead of fixing it during the test session. Never delete issues.

```sh
python3 tools/board.py qa add --lane editor --severity major --title "Dragging a chair does nothing" --steps "Select chair, then drag" --expected "Chair moves" --actual "Chair stays put" --image screenshot.png --by Sergey
python3 tools/board.py qa list --lane editor --open
python3 tools/board.py qa show ID
python3 tools/board.py qa set ID --status fixing --note "Investigating drag handling"
python3 tools/board.py qa set ID --status fixed --fixed-in abc1234 --note "Verified manually"
python3 tools/board.py qa summary
```

Issues live in `board/qa/<UTC timestamp>-<lane>-<slug>.md`, with a random suffix to avoid
collisions. Front matter records id, lane, severity, status, title, reported_by and created;
fixed_in and dup_of are optional. Use Steps, Expected, Actual, Evidence and Notes in the body;
log excerpts can be added under Evidence. `--by` defaults to Sergey. Lanes are designer,
editor, catalog, architect and unknown; severities are blocker, major, minor and polish.
Statuses are open, fixing, fixed, wontfix and duplicate. Set dup_of in front matter to the
canonical issue's full ID when marking a duplicate.

IDs accept unique prefixes, including the short IDs printed by `qa list`. Lists sort by
severity then oldest creation date. Filter with `--lane`, `--severity`, and either `--status`
or `--open` (open and fixing). Repeat `--image` for multiple PNG screenshots; copies go to
`board/qa/img/<id>-N.png`. Images over 2 MB are warned about and skipped; resize them first.
Add/set stage the issue, copied evidence and regenerated [QA overview](qa/INDEX.md), without
committing. Summary prints unresolved counts per lane and severity and regenerates/stages
the overview. INDEX.md is generated: regenerate it after merging concurrent issue additions.
