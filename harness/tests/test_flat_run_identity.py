"""A new upload must not collide with a flat started in the same second."""

import base64
import json
from pathlib import Path
from types import SimpleNamespace

import openai_codex
import pytest

from varpet_harness import pieces, serve, session


@pytest.mark.parametrize(("upload_name", "project_name"), [("My Flat!", "my-flat"), ("A" * 40, "a" * 40)])
async def test_same_name_uploads_in_one_second_keep_separate_inputs_and_projects(
    tmp_path, monkeypatch, upload_name, project_name
):
    calls, assets = [], []
    job = SimpleNamespace(id="living-room-three-seat-sofa", kind="piece", size=[2, 1, 1])

    class FakeCodex:
        async def close(self):
            pass

    async def fake_session(codex, repo, name, plan, photos, run_dir, compile_cmd, **kwargs):
        calls.append((name, run_dir, Path(plan), [Path(photo) for photo in photos]))
        piece_dir = run_dir / job.id
        piece_dir.mkdir()
        (piece_dir / "piece.glb").write_bytes(b"glb")
        (piece_dir / "program.json").write_text(json.dumps({"size": job.size}))
        assets.append(pieces.asset(run_dir, job, "http://localhost:8788"))
        project = {"name": name, "plan": Path(plan).read_bytes().decode()}
        (run_dir / "project.json").write_text(json.dumps(project))
        return SimpleNamespace(seconds=1)

    monkeypatch.setattr(openai_codex, "AsyncCodex", FakeCodex)
    monkeypatch.setattr(session, "run_session", fake_session)
    monkeypatch.setattr(serve.time, "strftime", lambda *_: "20260927-120000")

    def upload(plan_bytes, photo_bytes):
        return {
            "name": upload_name,
            "plan": {"name": "plan.png", "data": base64.b64encode(plan_bytes).decode()},
            "photos": [{"name": "photo.png", "data": base64.b64encode(photo_bytes).decode()}],
        }

    projects = [
        await serve.furnished_flat(upload(b"first plan", b"first photo"), tmp_path, tmp_path / "runs", lambda _: None),
        await serve.furnished_flat(upload(b"second plan", b"second photo"), tmp_path, tmp_path / "runs", lambda _: None),
    ]

    assert [name for name, *_ in calls] == [project_name, project_name]
    assert calls[0][1] != calls[1][1]
    assert all(len(run_dir.name) <= 56 for _, run_dir, _, _ in calls)
    assert [asset["id"] for asset in assets] == [f"built-{run_dir.name}-{job.id}" for _, run_dir, _, _ in calls]
    assert [plan.read_bytes() for _, _, plan, _ in calls] == [b"first plan", b"second plan"]
    assert [photos[0].read_bytes() for _, _, _, photos in calls] == [b"first photo", b"second photo"]
    assert projects == [{"name": project_name, "plan": "first plan"}, {"name": project_name, "plan": "second plan"}]
    assert [json.loads((run_dir / "project.json").read_text()) for _, run_dir, _, _ in calls] == projects
