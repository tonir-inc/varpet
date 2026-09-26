"""Offline contracts for the generation worker; no services or model calls."""

import importlib
import math

import pytest


@pytest.fixture
def worker():
    return importlib.import_module("generate_worker")


def test_graph_without_reference(worker):
    row = {"id": 17, "description": "Oak chair", "kind": "chair", "size_m": [0.5, 0.6, 0.9]}
    assert worker.build_graph(row) == {
        "flat": "gen-17", "jobs": [{
            "id": "piece", "kind": "piece", "brief": "Oak chair Kind: chair",
            "size": [0.5, 0.6, 0.9], "skills": ["part-dsl-draft"],
            "effort": "low", "refs": [],
        }],
    }


def test_graph_reference_is_repo_relative(worker, tmp_path):
    row = {"id": 1, "description": "Chair", "kind": "chair", "size_m": [1, 1, 1]}
    repo = tmp_path / "repo"
    photo = tmp_path / "run" / "reference.png"
    assert worker.build_graph(row, photo, repo)["jobs"][0]["refs"] == ["../run/reference.png"]


def test_size_converts_y_up(worker):
    assert worker.checked_size([2, 0.8, 1], [2, 1, 0.8]) == [2, 1, 0.8]


@pytest.mark.parametrize("axis", range(3))
@pytest.mark.parametrize("delta", [-0.05, 0.05])
def test_size_accepts_five_cm_boundary(worker, axis, delta):
    extents = [1, 1, 1]
    extents[axis] += delta
    worker.checked_size(extents, [1, 1, 1])


@pytest.mark.parametrize("axis", range(3))
@pytest.mark.parametrize("delta", [-0.05001, 0.05001])
def test_size_rejects_more_than_five_cm(worker, axis, delta):
    extents = [1, 1, 1]
    extents[axis] += delta
    with pytest.raises(ValueError, match="5 cm"):
        worker.checked_size(extents, [1, 1, 1])


@pytest.mark.parametrize("bad", [[1, 1], [0, 1, 1], [math.nan, 1, 1], [math.inf, 1, 1]])
def test_size_rejects_invalid_dimensions(worker, bad):
    with pytest.raises(ValueError):
        worker.checked_size(bad, [1, 1, 1])
    with pytest.raises(ValueError):
        worker.checked_size([1, 1, 1], bad)


@pytest.mark.parametrize("request_id", [None, 42])
def test_claim_sql_is_atomic_pending_only_and_parameterized(worker, request_id):
    sql, params = worker.claim_query("test-host", request_id)
    sql = " ".join(sql.lower().split())
    assert sql.startswith("update generation_request set status='building', worker=%s, updated_at=now()")
    assert "where id = (select id from generation_request where status='pending'" in sql
    assert "order by created_at for update skip locked limit 1) returning *" in sql
    assert ("and id=%s" in sql) == (request_id is not None)
    assert params == (("test-host",) if request_id is None else ("test-host", 42))


@pytest.mark.parametrize("report", [{}, {"faults": 1}, {"faults": "0"}])
def test_artifacts_reject_failed_or_missing_checks(worker, tmp_path, report):
    import json
    piece = tmp_path / "run" / "piece"
    piece.mkdir(parents=True)
    (piece / "piece.glb").write_bytes(b"placeholder")
    (piece / "report.json").write_text(json.dumps(report))
    with pytest.raises(ValueError, match="compiler"):
        worker.find_piece(tmp_path)


def test_artifacts_require_glb_and_accept_passed_checks(worker, tmp_path):
    piece = tmp_path / "run" / "piece"
    piece.mkdir(parents=True)
    (piece / "report.json").write_text('{"faults": 0}')
    with pytest.raises(ValueError, match="GLB"):
        worker.find_piece(tmp_path)
    glb = piece / "piece.glb"
    glb.write_bytes(b"placeholder")
    assert worker.find_piece(tmp_path) == glb


@pytest.mark.parametrize("error", [RuntimeError("build failed"), KeyboardInterrupt("shutdown")])
def test_claimed_request_is_failed_on_build_error_or_shutdown(worker, monkeypatch, error):
    from contextlib import nullcontext
    from unittest.mock import Mock

    row = {"id": 17}
    connection = Mock()
    connection.transaction.side_effect = nullcontext
    connection.execute.return_value.fetchone.return_value = row
    monkeypatch.setattr(worker, "build_piece", Mock(side_effect=error))
    failed = Mock()
    monkeypatch.setattr(worker, "fail_request", failed)
    if isinstance(error, KeyboardInterrupt):
        with pytest.raises(KeyboardInterrupt):
            worker.handle_one(connection, "unused")
    else:
        assert worker.handle_one(connection, "unused") is False
    failed.assert_called_once_with(connection, "unused", 17, error)


def test_empty_queue_does_not_build(worker, monkeypatch):
    from contextlib import nullcontext
    from unittest.mock import Mock

    connection = Mock()
    connection.transaction.side_effect = nullcontext
    connection.execute.return_value.fetchone.return_value = None
    build = Mock()
    monkeypatch.setattr(worker, "build_piece", build)
    assert worker.handle_one(connection, "unused") is None
    build.assert_not_called()


def test_failure_reason_is_truncated_and_cannot_overwrite_done(worker):
    from unittest.mock import Mock

    connection = Mock()
    worker.fail_request(connection, "unused", 17, ValueError("x" * 600))
    sql, params = connection.execute.call_args.args
    assert "status='building'" in sql
    assert params == ("x" * 500, 17)
