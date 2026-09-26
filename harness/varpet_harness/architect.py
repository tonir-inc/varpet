"""Architect: one planning call that turns a flat into a job graph.

It plans once and never reviews a piece. Code checks decide pass or fail;
the owner decides likeness. Failed jobs come back for a re-plan, not a loop.
"""

from __future__ import annotations

import json
from pathlib import Path

from openai_codex import ApprovalMode, AsyncCodex, LocalImageInput, Sandbox, TextInput
from pydantic import ValidationError

from .codex_runner import IMAGE_SUFFIXES, thread_config
from .dispatch import Report
from .graph import Graph, strict_schema

PLAN_PROMPT = """You are the architect for flat "{flat}". Plan jobs; do not build anything.
Jobs: one `shell` job from the plan; it also owns everything fixed: fitted kitchens and
wardrobes, sanitaryware, appliances, radiators. One `piece` job per movable furniture piece
(sofas, beds, tables, chairs, storage, rugs, mirrors) that is not in the catalog below,
with `count` for identical copies, with its size [w, d, h] in metres (if the plan and photos
do not give it, use a typical size and set size_estimated); `designer` jobs last,
depending on the shell and the pieces they arrange. Identical pieces are one job.
Give each job only the skills it needs from: {skills}.
Put in each piece job's refs the photos that show that piece best, best first, at most 3.
Put in the shell job's refs the photos that best show walls, windows, floors and ceiling height, at most 4.
Catalog SKUs already built (do not make piece jobs for these): {catalog}
Plan: {plan} (attached first when it is an image)
Photos, attached after it in this order: {photos}"""


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
        photos="; ".join(f"{i + 1}: {p}" for i, p in enumerate(photos)) or "none",
    )
    thread = await codex.thread_start(
        approval_mode=ApprovalMode.deny_all,
        sandbox=Sandbox.read_only,
        cwd=str(repo),
        model=model,
        config=thread_config(),
    )
    try:
        images = ([plan_path] if Path(plan_path).suffix.lower() in IMAGE_SUFFIXES else []) + photos
        items = [TextInput(prompt), *(LocalImageInput(path=str(repo / p)) for p in images)]
        schema = strict_schema()
        result = await thread.run(items, output_schema=schema, effort="medium")
        try:
            return settle(Graph.model_validate_json(result.final_response or ""), plan_path)
        except ValidationError as e:
            # Same pattern as the builder: code checks, one fix call.
            fix = f"The graph failed validation. Fix only this and return the whole graph:\n{e}"
            result = await thread.run(fix, output_schema=schema, effort="medium")
            return settle(Graph.model_validate_json(result.final_response or ""), plan_path)
    finally:
        await codex.thread_archive(thread.id)


MAX_PIECE_PHOTOS = 3  # every image is paid for again in the builder's call
MAX_SHELL_PHOTOS = 4
SKILL = {"shell": "flat-shell", "piece": "part-dsl-draft"}


def settle(graph: Graph, plan_path: str) -> Graph:
    """Mechanical fixes in code, not in the prompt: pieces run at low effort
    (Astra low beat medium, 0.907 vs 0.876) on at most three photos, and the
    shell always sees the plan."""
    for job in graph.jobs:
        if job.kind == "piece":
            job.effort = "low"
            job.refs = job.refs[:MAX_PIECE_PHOTOS]
        if job.kind == "shell":
            job.refs = [plan_path, *[r for r in job.refs if r != plan_path][:MAX_SHELL_PHOTOS]]
        skill = SKILL.get(job.kind)
        if skill and skill not in job.skills:
            job.skills.append(skill)
    return graph


def failures(report: Report) -> list[str]:
    """Job ids worth a re-plan: failed ones. Voided ones wait for the limit to reset."""
    return sorted(i for i, r in report.results.items() if r.status == "failed")


def load(path: Path) -> Graph:
    return Graph.model_validate(json.loads(path.read_text()))
