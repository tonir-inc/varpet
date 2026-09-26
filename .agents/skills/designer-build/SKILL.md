---
name: designer-build
description: Use when building or changing the designer agent (packages/designer, its MCP tools, metrics, sun, place, the request check, the explorers or its evals).
---

# Building the designer

The design is `docs/designer.md`; the tasks are `docs/tasks/designer-*.md`, in order. Read the design
once, then only your task card.

## Contracts that do not move

- The model never writes the scene. Every tool that changes anything works on a COPY and returns a
  result; only `propose` creates a proposal, and only if every check and the request check pass.
- Coordinates come from code. A tool that makes the model send x/y for a new piece is a design bug:
  add a relation to `place` instead.
- Units: metres, degrees, whole dram. `rot` and compass sides as the engine defines them; one convention.
- Metrics are pure functions of (scene, ops): no network, no clock, no randomness, so the same input
  gives the same number in tests, in the product and on the slide.
- Every tool returns errors the model can act on: what failed, where (coordinates), by how much,
  ordered hard to soft. "Invalid layout" alone is a bug.

## Lessons that already cost a run

- Tools that answer lookups cut rounds: 103 of 272 tool calls were catalog searches, 22 % were reads
  of skills or source the product will not expose. Put what the model needs in the tool output.
- A checker that looks at a window's centre missed glare along the rest of it: check the whole span.
- A greedy matcher under-counted (a broad label took the only radiator). Anything that matches asks to
  results uses a maximum matching.
- Declines are not passes. An honest "this room cannot fit that" is graded as unresolved unless a
  person confirmed it is impossible.
- Keep the static prompt prefix byte-identical across flats (rules, tool list, catalog first; scene
  last) so it caches: ~25.7k tokens of prefix, 6-round request ~110k input tokens.
- Codex threads: launch `< /dev/null`; watchdog on no output (a few minutes), kill the process group;
  stop the batch on "usage limit" in stderr (a limited run exits 0 with an empty answer).

## Tests

vitest in `packages/designer/test/`. Write the tests from the card first (`write-tests-first`), with a
negative and a boundary case per behaviour. Sun numbers are tested against published solar positions,
not against our own output. `pnpm test` and `pnpm typecheck` green from the root before saying done.
