---
name: ai-engineering
description: Use when making an agent (the designer, the architect, any model-driven feature) faster, cheaper or more reliable, including latency work, request routing, caching, precomputation, candidate generation, knowledge libraries of evaluated cases, eval design, and deciding what the model should do versus code.
---

# AI engineering for Varpet's agents

The model is the slowest, most expensive and least predictable part of the system. Every rule below
moves work away from it or makes its remaining work smaller and checkable.

## 1. Measure before changing anything

- Break every request into model thinking, tool rounds, tool time, checks and network, and report
  seconds and tokens for each. Optimise the biggest slice first; a guess about where the time goes is
  usually wrong.
- Use a fixed eval set, the same for "before" and "after", and report the pass rate, median, p90, max
  and tokens. For small N (under about 30 runs per arm), say that differences like 9/14 vs 11/14 are
  not evidence.
- Never grade with the same rule that generated the answer. The grader must be independent code or
  a person.

## 2. The model decides intent; code does geometry, search and arithmetic

- The model must not invent coordinates, sizes, prices or distances. Code produces them; the model
  chooses among options by ID.
- **Candidate generation with filters.** Before the model sees a request, code enumerates the
  plausible options and prunes the obviously wrong ones, such as a sofa blocking a door, a bed under a
  window, a wardrobe with no clearance, or a desk facing into the glare. The model then picks from a
  short, ranked list (tens of options, not millions). Filters are hard rules (physics, doors,
  walkways) plus soft scores (daylight, zoning, the customer's preferences). They are pure functions:
  same scene, same list.
- Output only IDs from the list, validated by a schema. A structured answer with 3 IDs replaces 5
  rounds of "try coordinates, get rejected, repair".

## 3. Precompute and cache everything that doesn't depend on the words

- Per scene, keyed by a scene fingerprint: rooms, free wall spans, doors with their swings, windows
  and sun, the walkway skeleton, existing problems, and per furniture kind the candidate slots with
  their scores. Compute once when the flat loads; every request reuses it.
- Per known flat (a developer's plan types): solve good layouts offline for each room type and budget
  band. A customer request then becomes an edit of a pre-solved layout, which answers in seconds.
- Keep the prompt's static prefix (rules, tool list, catalog summary) byte-identical and first, and
  the scene and request last, so the provider's prompt cache hits.

## 4. Route by request class

- Map requests into a small taxonomy of classes and subclasses, for example: furnish a room · add one
  piece · move or rearrange · recolour · daylight or advice question · budget-limited · style ·
  out of scope · vague. Each class has a recipe: which precomputed data it needs, which candidates,
  what the model must decide, the effort level, and a time budget.
- Classify with rules first and a small fast model second. Most requests match a known class, and
  only unknown shapes fall back to the general agent.
- Keep a library of evaluated cases per class, holding real phrasings, the expected outcome, the
  pass rate, the median seconds and the known failure modes. It is the regression suite, the routing
  training data and the few-shot source at once. Add every production failure to it.

## 5. Fail fast, and honestly

- Check feasibility in code before calling the model. If a double bed cannot fit with the door
  where it is, answer in about a second with the reason and the nearest alternative. Never make the
  customer wait minutes for a failure.
- Put a time budget and a round cap on every class. Hitting either is a graded failure, not a hidden
  retry.
- Stream progress within about 2 s and keep it flowing; silence feels broken even when the work is
  going well.

## 6. Spend model effort where it pays

- Use the lowest reasoning effort that passes the class's evals, and escalate per class only when
  measured.
- One call with good inputs beats agent trees and critic loops here. Already measured: a vision critic
  cost 3.3 times more for a tie on realism, and subagent trees cost 0.63 vs 0.79 in quality and
  2.1M vs 39k tokens.
- Parallelise independent candidate evaluations in code, not by spawning agents.

## 7. Ship it like a product

- Every change carries before/after numbers on the same eval set, with no pass-rate regression.
- Record what was measured versus derived versus assumed in the eval note.
- Defaults change only with evidence; experimental paths sit behind an option until they win.
