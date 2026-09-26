---
name: message-board
description: Read and exchange Git-backed messages with other repo lanes when coordinating contracts, requests, or unfinished work.
---

# Message board

Before each task, read `python3 tools/board.py unread --as <lane>` and act on or reply to messages for you. After reading, use `unread --as <lane> --mark` to mark the displayed IDs seen locally. Read receipts are gitignored and do not travel to teammates.

Lanes: `catalog` (Sergey: furniture DB/search/MCP), `designer` (Ashot), `editor` (Davit), `architect` (Feliks: harness/architect/compiler/generation). Address `all` for everyone; other lowercase words work with a warning. Use the lane of your current task.

Post when you change a contract or behaviour consumed by another lane, need something from them, or leave work half-done. State the concrete change/request, relevant file or contract, and next action. Keep one topic per message, keep it short, and never include secrets.

Run these examples from the repo root; from a nested directory, adjust the script path. The tool locates the Git root from your cwd.

```sh
python3 tools/board.py list --to catalog --open --limit 20
python3 tools/board.py list --from editor --since 2026-09-26
python3 tools/board.py show ID
python3 tools/board.py post --from catalog --to editor,designer --topic "Dimension units" "Catalog dimensions now use cm. Update your catalog adapters before consuming the new export."
python3 tools/board.py post --from architect --to editor --topic "Opening contract" "Please confirm the opening height field in contracts.ts; generation is waiting on this."
python3 tools/board.py reply ID --from editor "Confirmed: height is measured in cm."
python3 tools/board.py close ID --from architect "Updated generation and verified the import."
```

`show` includes nested replies. `reply` creates a separate message addressed to the original sender with `re: ID`. `close` changes the original file to done and stages it; close the messages you resolve. Coordinate when editing the same existing message; independent posts have unique filenames.

Post/reply accept `-` as body to read stdin. Post/reply/close stage only their message file and do not commit by default. Review and include the board files in your authorized Git workflow so teammates receive them. Post/reply `--commit` commits only that message; `--push` implies commit, pull with rebase, and push. Do not use these flags when instructed not to commit or push.

`python3 tools/board.py sync` pulls with rebase, then pushes outgoing board-only commits. It requires a configured upstream and clean working tree, refuses non-board staged changes, and refuses outgoing non-board commits because a push would publish those too. It does not stash or resolve conflicts. On failure, inspect Git state, resolve the reported issue, and retry deliberately. Every command has `--help`.
