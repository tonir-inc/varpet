# Clear requests and essential clarification

Measured 26 September 2026 on `8788020` plus this change. This is a small triage experiment,
not a replacement for the strict Komitas furnishing benchmark.

## Failure groups and scope

Derived from [BENCH's saved conversations](komitas.md): the historical 9/38 strict result is six
customer conversations; the nine later accepted architectural shells are a separate cohort.
Of ten turns grouped as clarification, six ask which bedroom, two ask where to put a desk, and
two ask kids' ages/count. The desk placement preference can be delegated. The other questions
may identify essential room/occupant information; the hidden grader's room role is not a customer
answer. None of the six living failures was simply a style interview.

This change puts one shared act/clarify policy into all prompt profiles, including production
`compact-base`. Furnishing and additions authorize a modest checked purchase preview without a
style/budget interview. A missing budget stays unconfirmed. Window placement is a design choice;
an unresolved explicit bedroom target remains a question. Catalog/search/check failures remain
specific unresolved limitations. The MCP allows only one successful `ask` per customer turn.
FAST's checked-layout search, QUALITY's complete furniture composition, CHAT's message protocol,
and existing benchmark grading are unchanged.

## Measured paired probe

Same saved b31-t46 initial scene and 895-asset catalog, same production model/profile:
`gpt-6-astra / low / without-place / compact-base`. Fast path and catalog acceleration disabled
for both; live catalog MCP at localhost:8765. Each case starts a fresh conversation. Baseline
runs in an isolated runtime copy with the original prompt files; it shares the new one-question
server guard, so this is a **prompt comparison**, not a whole-patch rollback. Worker hashes show
no runtime edits during either run. SDK start/completion events are deduplicated by tool-call ID.

| Request | Before → after | Seconds before → after | Total tokens before → after |
|---|---|---:|---:|
| Furnish the living room | Acts, no question → acts, no question; neither finds a checked composition | 36.342 → 27.075 | 67,148 → 74,097 |
| Add a desk by the window for working from home | Asks which room → searches, sets intent and proposes without asking | 16.509 → 51.403 | 49,598 → 133,602 |
| Make it nicer | One question → one question | 14.546 → 14.066 | 47,599 → 49,746 |

Measured triage match: **2/3 → 3/3**. Delivered editor proposals: **0/3 → 0/3**.
The after desk reaches proposal conversion but fails because its real live catalog SKU
`abo:B075Z8KXDK` is absent from the frozen request catalog (all eight live desk search results
are absent). This is evidence of acting on the request, not successful desk delivery. Living
composition remains unresolved in the owning lane. Single samples do not establish a latency
improvement or an improvement to the historical 9/38 strict completion rate.

Evidence: [before](clarification-runs/before/run.json), [after](clarification-runs/after/run.json),
raw HTTP/SDK events beside them, plus worker source/isolation manifests.

## Additional controls

Measured after-only controls: “Paint the bedroom walls warm white” correctly asks which bedroom
in its text (8.866 s, 16,396 tokens), but returns `message` without calling `ask`, so it **fails the
strict typed-question control**. The scripted continuation was initially skipped rather than
inventing an answer to a missing typed question. Sending “Bedroom 2” once to that actual conversation
then produced four warm-white wall updates accepted by EditorStore, with no new question
(22.349 s, 115,791 tokens). “What does warm white mean?” answers with zero tool calls (9.024 s,
16,425 tokens). The typed-message distinction remains a CHAT follow-up: the audit listed `ask`,
but did not capture MCP readiness at the first decision, so ignored tool availability is unproven.
[Control evidence](clarification-runs/after-controls/run.json),
[actual answer](clarification-runs/after-controls/answer-bedroom2-followup/run.json).

## Verification

New tests first: the shared-policy tests failed before the prompt file/wiring; the four MCP quota
tests failed before the guard. Green afterward: 153 designer Python harness tests, plus 8 targeted
MCP/conversation tests and untargeted root typecheck. Final post-rebase area validation is recorded
in the commit body. No existing test, fixture or schema was changed. The prior full untargeted
suite was green; this task follows Ashot's push rule without repeating it or running a reviewer.
