---
name: definition-of-done
description: Use when about to report a task as done, merged or demo-ready, to check the definition of done mechanically and state exactly what is and is not proven.
---

# Definition of done (varpet)

Answer every line with a fact and its evidence. A line without evidence is NOT DONE.

1. The task's own proving command was run and its output is pasted. (Which command, what it printed.)
2. `pnpm test` and `pnpm typecheck` passed untargeted from the repository root. (Pasted counts.)
3. Tests were added or updated for the behaviour, in the same change. (File names.)
4. No contract file was changed to make a task pass: `docs/CONSTITUTION.md`, `AGENTS.md`, the scene
   schema, `fixtures/`, `tools/hooks/`, `.codex/`, `.claude/`; no existing test was deleted or weakened
   (adding tests is fine). (`git diff --stat`.)
5. A fresh-context review ran (the `reviewer` agent) and its verdict is APPROVE or CONCERN. REJECT blocks.
6. Anything assumed is written in one sentence. Anything descoped is named as descoped, not dropped.
7. Two agents did not write the same file (AGENTS.md rule): name the files this task touched.

Report as:

```
DONE: n of 7
- 1 ✓/✗ evidence
...
Not proven: <list, or "nothing">
```

Never mark a line ✓ because it is probably fine. Never waive a line; only the team can.
