"""Pure photo retrieval rank and metric checks: no database or network."""
from copy import deepcopy

import pytest

from eval.photo_match import metrics, ranks


def item(iid="true", name="Rivet Uptown Sofa, Navy", kind="sofa"):
    return {"id": iid, "name": name, "kind": kind}


def test_family_can_precede_exact_without_mutating_inputs():
    results = [item("variant", "Rivet Uptown Sofa, Ivory"), item(), item()]
    before = deepcopy(results)
    assert ranks(item(), results) == {"exact_rank": 2, "family_rank": 1}
    assert results == before


@pytest.mark.parametrize("rank", [1, 5, 10, 11])
def test_rank_boundaries(rank):
    results = [item(str(i), "Different Product") for i in range(rank - 1)] + [item()]
    expected = rank if rank <= 10 else None
    assert ranks(item(), results) == {"exact_rank": expected, "family_rank": expected}


def test_misses_and_different_kinds():
    assert ranks(item(), []) == {"exact_rank": None, "family_rank": None}
    assert ranks(item(), [item("other", kind="chair")]) == {
        "exact_rank": None, "family_rank": None,
    }


def test_unnamed_products_do_not_share_a_family_but_exact_still_counts():
    assert ranks(item(name=None), [item("other", name=None), item(name=None)]) == {
        "exact_rank": 2, "family_rank": 2,
    }


def test_metrics_include_misses_and_cutoffs():
    rows = [
        {"exact_rank": 1, "family_rank": 1},
        {"exact_rank": 5, "family_rank": 2},
        {"exact_rank": 10, "family_rank": 5},
        {"exact_rank": None, "family_rank": 10},
        {"exact_rank": None, "family_rank": None},
    ]
    before = deepcopy(rows)
    assert metrics(rows) == {
        "exact": {1: 0.2, 5: 0.4, 10: 0.6},
        "family": {1: 0.2, 5: 0.6, 10: 0.8},
    }
    assert rows == before


def test_empty_metrics_are_undefined():
    assert metrics([]) == {
        "exact": {1: None, 5: None, 10: None},
        "family": {1: None, 5: None, 10: None},
    }
