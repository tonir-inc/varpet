"""Offline contract tests with a fake repository and SQL call assertions."""
import asyncio
import base64
import json
import threading
from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import psycopg
import pytest
from starlette.requests import Request
from starlette.testclient import TestClient
from starlette.applications import Starlette
import flats
import mcp_server

ID = str(uuid4())
NOW = datetime(2026, 9, 27, tzinfo=timezone.utc)
PAYLOAD = {"name": "My flat", "kind": "blank", "designed": False, "summary": {},
           "scene": {"version": 2, "rooms": [], "project": {"sources": [{"name": "plan"}]}}, "catalog": []}


class FakeRepository:
    """Spy stub; storage semantics are tested against SQL, not duplicated here."""
    def __init__(self):
        self.calls = []
        self.result = {"id": ID, "revision": 1, "updated_at": NOW}
        self.error = None

    def __getattr__(self, name):
        def call(*args):
            self.calls.append((name, args, threading.get_ident()))
            if self.error:
                raise self.error
            return self.result
        return call


@pytest.fixture
def repo():
    return FakeRepository()


def invoke(repo, action, method="POST", body=None, params=None, query="", headers=None, raw=None, chunks=None):
    stream = iter(chunks if chunks is not None else [raw if raw is not None else json.dumps(body).encode()])
    async def receive():
        try:
            return {"type": "http.request", "body": next(stream), "more_body": True}
        except StopIteration:
            return {"type": "http.request", "body": b"", "more_body": False}
    request = Request({"type": "http", "method": method, "path": "/flats", "path_params": params or {},
                       "query_string": query.encode(),
                       "headers": [(k.encode(), v.encode()) for k, v in (headers or {}).items()]}, receive)
    return asyncio.run(flats.make_route(repo, {method: action}, mcp_server._cors)(request))


def test_create_boundary_runs_off_event_loop(repo):
    response = invoke(repo, "create", body=PAYLOAD)
    assert response.status_code == 201
    assert json.loads(response.body)["revision"] == 1
    name, args, thread = repo.calls[0]
    assert name == "create" and args[0] == PAYLOAD
    assert thread != threading.get_ident()


@pytest.mark.parametrize("patch", [
    {"name": ""}, {"name": " "}, {"name": "x" * 121}, {"name": 12},
    {"scene": []}, {"scene": {"rooms": []}}, {"scene": {"version": 2}},
    {"catalog": {}}, {"kind": "bad"}, {"kind": []}, {"designed": 1},
    {"summary": []}, {"updated_by": 123}, {"thumbnail": None},
    {"thumbnail": "data:image/svg+xml;base64,YQ=="}, {"thumbnail": "data:image/png;base64,???"},
    {"thumbnail": "data:image/png;base64,"},
])
def test_invalid_create(repo, patch):
    response = invoke(repo, "create", body={**PAYLOAD, **patch})
    assert response.status_code == 400
    assert json.loads(response.body)["error"]["message"]
    assert not repo.calls


@pytest.mark.parametrize("raw", [b"no", b"[]", b"null", b'{"x": NaN}', b'{"x": 1e400}',
                                      b'{"x":"\\ud800"}', b'{"x":"\\u0000"}', b'\xff'])
def test_bad_json(repo, raw):
    assert invoke(repo, "create", raw=raw).status_code == 400
    assert not repo.calls


@pytest.mark.parametrize("action,method,body", [("save", "PUT", {**PAYLOAD, "base_revision": True}),
    ("save", "PUT", PAYLOAD), ("restore", "POST", {"revision": -1}),
    ("rename", "PATCH", {"name": "x" * 121})])
def test_invalid_other_mutations(repo, action, method, body):
    assert invoke(repo, action, method, body, {"flat_id": ID}).status_code == 400
    assert not repo.calls


def test_uuid_and_revision_validation(repo):
    for action in ("get", "save", "rename", "delete", "thumbnail", "versions", "version", "restore"):
        assert invoke(repo, action, params={"flat_id": "bad"}).status_code == 400
    for revision in ("bad", "0", "-1", "2147483648"):
        assert invoke(repo, "version", "GET", params={"flat_id": ID, "revision": revision}).status_code == 400
    assert not repo.calls


def test_conflict_response(repo):
    repo.error = flats.FlatError(409, "conflict", "Flat has a newer revision",
                                current_revision=8, updated_at=NOW, updated_by="Sergey")
    response = invoke(repo, "save", "PUT", {**PAYLOAD, "base_revision": 7}, {"flat_id": ID})
    assert response.status_code == 409
    assert json.loads(response.body)["error"] == {"code": "conflict", "message": "Flat has a newer revision",
        "current_revision": 8, "updated_at": NOW.isoformat(), "updated_by": "Sergey"}


def test_restore_response(repo):
    repo.result = {"revision": 9}
    response = invoke(repo, "restore", body={"revision": 2}, params={"flat_id": ID})
    assert json.loads(response.body) == {"revision": 9}
    assert repo.calls[0][:2] == ("restore", (ID, {"revision": 2}))


def test_list_requests_active_only_by_default(repo):
    repo.result = []
    for query, expected in (("", False), ("include_deleted=0", False), ("include_deleted=1", True)):
        assert json.loads(invoke(repo, "list", "GET", query=query).body) == {"flats": []}
        assert repo.calls[-1][:2] == ("list", (expected,))
    assert invoke(repo, "list", "GET", query="include_deleted=true").status_code == 400


@pytest.mark.parametrize("mime", ["image/jpeg", "image/png", "image/webp"])
def test_thumbnail_limit_and_response(repo, mime):
    data = b"a" * flats.MAX_THUMBNAIL
    value = f"data:{mime};base64," + base64.b64encode(data).decode()
    assert invoke(repo, "create", body={**PAYLOAD, "thumbnail": value}).status_code == 201
    assert repo.calls[0][1][0]["thumbnail"] == data
    assert repo.calls[0][1][0]["thumbnail_type"] == mime
    repo.result = (data, mime)
    response = invoke(repo, "thumbnail", "GET", params={"flat_id": ID})
    assert response.body == data and response.headers["content-type"] == mime
    assert response.headers["cache-control"] == "no-store"
    value = f"data:{mime};base64," + base64.b64encode(data + b"a").decode()
    assert invoke(repo, "create", body={**PAYLOAD, "thumbnail": value}).status_code == 400


def test_body_limit_header_and_chunked(repo):
    response = invoke(repo, "create", headers={"content-length": str(flats.MAX_BODY + 1)})
    assert response.status_code == 413
    assert "25 MB" in json.loads(response.body)["error"]["message"]
    for headers in ({}, {"content-length": "1"}):
        assert invoke(repo, "create", chunks=[b" " * flats.MAX_BODY, b"x"], headers=headers).status_code == 413
    assert not repo.calls
    raw = json.dumps(PAYLOAD).encode()
    assert invoke(repo, "create", raw=raw + b" " * (flats.MAX_BODY - len(raw))).status_code == 201


def test_errors_and_cors(repo):
    for error, status in ((flats.FlatError(404, "not_found", "Flat or version not found"), 404),
                          (psycopg.OperationalError("SECRET SCENE"), 503)):
        repo.error = error
        response = invoke(repo, "get", "GET", params={"flat_id": ID}, headers={"origin": "http://localhost:5173"})
        assert response.status_code == status and b"SECRET" not in response.body
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    response = invoke(repo, "list", "OPTIONS", headers={"origin": "https://external.example"})
    assert response.status_code == 204 and "access-control-allow-origin" not in response.headers


def test_registered_http_routes(monkeypatch):
    monkeypatch.setattr(mcp_server.flats_repository, "list", lambda include: [])
    client = TestClient(Starlette(routes=mcp_server.server._custom_starlette_routes))
    assert client.get("/flats").json() == {"flats": []}
    for path, method in (("/flats", "post"), (f"/flats/{ID}", "put"), (f"/flats/{ID}", "patch"),
                         (f"/flats/{ID}/restore", "post")):
        assert getattr(client, method)(path, json={}).status_code == 400
    for suffix in ("", "/thumbnail", "/versions", "/versions/1"):
        assert client.get("/flats/not-a-uuid" + suffix).status_code == 400
    assert client.delete("/flats/not-a-uuid").status_code == 400


def mock_sql():
    connection = MagicMock()
    conn = connection.__enter__.return_value
    cursor = conn.cursor.return_value.__enter__.return_value
    return flats.PostgresRepository(lambda: connection), conn, cursor


def test_sql_list_has_no_payload_and_filters_deleted():
    repo, _, cursor = mock_sql()
    repo.list()
    sql, params = cursor.execute.call_args.args
    assert params == (False,)
    assert "deleted_at IS NULL" in sql and "updated_at DESC" in sql
    projection = sql.split("FROM")[0]
    assert "scene" not in projection and "catalog" not in projection
    assert "thumbnail IS NOT NULL AS has_thumbnail" in projection
    assert "thumbnail" not in projection.replace("thumbnail IS NOT NULL AS has_thumbnail", "")


def test_sql_conflict_locks_before_any_write():
    repo, conn, cursor = mock_sql()
    cursor.execute.return_value.fetchone.return_value = {"revision": 2, "updated_at": NOW, "updated_by": "A"}
    with pytest.raises(flats.FlatError) as error:
        repo.save(ID, {**PAYLOAD, "base_revision": 1})
    assert error.value.status == 409
    assert len(cursor.execute.call_args_list) == 1
    assert "FOR UPDATE" in cursor.execute.call_args.args[0]
    conn.transaction.assert_called_once()


def test_sql_restore_copies_to_new_revision_and_prunes_latest_50():
    repo, conn, cursor = mock_sql()
    cursor.execute.return_value.fetchone.side_effect = [
        {"revision": 70}, {"scene": PAYLOAD["scene"], "catalog": PAYLOAD["catalog"]}]
    assert repo.restore(ID, {"revision": 30}) == {"revision": 71}
    calls = [c.args for c in cursor.execute.call_args_list]
    assert "FOR UPDATE" in calls[0][0]
    assert calls[1][1] == (ID, 30)
    assert "INSERT INTO flats.flat_version" in calls[2][0]
    assert calls[2][1][:2] == (ID, 71)
    assert calls[2][1][2].obj == PAYLOAD["scene"]
    assert calls[3] == (flats.PRUNE_SQL, (ID, ID, 50))
    assert "ORDER BY revision DESC OFFSET %s" in calls[3][0]
    assert calls[4][1] == (71, ID)
    conn.transaction.assert_called_once()


def test_literal_unicode_escape_is_valid_text(repo):
    assert invoke(repo, "create", body={**PAYLOAD, "name": r"Literal \u0000 text"}).status_code == 201


def test_get_version_versions_rename_delete(repo):
    for action, expected in (("get", (ID,)), ("version", (ID, 2)), ("versions", (ID,)),
                             ("rename", (ID, {"name": "Renamed"})), ("delete", (ID,))):
        repo.result = [] if action == "versions" else {"revision": 2}
        response = invoke(repo, action, body={"name": "Renamed"}, params={"flat_id": ID, "revision": "2"})
        assert response.status_code == (204 if action == "delete" else 200)
        assert repo.calls[-1][:2] == (action, expected)
        if action == "delete":
            assert response.body == b""


def test_sql_save_inserts_then_updates_in_one_transaction():
    repo, conn, cursor = mock_sql()
    cursor.execute.return_value.fetchone.side_effect = [
        {"revision": 50, "designed": True, "summary": {"rooms": 2}},
        {"revision": 51, "updated_at": NOW}]
    data = {"scene": PAYLOAD["scene"], "catalog": [], "base_revision": 50}
    assert repo.save(ID, data)["revision"] == 51
    calls = [c.args for c in cursor.execute.call_args_list]
    assert "FOR UPDATE" in calls[0][0]
    assert "INSERT INTO flats.flat_version" in calls[1][0]
    assert calls[1][1][:2] == (ID, 51)
    assert calls[2] == (flats.PRUNE_SQL, (ID, ID, 50))
    assert "UPDATE flats.flat" in calls[3][0]
    assert calls[3][1][0:2] == (51, True)
    assert calls[3][1][2].obj == {"rooms": 2}
    assert calls[3][1][4] is False
    conn.transaction.assert_called_once()


def test_sql_create_rolls_back_on_version_failure():
    repo, conn, cursor = mock_sql()
    cursor.execute.side_effect = [MagicMock(), psycopg.DatabaseError("injected")]
    with pytest.raises(psycopg.DatabaseError):
        repo.create(PAYLOAD)
    assert conn.transaction.return_value.__exit__.call_args.args[0] is psycopg.DatabaseError
