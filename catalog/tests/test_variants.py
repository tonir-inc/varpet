"""Variant grouping and search regressions without a database or network."""
from copy import deepcopy

import pytest

from search import Query, collapse_variants, family_key, search


UPTOWN = "Amazon Brand – Rivet Uptown Mid-Century Velvet Tufted Sofa"


@pytest.mark.parametrize("suffix", [
    '78"W, Navy & Black', '78"W, Navy & Brass', '60.5"W, Ivory',
    '160 cm, Charcoal', '78"W, Green & Walnut',
])
def test_uptown_variants(suffix):
    assert family_key(f"{UPTOWN}, {suffix}", "sofa") == family_key(UPTOWN, "sofa")


def test_different_products_and_kinds():
    assert family_key('Rivet Revolve Sofa, 80"W, Denim Blue', 'sofa') != family_key(
        'Rivet Uptown Sofa, 78"W, Navy', 'sofa')
    assert family_key(UPTOWN, 'sofa') != family_key(UPTOWN, 'chair')


def test_normalisation_and_none():
    assert family_key('RIVET Uptown Navy 60.5"W Sofa!', 'sofa') == family_key(
        'Rivet Uptown ivory 160 cm Sofa', 'sofa')
    assert family_key(None, 'sofa') is None


def item(iid, score, name=UPTOWN, kind='sofa'):
    return dict(id=iid, score=score, name=name, kind=kind,
                colors_astra=['blue'], price=100, size_m=[2, 1, 1])


def test_collapse_best_score_variants_cap_and_purity():
    items = [item(str(i), i / 10) for i in range(11)]
    items += [item('different', 0.95, 'Rivet Revolve Sofa'), item('chair', 0.5, kind='chair')]
    before = deepcopy(items)
    result = collapse_variants(items)
    assert [r['id'] for r in result] == ['10', 'different', 'chair']
    assert result[0]['variants'] == [
        {k: items[i][k] for k in ('id', 'colors_astra', 'price', 'size_m')}
        for i in range(9, 1, -1)
    ]
    assert result[1]['variants'] == []
    assert items == before


def test_unnamed_items_are_independent_and_ties_keep_input_order():
    result = collapse_variants([item('a', 1, None), item('b', 1, None),
                                item('c', 1), item('d', 1)])
    assert [r['id'] for r in result] == ['a', 'b', 'c']
    assert [v['id'] for v in result[2]['variants']] == ['d']
    assert collapse_variants([]) == []


class Candidates:
    """In-memory rows at the connection boundary; no database is opened."""
    def __init__(self, rows):
        self.rows = rows

    def execute(self, *_):
        return self

    def fetchall(self):
        return self.rows


def row(iid, name, rank, price=100):
    return (iid, name, 'sofa', [2, 1, 1], 'confirmed', price, [], [], [], [],
            None, None, None, {}, {}, rank)


def test_search_limits_families_after_filtering_and_can_disable_collapse():
    rows = [row(str(i), f'{UPTOWN}, Navy', 10 - i) for i in range(5)]
    rows += [row('other', 'Rivet Revolve Sofa', 2), row('expensive', UPTOWN, 20, 1000)]
    q = Query(text='sofa', text_mode='fts', price_max=100, limit=2)
    result = search(Candidates(rows), q)
    assert result['candidates'] == 6
    assert [r['id'] for r in result['results']] == ['0', 'other']
    assert [v['id'] for v in result['results'][0]['variants']] == ['1', '2', '3', '4']
    q.collapse_variants = False
    result = search(Candidates(rows), q)
    assert [r['id'] for r in result['results']] == ['0', '1']
    assert all('variants' not in r for r in result['results'])


def test_nearest_misses_unaffected():
    rows = [row('a', UPTOWN, 1), row('b', UPTOWN, 2)]
    collapsed = search(Candidates(rows), Query(price_max=0))
    uncollapsed = search(Candidates(rows), Query(price_max=0, collapse_variants=False))
    assert collapsed == uncollapsed
    assert len(collapsed['nearest_misses']) == 2
