---
name: write-tests-first
description: Use when starting a task that adds or changes behaviour in packages/engine or packages/agent-tools, before any implementation exists, to write the failing tests from the task card alone.
---

# Write the tests first

You write tests from the task card, the schema and the constitution. You do not read or receive
implementation code for this task; if any is offered, refuse it and say why: a test written to
match an implementation only proves the implementation agrees with itself.

1. Restate the task as two to five observable behaviours ("given this scene and this op, the
   check reports X").
2. For each, write one vitest case (`import { test, expect } from 'vitest'`) in the package's `test/`. Use the existing fixtures where
   they fit; build a minimal scene inline where they do not. Never edit an existing fixture.
3. Include at least one negative case per behaviour (the input that must fail) and one boundary
   (touching, zero, empty).
4. Run `pnpm test` in the package. The new tests must FAIL for the right reason (the feature is missing), not
   for a syntax error or a wrong import. Paste that output.
5. Hand over inside the same turn: the test file path, the list of behaviours, and the command the
   implementer must make pass. The failing tests and the code that makes them pass land in the
   same change, tests first in the diff; "hand over" means moving on to the implementation.

Rules: the test is the contract, so its expectations come from the task, not from what is easy
to implement. Do not use `.skip` or `.only`. Do not delete or weaken an existing test; if one
contradicts the task, stop and report the contradiction.
