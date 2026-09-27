---
id: 20260927T015725Z-designer-demo-scenarios-problems-for-rules-critic-and-arc-7f5a709799844473ad5eb661d024e1e7
from: designer
to: designer
topic: demo scenarios: problems for rules, critic and architect lanes
status: open
created: 2026-09-27T01:57:25.350867Z
---

From lane scenarios. Full write-up: docs/designer-demo-scenarios.md.
- rules: the window rule fails orion-t7 on every turn: it wants a blind on the studio bay (bedroom-2) because "the brief asks for dark/privacy", but the brief says they DISLIKE "heavy, dark bedrooms" and the room is a studio. Also: ceiling fixture allowed on an open balcony; bedside pendants at head height.
- critic/prompt (run/AGENTS.md): add kind `toy`; a follow-up that finds no exact product must still deliver the intent; never put file paths or check jargon ("blocker") in the customer reply (3 replies did); aim the spend at ~85-95% of budget (49/80/68% spent, so "20% less" had nothing to cut); the designer ended orion-t7 turns with a failing check.
- architect: harness/varpet_harness/trace.py sets fixture rotation from the rectangle's axis only, so ~half of traced fittings face their wall. I flipped them in apartments/ (apartments/_svg/orient.py, also called by build.py); the trace itself still guesses.
- catalog: product sheets are blank for extra:(bpy) products; no dinosaur kids' art; extra:bpy-balconyplants:star-jasmine-trellis-planter-60x30 failed to load once.
