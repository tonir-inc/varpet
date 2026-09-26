# Varpet chat integration — 26 September 2026

The requested Varpet chat work was audited, completed, and consolidated on `main`.
The final source snapshot was `736e798`, based on remote `d09f870`. This document
and the sharing-guide clarification are documentation-only additions afterward.

## Included work

- Exterior walls cut away only from outside; interior walls remain full height.
- View-only and editable progress links, with checked versioned saves.
- Selection and atomic movement of multiple walls or furniture in 3D and Plan.
- Final FXAA compositing and the explicitly requested editor-local coordination rules.
- Landing page, sample apartment previews, login and My apartments, integrated with sharing.

Rendering, sunlight, skyboxes, architect handoffs and older editor work were
already upstream. The [chat audit](chat-recovery.md) records the earlier task
inventory, including superseded requests and questions that required no code.
The later remote architect, designer, catalog, showcase and compiler changes
were retained through rebase, without replaying stale worktree snapshots.

Interpretation: the request to remove the profile idea removed the standalone
personal-profile feature. The earlier login, landing page and saved-apartment
request remains implemented. The coordinator asked for clarification, received
no response during the work, and stated this default before integration.

## Final verification

Commands ran from the primary checkout after all source integration and rebase:

```text
pnpm install --frozen-lockfile                        exit 0
pnpm test                                            exit 0
  showcase: 12 passed; tools: 7 passed
  designer: 81 test files, 406 tests passed
  designer Python: 122 + 38 tests, OK
  editor server tests: 24 passed, 0 failed
  editor Node suites: 122 passed, 0 failed
  all editor domain, rendering and architect scripts passed
  engine: no test files, exit 0
pnpm typecheck                                       exit 0
  engine, designer, showcase, editor: Done
pnpm --filter @varpet/editor build                    exit 0
cd compiler && uv run pytest -q                      17 passed in 4.67s
cd harness && uv run pytest -q tests                  47 passed in 4.03s
git diff --check                                     exit 0
```

The sharing server also passed a strict standalone typecheck because the normal
editor tsconfig includes only `src`:

```text
cd apps/editor
pnpm exec tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck server/sharing.ts
exit 0
```

Browser checks on the integrated multi-selection code passed 11 application,
19 3D and 13 Plan assertions. After final rebase, the coordinator verified
landing → apartment preview → Start with this plan → editor, including the
Save, Share, My apartments, sun, sky and multi-selection controls.

The account owner verified save/reopen, persistent link identity, independent
account Save and Publish progress, view-only access, and copy isolation. Its
62 focused tests passed. The final create/attach regression delays the private
account attachment after share creation and confirms that switching access
choices still sends only one creation and one attachment request.

Fresh-context final source review at `736e798`: **APPROVE**, no remaining
findings. The earlier duplicate-share race was fixed and re-reviewed. The final
review did not independently rerun the coordinator's commands or browser checks.

## Completion checks

DONE: 7 of 7 for this integration.

1. ✓ Task-specific proof: audited worktree/chat inventory, six integrated feature
   commits, 43 multi-selection browser assertions, and account/sharing checks above.
2. ✓ Untargeted `pnpm test` and `pnpm typecheck` results are recorded above.
3. ✓ New regressions include `tests/multi-selection.test.mjs`,
   `tests/sharing.test.mjs`, `tests/sharing-server.test.mjs`,
   `tests/apartment-portal.test.mjs`, and `server/accounts.test.mjs`.
4. ✓ The integration changed no scene schema, fixture, hook or root policy to
   make checks pass; existing tests were not weakened. `apps/editor/AGENTS.md`
   was the user's explicit policy-edit request. The full file inventory is
   available with `git diff --stat d09f870..736e798` (53 files).
5. ✓ Fresh-context reviewer APPROVE on the final source snapshot.
6. ✓ The profile/login interpretation is explicit above. Public hosting,
   production account hardening, real-time collaboration and mobile FXAA
   performance are outside this integration, not claimed as verified.
7. ✓ Feature owners prepared isolated or completed shared edits before the
   coordinator integrated them. Only the coordinator changed shared Git history
   after handoff. The editor-local policy authorizes coordinated file handoffs.
   The coordinator resolved two `viewport.ts` conflict regions while retaining
   camera-motion cancellation; final documentation edits are in `sharing.md`
   and this file. Per-feature ownership is recorded in the linked task documents.

Not proven: public hosted sharing/account deployment, multi-process persistence,
mobile FXAA performance or a pixel-level FXAA improvement measurement. The build
retains the existing large-bundle advisory. No unrelated worktree was discarded.
