"""Architect: one planning call that turns a flat into a job graph.

It plans once and never reviews a piece. Code checks decide pass or fail;
the owner decides likeness. Failed jobs come back for a re-plan, not a loop.
"""

from __future__ import annotations

import json
from pathlib import Path

from openai_codex import ApprovalMode, AsyncCodex, LocalImageInput, Sandbox, TextInput

from .dispatch import Report
from .graph import Graph, strict_schema

PLAN_PROMPT = """You are the architect for flat "{flat}". Plan jobs; do not build anything.
Jobs: one `shell` job from the plan; one `piece` job per furniture piece that is not
in the catalog below, with its true size [w, d, h] in metres; `designer` jobs last,
depending on the shell and the pieces they arrange. Identical pieces are one job.
Give each job only the skills it needs from: {skills}.
Catalog SKUs already built (do not make piece jobs for these): {catalog}
Plan: {plan}"""


async def plan(
    codex: AsyncCodex,
    repo: Path,
    flat: str,
    plan_path: str,
    photos: list[str],
    catalog: list[str],
    model: str = "gpt-6-astra",
) -> Graph:
    skills = sorted(p.parent.name for p in (repo / ".agents" / "skills").glob("*/SKILL.md"))
    prompt = PLAN_PROMPT.format(
        flat=flat,
        skills=", ".join(skills) or "none",
        catalog=", ".join(catalog) or "none",
        plan=repo / plan_path,
    )
    thread = await codex.thread_start(
        approval_mode=ApprovalMode.deny_all,
        sandbox=Sandbox.read_only,
        cwd=str(repo),
        model=model,
        config={"project_doc_max_bytes": 0},
    )
    try:
        items = [TextInput(prompt), *(LocalImageInput(path=str(repo / p)) for p in photos)]
        result = await thread.run(items, output_schema=strict_schema(), effort="medium")
    finally:
        await codex.thread_archive(thread.id)
    return Graph.model_validate_json(result.final_response or "")


def failures(report: Report) -> list[str]:
    """Job ids worth a re-plan: failed ones. Voided ones wait for the limit to reset."""
    return sorted(i for i, r in report.results.items() if r.status == "failed")


def load(path: Path) -> Graph:
    return Graph.model_validate(json.loads(path.read_text()))
