"""Hot-path caches: repeated query texts reuse their embedding; kind vocabulary is not recounted per search."""
import sys
import types

import numpy as np
import psycopg

import search


def test_text_vector_is_cached(monkeypatch):
    calls = []
    fake = types.SimpleNamespace(text=lambda t, m: calls.append(t) or np.ones(4, np.float32))
    monkeypatch.setitem(sys.modules, "embed_siglip_query", fake)
    search._cached_text_vec.cache_clear()
    a = search._text_vec(None, "Oak Sofa ", "m")
    b = search._text_vec(None, "oak sofa", "m")
    assert calls == ["oak sofa"] and np.array_equal(a, b)


class Conn:
    def __init__(self):
        self.n = 0

    def execute(self, sql, *args):
        self.n += 1
        return types.SimpleNamespace(fetchall=lambda: [("sofa", 3)])


def test_kind_counts_cached_within_ttl(monkeypatch):
    search._KINDS.clear()
    c = Conn()
    assert search.kind_counts(c) == {"sofa": 3}
    assert search.kind_counts(c) == {"sofa": 3}
    assert c.n == 1
    monkeypatch.setattr(search, "KIND_TTL_S", -1)
    search.kind_counts(c)
    assert c.n == 2


class RowsConn(psycopg.Connection):
    def __new__(cls):
        return object.__new__(cls)

    def __init__(self):
        self.row_queries = 0

    def execute(self, sql, args=()):
        if "count(*), max(ingested_at)" in sql:
            return types.SimpleNamespace(fetchone=lambda: (10, "t0"))
        self.row_queries += 1
        row = ("abo:1", "Oak sofa", "sofa", [2.0, 0.9, 0.8], "confirmed", 1000, ["Beige"], None, [], [], None, None,
               "x.glb", {}, {"astra": {"style": "japandi"}}, 0.0, "AMD", "abo", "mock")
        return types.SimpleNamespace(fetchall=lambda: [row])


def test_candidate_rows_shared_across_texts_and_fts_uncached():
    search._ROWS.clear()
    search._ROWS_VER.update(t=float("-inf"), v=None)
    c = RowsConn()
    a = search._candidate_rows(c, ["kind = any(%s)"], [["sofa"]])
    b = search._candidate_rows(c, ["kind = any(%s)"], [["sofa"]])
    assert c.row_queries == 1 and a is b and a[0][0]["id"] == "abo:1"
    search._candidate_rows(c, ["kind = any(%s)"], [["sofa"]], fts_text="oak")
    assert c.row_queries == 2
