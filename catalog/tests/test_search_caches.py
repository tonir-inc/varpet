"""Hot-path caches: repeated query texts reuse their embedding; kind vocabulary is not recounted per search."""
import sys
import types

import numpy as np

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
