"""Name ranking through search, without models or a database."""
import numpy as np
import pytest
import search as catalog
from test_search import FakeConn, _row

NAME = 'Framed print, Kandinsky Painting with Green Center, thin black metal frame 50 x 50'


def run(monkeypatch, names, text, **kwargs):
    rows = []
    for i, name in enumerate(names):
        row = list(_row(str(i)))
        row[1] = name
        rows.append(tuple(row))
    monkeypatch.setattr(catalog, '_text_vec', lambda *args: np.ones(1))
    monkeypatch.setattr(catalog, '_sims', lambda conn, ids, *args: np.linspace(1, -1, len(ids)))
    conn = FakeConn(rows)
    result = catalog.search(conn, catalog.Query(text=text, **kwargs))
    assert 'limit' not in conn.sql[0].lower()
    assert catalog.PLACEABLE in conn.sql[0]
    return result


@pytest.mark.parametrize('text', [NAME, NAME.upper(), NAME.replace('Center', 'Céntér'),
    'Kandinsky Painting with Green Center', 'Green Center', 'center green painting kandinsky'])
def test_literal_match_survives_vector_rank_and_paging(monkeypatch, text):
    result = run(monkeypatch, [f'Other artwork number {i}' for i in range(25)] + [NAME], text, limit=20)
    assert result['candidates'] == 26
    assert result['results'][0]['name'] == NAME


def test_exact_beats_phrase_and_all_tokens(monkeypatch):
    names = ['Green abstract Center', 'Framed Green Center print', 'Green Center']
    result = run(monkeypatch, names, 'Green Center', weights={'text': 100})
    assert [r['name'] for r in result['results']] == names[::-1]


def test_generic_partial_matches_preserve_descriptive_scores(monkeypatch):
    names = ['Lounge seat', 'Oak sofa', 'Velvet armchair', 'Blue chair']
    result = run(monkeypatch, names, 'blue velvet sofa')
    assert [r['name'] for r in result['results']] == names
    assert [r['score'] for r in result['results']] == [1, 0.667, 0.333, 0]


def test_exact_variant_represents_family(monkeypatch):
    names = ['Rivet Uptown Sofa, Navy', 'Rivet Uptown Sofa, Green']
    result = run(monkeypatch, names, names[-1])
    assert len(result['results']) == 1
    assert result['results'][0]['name'] == names[-1]


def test_name_does_not_bypass_price(monkeypatch):
    assert run(monkeypatch, [NAME], NAME, price_max=0)['results'] == []


@pytest.mark.parametrize('query,name,tier,partial', [
    ('painting green center', 'Green center', 0, True),
    ('the green center', 'Green Center', 1, False),
    ('art', 'Cart', 0, False), ('the and', 'The and', 0, False),
    ('!!!', None, 0, False), ('kandinsky center', 'Kandinsky circles', 0, True),
])
def test_token_boundaries_stopwords_partial(query, name, tier, partial):
    actual, bonus = catalog._name_match(catalog._name_words(query), name)
    assert actual == tier
    assert (0 < bonus <= 0.1) if partial else bonus == 0
