import asyncio
import json
from pathlib import Path

import pytest

from varpet_harness.architect import load
from varpet_harness.dispatch import BatchStop, JobResult, StubRunner, dispatch
from varpet_harness.graph import Graph, strict_schema

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "demo-graph.json"


def g(*jobs):
    return Graph(flat="t", jobs=[dict(brief="x", size=[1, 1, 1], kind="piece") | j for j in jobs])


async def test_fixture_runs_in_one_pass(tmp_path):
    graph = load(FIXTURE)
    report = await dispatch(graph, StubRunner(), tmp_path)
    assert {r.status for r in report.results.values()} == {"ok"}
    assert report.peak_lanes == 6  # 8 ready jobs, 6 lanes: never one at a time
    assert json.loads((tmp_path / "report.json").read_text())["flat"] == "demo"
    layout = json.loads((tmp_path / "layout" / "ops.json").read_text())
    assert len(layout["deps"]) == 8


def test_graph_rejects_cycles_and_unknown_deps():
    with pytest.raises(ValueError, match="cycle"):
        g({"id": "a", "deps": ["b"]}, {"id": "b", "deps": ["a"]})
    with pytest.raises(ValueError, match="unknown deps"):
        g({"id": "a", "deps": ["zzz"]})
    with pytest.raises(ValueError, match="duplicate"):
        g({"id": "a"}, {"id": "a"})


def test_strict_schema_requires_every_field():
    job = strict_schema()["$defs"]["Job"]
    assert set(job["required"]) == set(job["properties"])
    assert job["additionalProperties"] is False


class Scripted:
    def __init__(self, fail=(), stop=None):
        self.fail, self.stop = set(fail), stop

    async def run(self, job, workdir, deps):
        await asyncio.sleep(0.01 if job.id != "slow" else 1)
        if job.id == self.stop:
            raise BatchStop("usage limit reached")
        return JobResult(job.id, "failed" if job.id in self.fail else "ok")


async def test_failed_dep_skips_dependents(tmp_path):
    graph = g({"id": "a"}, {"id": "b", "deps": ["a"]}, {"id": "c", "deps": ["b"]}, {"id": "d"})
    report = await dispatch(graph, Scripted(fail={"a"}), tmp_path)
    assert {i: r.status for i, r in report.results.items()} == {
        "a": "failed", "b": "skipped", "c": "skipped", "d": "ok"}


async def test_limit_stops_batch(tmp_path):
    graph = g({"id": "a"}, {"id": "slow"}, {"id": "b", "deps": ["a"]})
    report = await dispatch(graph, Scripted(stop="a"), tmp_path)
    assert report.stopped == "usage limit reached"
    assert {r.status for r in report.results.values()} == {"voided"}


def test_settle_forces_low_piece_effort_and_plan_ref():
    from varpet_harness.architect import settle

    graph = Graph(flat="t", jobs=[
        {"id": "shell", "kind": "shell", "brief": "x", "effort": "high"},
        {"id": "sofa", "kind": "piece", "brief": "x", "size": [2, 1, 1], "effort": "medium"},
    ])
    graph.jobs[1].refs = ["a.jpg", "b.jpg", "c.jpg", "d.jpg"]
    settle(graph, "fixtures/plan.png")
    assert graph.jobs[1].refs == ["a.jpg", "b.jpg", "c.jpg"]
    assert graph.jobs[0].refs == ["fixtures/plan.png"] and graph.jobs[0].effort == "high"
    assert graph.jobs[1].effort == "low"


def test_only_prunes_kinds_and_deps():
    from varpet_harness.graph import only

    pieces = only(load(FIXTURE), {"piece"})
    assert {j.kind for j in pieces.jobs} == {"piece"} and all(not j.deps for j in pieces.jobs)
