"""Job graph: what the architect writes and the dispatcher runs.

The graph never describes geometry. A piece job's output is a part program
in the `part-dsl` skill's format, which the harness treats as an opaque file.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Kind = Literal["shell", "piece", "furnish", "designer"]
Effort = Literal["low", "medium", "high"]
SizeSource = Literal["plan", "photo", "scan", "typical"]

# File each kind leaves in its workdir. The next job reads it from there.
OUTPUT: dict[str, str] = {"shell": "shell.json", "piece": "program.json", "furnish": "placements.json", "designer": "ops.json"}


class Job(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]*$")
    kind: Kind
    deps: list[str] = []
    brief: str = Field(description="Short task text. Code-written facts, no repo docs.")
    size: list[float] | None = Field(
        default=None, min_length=3, max_length=3, description="[w, d, h] in metres, pieces only"
    )
    count: int = Field(default=1, ge=1, description="how many identical copies the flat has")
    size_source: SizeSource = Field(
        default="typical",
        description="plan: printed on the plan; photo: measured against something of known size in a photo; "
        "scan: from a LiDAR or RoomPlan scan; typical: a usual size for this kind of piece",
    )
    refs: list[str] = Field(default=[], description="Plan or photo paths relative to the repo")
    skills: list[str] = Field(default=[], description="Only the skills this job needs")
    effort: Effort = "low"

    @model_validator(mode="before")
    @classmethod
    def _legacy(cls, data):
        """Graphs saved before 26 Sept afternoon carry size_estimated instead of size_source."""
        if isinstance(data, dict) and "size_estimated" in data:
            data = dict(data)
            estimated = data.pop("size_estimated")
            data.setdefault("size_source", "typical" if estimated else "photo")
        return data


class Graph(BaseModel):
    model_config = ConfigDict(extra="forbid")

    flat: str
    jobs: list[Job]

    @model_validator(mode="after")
    def _check(self) -> Graph:
        ids = [j.id for j in self.jobs]
        dupes = {i for i in ids if ids.count(i) > 1}
        if dupes:
            raise ValueError(f"duplicate job ids: {sorted(dupes)}")
        known = set(ids)
        for j in self.jobs:
            missing = [d for d in j.deps if d not in known]
            if missing:
                raise ValueError(f"{j.id}: unknown deps {missing}")
            if j.kind == "piece" and j.size is None:
                raise ValueError(f"{j.id}: piece without size")
        self.order()
        return self

    def order(self) -> list[list[str]]:
        """Waves of job ids; every job in a wave has its deps in earlier waves."""
        deps = {j.id: set(j.deps) for j in self.jobs}
        done: set[str] = set()
        waves: list[list[str]] = []
        while deps:
            wave = sorted(i for i, d in deps.items() if d <= done)
            if not wave:
                raise ValueError(f"dependency cycle among {sorted(deps)}")
            waves.append(wave)
            done.update(wave)
            for i in wave:
                del deps[i]
        return waves


def only(graph: Graph, kinds: set[str]) -> Graph:
    """Keep jobs of these kinds; deps on dropped jobs are removed."""
    keep = [j for j in graph.jobs if j.kind in kinds]
    ids = {j.id for j in keep}
    jobs = [j.model_copy(update={"deps": [d for d in j.deps if d in ids]}) for j in keep]
    return Graph(flat=graph.flat, jobs=jobs)


def strict_schema() -> dict:
    """Graph schema for a model's structured output: every field required, no extras."""
    schema = Graph.model_json_schema()

    def tighten(node: object) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object" and "properties" in node:
                node["required"] = list(node["properties"])
                node["additionalProperties"] = False
            node.pop("default", None)
            for v in node.values():
                tighten(v)
        elif isinstance(node, list):
            for v in node:
                tighten(v)

    tighten(schema)
    return schema
