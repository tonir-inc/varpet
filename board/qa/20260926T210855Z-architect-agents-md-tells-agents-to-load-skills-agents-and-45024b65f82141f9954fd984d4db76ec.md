---
id: "20260926T210855Z-architect-agents-md-tells-agents-to-load-skills-agents-and-45024b65f82141f9954fd984d4db76ec"
lane: "architect"
severity: "minor"
status: "open"
title: "AGENTS.md tells agents to load skills, agents and hooks that are not tracked in the repo"
reported_by: "bughunt-tooling"
created: "2026-09-26T21:08:55.642078Z"
---

**Steps**

git ls-files .agents .claude .codex tools; compare them with AGENTS.md 'Agent setup'. See commit a3b62dd (Ashot-only tooling moved to ~/.codex)

**Expected**

Every skill, agent and path that AGENTS.md names exists on a fresh clone

**Actual**

Only catalog-search, flat-furnish, flat-shell, message-board and part-dsl-draft are tracked under .agents/skills. Not tracked, so absent on a fresh clone or a teammate's machine: write-tests-first, definition-of-done, systematic-debugging and designer-build (skills AGENTS.md says to load), the .claude/skills link ('Claude Code reads the same folder through .claude/skills'), .codex/agents/ (reviewer, devils-advocate), tools/hooks/ and docs/tasks/designer-*.md. plan-to-scene, furnish-from-plan, scene-visual-check and interior-design-rules now live in harness/prompts/*.md, not in .agents/skills. .agents/skills/README.md still lists them all. .codex/config.toml still sets [features] hooks = true and its comment refers to .codex/hooks.json, which 6ab9bb3 deleted. packages/agent-tools (listed in Layout) holds only package.json and a README.

**Evidence**



**Notes**
