# Designer conversation pass

Measured 26 September 2026 (+0400), GPT-6 Codex implementation and review. Based on MAIN
`8dd936e`: its warm proposal title, paragraph and collapsed Notes are preserved.

## Audit and scope

Measured before: the service labels every plain answer as a refusal; explanatory paragraphs cannot
format emphasis or lists; proposal cards offer no conversational follow-up; errors require retyping;
the composer invites only changes and does not explain its keyboard behavior. Existing semantic
colours, type, spacing, focus and responsive layout from `ui-pass/` remain the reference.

Derived changes: add message replies, safe light Markdown, answer and proposal suggestions,
streaming final answer text, observed progress stages, and Retry. Existing Enter/Shift+Enter and
IME-safe handling are retained and explained. Scene operations and approval are unchanged.

## Live browser proof

Measured using the browser plugin, editor port **5341**, this branch's service port **8893**,
`gpt-6-astra`, low, without-place / compact-base. No live requests went to 8787 or 8788.
One actual conversation, same ID throughout:

| Turn | Customer request | Result | Service seconds | Model tool calls | Total tokens |
| --- | --- | --- | ---: | ---: | ---: |
| 1 | Paint the bedroom walls a soft sage for a minimalistic feel. | Checked proposal for five wall sections | 30.357 | 2 | 51,048 |
| 2 | why did you do it this way? | Message explains its sage choice and shared-wall scope | 10.880 | 0 | 24,132 |
| 3 | what does minimalistic mean for a small flat? | Message explains useful furniture, clear routes, storage, palette and warmth | 11.247 | 0 | 26,188 |

Measured: scene stayed at revision 0; no proposal was applied. Turn 2 explicitly said the current
walls had not changed. Turn 3 referenced the earlier sage proposal. A development hot reload between
turns 2 and 3 preserved conversation history and marked the old proposal stale, as required by the
existing revision protection. This is visible in later screenshots; it is not a new service proposal.

Measured turn 3: first progress reached the browser in **4.8 ms**, first answer text in **6.694 s**,
completed response in **11.250 s**. The NDJSON capture proves incremental `message_delta` records
before the final `message`. These are three observations, not a latency benchmark or a general
zero-tool guarantee. The prompt policy requires zero tools for pure questions; both sampled answers
used zero. FAST retains routing/acceleration ownership; QUALITY retains design-knowledge ownership.

Evidence: [conversation and stream](live-conversation.json), [service summaries](live-service-summary.json).
Screenshots show the actual live answers, with no replay substituted:

| State | 1440×900 | 1280×800 | 390×844 |
| --- | --- | --- | --- |
| Before | [image](before-1440.png) | [image](before-1280.png) | [image](before-390.png) |
| Proposal | [image](live-1-proposal-1440.png) | [image](live-1-proposal-1280.png) | [image](live-1-proposal-390.png) |
| Why? | [image](live-2-why-1440.png) | [image](live-2-why-1280.png) | [image](live-2-why-390.png) |
| Minimalism | [image](live-3-minimalism-1440.png) | [image](live-3-minimalism-1280.png) | [image](live-3-minimalism-390.png) |

Measured browser checks: no horizontal page overflow at all three widths; nine bold spans and five
list items rendered; Shift+Enter inserted a newline; Tab from the composer reached Send with a 2 px
focus outline. The three live requests were submitted with Enter. Separate intercepted UI replay
proved Retry resends the same request and hostile HTML remains inert; [retry screenshot](retry-1280.png).
No intercepted replay reached the designer service.

## Verification

New red/green tests: `harness/designer_conversation_test.py` (5) and
`apps/editor/tests/designer-conversation.test.mjs` (8). They cover message/refusal separation,
stream privacy, all prompt profiles, suggestion validation, proposal context, cancellation, retry,
Markdown escaping and demo answers. Existing editor chat tests: **57 passed**. Untargeted typecheck
and editor build pass; full output is in the verification logs here. The existing build chunk-size
advisory remains.

The coordinator approved `/tmp/varpet-conversation-test-contract.patch` exactly as written.
It prefixes three stub refusal strings with `DECLINE:` and renames the obsolete plain-text-refusal
test. Every existing assertion is preserved. New tests independently prove ordinary answers return
`message` and explicit refusals still return `decline`. No scene schema or fixture scene changed.

The first verification attempts encountered unchanged five-second geometry/bridge test timeouts
under shared-machine load (measured load average 226.47). Verification uses `VITEST_MAX_WORKERS=1`
to reduce contention; assertions and timeouts remain unchanged. Final counts and logs follow below.

MAIN's presentation commit `8dd936e` already provides the requested warm proposal copy, specific
titles and collapsed caveats. This pass retains that implementation, so no duplicate copy change
is needed. QUALITY's landed knowledge/composition work was rebased without modifications. FAST's
classifier/fast-path files were not edited; the service integration preserves incoming diagnostics.

Measured final commands, all exit 0:

```text
VITEST_MAX_WORKERS=1 pnpm test
378 designer; 116 + 38 Python; 10 showcase; 7 hooks; 6 + 57 editor Node tests
11,202 explicitly reported editor assertions
pnpm typecheck: engine, designer, showcase, editor passed
pnpm --filter @varpet/editor build: passed
```

Fresh read-only reviewer: **APPROVE**, no functional findings. Reviewed fresh full-suite logs and
three-turn evidence. Definition of done: **7 of 7 evidenced** (task proof, untargeted gates, added
behavior tests, protected contracts, approved review, assumptions, and single-writer ownership).
Assumed: zero-tool conversational policy is prompt-enforced; measured for both live follow-ups,
not a universal guarantee. Existing browser QA pages requiring furnished startup remain the known
limitations recorded in `../ui-pass/README.md`; no geometry or editor operations changed here.
