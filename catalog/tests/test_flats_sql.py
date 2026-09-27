"""Opt-in real PostgreSQL tests.

Apply fixes/2026-09-27-flats-schema.sql as admin first, then set
VARPET_FLATS_TEST_DB to a connection URL (varpet_ro works). Only test-created
UUIDs are removed; existing workspace records and schema are never changed.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import psycopg
import pytest
from flats import FlatError, PostgresRepository

pytestmark = pytest.mark.skipif(not os.getenv("VARPET_FLATS_TEST_DB"), reason="VARPET_FLATS_TEST_DB is not set")


def payload(marker=1):
    return {"name": "flats SQL test", "kind": "blank", "designed": False,
            "scene": {"version": 2, "rooms": [], "marker": marker}, "catalog": [{"id": str(marker)}],
            "summary": {"rooms": 0}, "updated_by": "SQL test"}


@pytest.fixture
def db():
    def connect():
        return psycopg.connect(os.environ["VARPET_FLATS_TEST_DB"], connect_timeout=5,
                               options="-c statement_timeout=15000")
    return PostgresRepository(connect)


@pytest.fixture
def flat(db):
    row = db.create(payload())
    try:
        yield str(row["id"])
    finally:
        with db.connect() as conn:
            conn.execute("DELETE FROM flats.flat WHERE id = %s", (row["id"],))


def test_roundtrip_rename_thumbnail_and_soft_delete(db, flat):
    loaded = db.get(flat)
    assert loaded["scene"] == payload()["scene"]
    assert loaded["catalog"] == payload()["catalog"]
    assert loaded["revision"] == 1
    assert db.rename(flat, {"name": "Renamed"})["revision"] == 1
    db.save(flat, {**payload(2), "base_revision": 1, "thumbnail": b"PNG", "thumbnail_type": "image/png"})
    assert db.thumbnail(flat) == (b"PNG", "image/png")
    assert db.get(flat)["has_thumbnail"] is True
    assert flat in {str(row["id"]) for row in db.list()}
    db.delete(flat)
    assert flat not in {str(row["id"]) for row in db.list()}
    assert flat in {str(row["id"]) for row in db.list(True)}
    for call in (lambda: db.get(flat), lambda: db.thumbnail(flat), lambda: db.versions(flat),
                 lambda: db.version(flat, 1), lambda: db.restore(flat, {"revision": 1}),
                 lambda: db.save(flat, {**payload(), "base_revision": 2}),
                 lambda: db.rename(flat, {"name": "Hidden"})):
        with pytest.raises(FlatError) as exc:
            call()
        assert exc.value.status == 404


def test_restore_creates_new_revision_preserving_history(db, flat):
    db.save(flat, {**payload(2), "base_revision": 1, "updated_by": "Second author"})
    assert db.restore(flat, {"revision": 1}) == {"revision": 3}
    assert db.get(flat)["scene"] == payload(1)["scene"]
    assert db.version(flat, 2)["scene"] == payload(2)["scene"]
    assert db.version(flat, 3)["catalog"] == payload(1)["catalog"]
    versions = db.versions(flat)
    assert [v["revision"] for v in versions] == [3, 2, 1]
    assert [v["updated_by"] for v in versions] == [None, "Second author", "SQL test"]
    assert all(v["bytes"] > 0 for v in versions)


def test_prune_keeps_exactly_latest_50_including_restore(db, flat):
    for base in range(1, 52):
        db.save(flat, {**payload(base + 1), "base_revision": base})
    assert [v["revision"] for v in db.versions(flat)] == list(range(52, 2, -1))
    with pytest.raises(FlatError):
        db.version(flat, 2)
    assert db.restore(flat, {"revision": 3}) == {"revision": 53}
    assert [v["revision"] for v in db.versions(flat)] == list(range(53, 3, -1))
    assert db.get(flat)["scene"] == payload(3)["scene"]


def test_concurrent_put_has_one_winner_one_conflict(db, flat):
    barrier = Barrier(2)
    def save(marker):
        barrier.wait(timeout=10)
        try:
            return db.save(flat, {**payload(marker), "base_revision": 1})
        except FlatError as exc:
            return exc
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, [20, 30]))
    winners = [r for r in results if isinstance(r, dict)]
    errors = [r for r in results if isinstance(r, FlatError)]
    assert len(winners) == len(errors) == 1
    assert winners[0]["revision"] == 2
    assert errors[0].status == 409 and errors[0].error["current_revision"] == 2
    assert [v["revision"] for v in db.versions(flat)] == [2, 1]


def test_concurrent_restore_serializes_new_revisions(db, flat):
    barrier = Barrier(2)
    def restore(_):
        barrier.wait(timeout=10)
        return db.restore(flat, {"revision": 1})
    with ThreadPoolExecutor(max_workers=2) as pool:
        revisions = [r["revision"] for r in pool.map(restore, range(2))]
    assert sorted(revisions) == [2, 3]
    assert db.get(flat)["revision"] == 3


def test_failed_save_and_restore_roll_back_insert_and_prune(db, flat, monkeypatch):
    for base in range(1, 50):
        db.save(flat, {**payload(base + 1), "base_revision": base})
    original = db._insert_version
    def fail_after_insert(*args):
        original(*args)
        raise RuntimeError("injected failure after version insertion and pruning")
    monkeypatch.setattr(db, "_insert_version", fail_after_insert)
    for operation in (lambda: db.save(flat, {**payload(51), "base_revision": 50}),
                      lambda: db.restore(flat, {"revision": 1})):
        with pytest.raises(RuntimeError):
            operation()
        assert db.get(flat)["revision"] == 50
        assert [v["revision"] for v in db.versions(flat)] == list(range(50, 0, -1))


def test_failed_create_rolls_back_flat_and_version(db, monkeypatch):
    original = db._insert_version
    created = []
    def fail_after_insert(cursor, flat_id, *args):
        created.append(flat_id)
        original(cursor, flat_id, *args)
        raise RuntimeError("injected failure")
    monkeypatch.setattr(db, "_insert_version", fail_after_insert)
    try:
        with pytest.raises(RuntimeError):
            db.create(payload())
        with db.connect() as conn:
            assert conn.execute("SELECT count(*) FROM flats.flat WHERE id = %s", (created[0],)).fetchone()[0] == 0
            assert conn.execute("SELECT count(*) FROM flats.flat_version WHERE flat_id = %s", (created[0],)).fetchone()[0] == 0
    finally:
        with db.connect() as conn:
            for flat_id in created:
                conn.execute("DELETE FROM flats.flat WHERE id = %s", (flat_id,))
