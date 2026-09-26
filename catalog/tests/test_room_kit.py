"""Room kits use fake placeable records and image vectors, never DB/model/network."""
import copy
from contextlib import nullcontext

import numpy as np
import pytest

import room_kit as rk
import search


def item(iid, kind, size, price=10000, style='modern', color='beige', **extra):
    return dict(id=iid, name=iid.replace('_', ' '), kind=kind, size_m=list(size),
                price=price, currency='AMD', styles=[style], color_std=[color],
                tags={'astra': {'style': [style], 'main_color': color}}, **extra)


@pytest.fixture
def inventory(monkeypatch):
    rows = [item('sofa_'+str(i), 'sofa', [2, .8, .8], 100000) for i in range(4)]
    rows += [item('rustic_sofa', 'sofa', [2, .8, .8], 100000, 'rustic', 'red'),
             item('oversized_sofa', 'sofa', [5, .8, .8], 10000),
             item('rug', 'rug', [2, 2, .02]), item('huge_rug', 'rug', [5, 5, .02]),
             item('coffee_table', 'table', [1.1, .5, .4]),
             item('side_table', 'table', [.4, .4, .65]),
             item('floor_lamp', 'lamp', [.2, .2, 1.5]),
             item('accent_chair', 'chair', [.5, .5, .8]),
             item('shelf', 'shelf', [.6, .3, 1.5]),
             item('plant', 'plant', [.15, .15, .4]),
             item('wall_art', 'wall_art', [.6, .03, .6]),
             item('cushion', 'cushion', [.3, .3, .1]),
             item('throw', 'throw_blanket', [.5, .4, .1]),
             item('vase', 'vase', [.1, .1, .2]),
             item('giant_vase', 'vase', [2, 2, 1]),
             item('books', 'books', [.2, .1, .1]),
             item('bed', 'bed', [1.4, 2, .6], 100000),
             item('nightstand', 'nightstand', [.4, .3, .6]),
             item('table_lamp', 'lamp', [.15, .15, .3]),
             item('wardrobe', 'wardrobe', [.8, .4, 1.8]),
             item('mirror', 'mirror', [.4, .03, .8]),
             item('desk', 'desk', [1, .5, .75]),
             item('dining_table', 'table', [1.4, .8, .75]),
             item('outdoor_chair', 'chair', [.4, .4, .7], style='outdoor'),
             item('outdoor_table', 'table', [.6, .6, .7], style='outdoor'),
             item('lantern', 'lantern', [.1, .1, .2], style='outdoor'),
             item('bench', 'bench', [.8, .3, .5])]
    monkeypatch.setattr(rk, '_load_items', lambda conn: copy.deepcopy(rows))
    # A real shared image matrix, not a stubbed similarity score.
    index = {r['id']: i for i, r in enumerate(rows)}
    matrix = np.array([[0., 1.] if 'rustic' in r['id'] else [1., 0.] for r in rows])
    monkeypatch.setattr(search, '_emb_matrix', lambda *args: (index, matrix))
    return rows


def kit(**kwargs):
    return rk.room_kit(None, 'living', [4, 4], **kwargs)


def test_coherent_style_and_palette(inventory):
    result = kit(style='modern', colors=['beige'])
    assert result['kit'][0]['kind'] == 'sofa'
    assert all('rustic' not in r['id'] for r in result['kit'])
    assert 'beige' in result['palette']
    assert result['style'] == 'modern'
    assert all(r['why'] for r in result['kit'])


def test_sizes_supports_and_floor_budget(inventory):
    result = kit(richness='rich')
    roles = {r['role']: r for r in result['kit']}
    assert roles['sofa']['size_m'][0] <= .8 * 4
    rug, table = roles['rug']['size_m'], roles['coffee_table']['size_m']
    assert all(.5 * 4 <= x <= .75 * 4 for x in rug[:2])
    assert all(x > y for x, y in zip(rug, table[:2]))
    assert .5 * roles['sofa']['size_m'][0] <= table[0] <= 2/3 * roles['sofa']['size_m'][0]
    for r in roles.values():
        if r['placement'].startswith('on:'):
            top = roles[r['placement'][3:]]['size_m']
            assert all(x < y for x, y in zip(sorted(r['size_m'][:2]), sorted(top[:2])))
    assert sum(r['size_m'][0]*r['size_m'][1] for r in roles.values() if r['placement']=='floor') <= .45*16


def test_budget_and_impossible_budget(inventory):
    for budget in [0, 50000, 130000, 300000]:
        result = kit(budget_amd=budget, richness='rich')
        assert result['total_amd'] == sum(r['price'] for r in result['kit']) <= budget
        assert result['budget_left'] == budget-result['total_amd']
        if budget < 100000:
            assert result['notes']


def test_richness_and_seed(inventory):
    assert len(kit(richness='essential')['kit']) < len(kit()['kit']) < len(kit(richness='rich')['kit'])
    assert kit(seed=3) == kit(seed=3)
    assert len({kit(seed=i)['kit'][0]['id'] for i in range(10)}) > 1


def test_exclusions_and_owned_anchor(inventory):
    result = kit(keep_ids=['sofa_2'], exclude_kinds=['rug'], exclude_ids=['floor_lamp'], budget_amd=40000)
    assert result['kit'][0]['id'] == 'sofa_2'
    assert not any(r['kind']=='rug' or r['id']=='floor_lamp' for r in result['kit'])
    assert result['total_amd'] == sum(r['price'] for r in result['kit'] if r['id']!='sofa_2') <= 40000
    with pytest.raises(ValueError, match='keep'):
        kit(keep_ids=['unknown'])
    with pytest.raises(ValueError, match='keep'):
        kit(keep_ids=['sofa_2'], exclude_ids=['sofa_2'])


def test_balcony_outdoor_furniture(inventory):
    result = rk.room_kit(None, 'balcony', [3, 3], richness='rich')
    assert result['style'] == 'outdoor'
    furniture = [r for r in result['kit'] if r['kind'] in ('chair','table')]
    assert furniture and all('outdoor' in r['id'] for r in furniture)


@pytest.mark.parametrize('room', ['bedroom','dining','office','kids','entry','balcony'])
def test_room_programs_and_unique_roles(inventory, room):
    result = rk.room_kit(None, room, [5, 5], richness='rich')
    assert result['kit']
    assert len({r['role'] for r in result['kit']}) == len(result['kit'])
    assert {r['id'] for r in result['kit']} <= {r['id'] for r in inventory}
    if room=='bedroom':
        assert {'bed','nightstand','nightstand_2','bedside_lamp','bedside_lamp_2'} <= {r['role'] for r in result['kit']}
    if room=='dining':
        assert len([r for r in result['kit'] if r['role'].startswith('dining_chair')]) == 4


def test_loader_has_placeable_scope_and_no_per_slot_queries():
    class Conn:
        def execute(self, sql):
            assert search.PLACEABLE in sql
            assert 'coalesce(fit_size_m, size_m)' in sql
            self.calls = getattr(self, 'calls', 0)+1
            return self
        def fetchall(self):
            return []
    conn = Conn()
    assert rk._load_items(conn) == []
    assert conn.calls == 1


@pytest.mark.parametrize('kwargs', [{'room_size':[0,4]}, {'room_size':[4]}, {'room_size':[float('nan'),4]},
                                   {'room_type':'kitchen'}, {'richness':'extra'}, {'budget_amd':-1}])
def test_validation_before_db(kwargs):
    args = dict(room_type='living', room_size=[4,4]); args.update(kwargs)
    with pytest.raises(ValueError):
        rk.room_kit(None, **args)


def test_mcp_wrapper_and_show_kit(inventory, monkeypatch):
    import mcp_server
    monkeypatch.setattr(mcp_server, '_conn', lambda: nullcontext(None))
    result = mcp_server.room_kit('living', [4,4], richness='rich')
    seen = []
    monkeypatch.setattr(mcp_server, 'show_candidates', lambda item_ids, columns=4: seen.append(item_ids) or ['legend', 'image'])
    shown = mcp_server.show_kit(result['kit'])
    assert seen == [[r['id'] for r in result['kit']]]
    assert 'sofa' in shown[0] and '1.' in shown[0]
    assert shown[-1] == 'image'


def test_embedding_similarity_breaks_same_style_tie(inventory, monkeypatch):
    inventory.extend([item('visual_match', 'wall_art', [.6,.03,.6]), item('visual_mismatch','wall_art',[.6,.03,.6])])
    index = {r['id']:i for i,r in enumerate(inventory)}
    matrix = np.array([[1.,0.] if r['id'] in ('sofa_0','visual_match') else [0.,1.] for r in inventory])
    monkeypatch.setattr(search, '_emb_matrix', lambda *args: (index,matrix))
    result = kit(keep_ids=['sofa_0'], style='modern')
    assert next(r for r in result['kit'] if r['role']=='wall_art')['id']=='visual_match'


def test_alternatives_are_safe_single_replacements(inventory):
    inventory.extend([item('coffee_table_alt','table',[1.2,.55,.4]),
                      item('too_small_rug','rug',[1,1,.02]),
                      item('huge_coffee_table','table',[3,2,.4])])
    result = kit(budget_amd=300000, richness='rich')
    by_id = {r['id']:r for r in inventory}
    for role, ids in result['alternatives'].items():
        original = next(r for r in result['kit'] if r['role']==role)
        assert len(ids)<=2 and len(ids)==len(set(ids))
        for iid in ids:
            replacement = by_id[iid]
            assert iid != original['id']
            assert result['total_amd']-original['price']+replacement['price']<=300000
            trial = [{**r,**replacement} if r['role']==role else r for r in result['kit']]
            assert sum(r['size_m'][0]*r['size_m'][1] for r in trial if r['placement']=='floor')<=.45*16
    assert 'huge_coffee_table' not in result['alternatives']['coffee_table']
    assert 'coffee_table_alt' in result['alternatives']['coffee_table']


def test_rejects_unpriced_foreign_and_invalid_sizes(inventory):
    inventory.extend([item('cheap_sofa','sofa',[2,.8,.8],0,currency_override='USD'),
                      item('nan_sofa','sofa',[float('nan'),.8,.8],0),
                      item('free_sofa','sofa',[2,.8,.8],None)])
    inventory[-3]['currency']='USD'
    result = kit()
    assert not {'cheap_sofa','nan_sofa','free_sofa'} & {r['id'] for r in result['kit']}


def test_missing_embeddings_and_empty_catalog(inventory, monkeypatch):
    monkeypatch.setattr(search, '_emb_matrix', lambda *args: ({}, np.zeros((0,1))))
    assert kit()['kit']
    inventory.clear()
    result = kit()
    assert result['kit']==[] and result['notes']


def test_bed_clearance_prefers_fitting_bed(inventory):
    inventory.append(item('bed_large','bed',[2.8,2,.6],100000))
    result = rk.room_kit(None,'bedroom',[3,3])
    bed = next(r for r in result['kit'] if r['role']=='bed')
    assert bed['id']=='bed'
    assert bed['size_m'][0]+1.2<=3 and bed['size_m'][1]+.6<=3


def test_budget_reserves_essentials(inventory):
    inventory.append(item('premium_sofa','sofa',[2,.8,.8],129000))
    result = kit(budget_amd=130000, style='modern')
    assert {'sofa','rug','coffee_table'} <= {r['role'] for r in result['kit']}


def test_selection_at_catalog_scale(inventory, monkeypatch):
    from time import perf_counter
    inventory[:] = [{**r,'id':f'{r["id"]}_{n}'} for n in range(220) for r in inventory]
    index = {r['id']:i for i,r in enumerate(inventory)}
    matrix = np.ones((len(inventory),768),dtype=np.float32)
    monkeypatch.setattr(search, '_emb_matrix', lambda *args: (index,matrix))
    start = perf_counter()
    result = kit(richness='rich')
    elapsed = perf_counter()-start
    assert result['kit']
    print(f'room_kit fake catalog: {len(inventory)} items, {elapsed:.3f}s')
    assert elapsed < 2


def test_rich_living_large_rug_does_not_displace_furniture(inventory):
    inventory.extend([item('large_rug', 'rug', [2.7, 4.7, .02]),
                      item('second_art', 'wall_art', [.4, .03, .4])])
    result = rk.room_kit(None, 'living', [3.7, 6.4], style='scandinavian', richness='rich')
    assert {s.role for s in rk.PROGRAMS['living']} == {r['role'] for r in result['kit']}


@pytest.mark.parametrize('role', ['vase', 'candle', 'books', 'plant', 'cushion'])
def test_specific_decor_kinds_and_named_fallback(inventory, monkeypatch, role):
    monkeypatch.setitem(rk.PROGRAMS, 'entry', [rk.slot(role, role+'|decor')])
    inventory[:] = [item('Paddle_serving_board_oak', 'decor', [.1,.1,.1]),
                    item('modern_'+role, 'decor', [.1,.1,.1]),
                    item('specific', role, [.1,.1,.1], style='rustic')]
    result = rk.room_kit(None, 'entry', [3,3], style='modern')
    assert result['kit'][0]['id']=='specific'
    inventory.pop()
    assert rk.room_kit(None, 'entry', [3,3])['kit'][0]['id']=='modern_'+role
    inventory.pop()
    result = rk.room_kit(None, 'entry', [3,3])
    assert not result['kit'] and any('decor name' in n for n in result['notes'])


@pytest.mark.parametrize('name,size', [('AmazonBasics_Premium_Wall_Mount_Computer_Monitor_and_TV',[1,.4,.8]),
                                     ('bracket',[1,.4,.8]), ('cabinet',[1,.2,.8]),
                                     ('low_cabinet',[1,.4,.3])])
def test_storage_rejects_accessories_and_implausible_sizes(inventory, name, size):
    inventory[:] = [item(name,'cabinet',size)]
    result = rk.room_kit(None,'bedroom',[3.64,3.78])
    assert 'storage' not in {r['role'] for r in result['kit']}
    assert any('storage: omitted' in n and 'storage dimensions' in n for n in result['notes'])


def test_narrow_balcony_compact_safe_furniture(inventory):
    inventory.extend([item('Outdoor_Patio_Firepit','table',[.91,.91,.7],style='outdoor'),
                      item('outdoor_grill','table',[.4,.4,.7],style='outdoor'),
                      item('outdoor_heater','lamp',[.2,.2,1.5],style='outdoor'),
                      item('outdoor_lounge','chair',[.7,.88,.8],style='outdoor'),
                      item('folding_bistro_chair','chair',[.4,.4,.7],style='outdoor'),
                      item('hanging_plant','plant',[.1,.1,.2],style='outdoor')])
    result = rk.room_kit(None,'balcony',[1.5,2.9],richness='rich')
    roles = {r['role']:r for r in result['kit']}
    assert roles['outdoor_chair']['id']=='folding_bistro_chair'
    assert {'plant','lantern'} <= roles.keys()
    assert not any(any(word in r['id'].lower() for word in ('firepit','grill','heater','hanging')) for r in result['kit'])
    floor = [r for r in result['kit'] if r['placement']=='floor']
    assert sum(r['size_m'][0]*r['size_m'][1] for r in floor)<=min(.35*1.5*2.9,.9*2.9)
    assert all(min(r['size_m'][:2])<=.9 for r in floor)


def test_bedroom_queen_and_nightstands_leave_access(inventory):
    inventory[:] = [item('queen','bed',[1.6,2.1,.6]), item('king','bed',[2.02,2.1,.6]),
                    item('nightstand','nightstand',[.66,.4,.6]),item('lamp','lamp',[.15,.15,.3])]
    result = rk.room_kit(None,'bedroom',[3.64,3.78])
    roles = {r['role']:r for r in result['kit']}
    assert roles['bed']['id']=='queen'
    assert {'nightstand','nightstand_2','bedside_lamp','bedside_lamp_2'} <= roles.keys()
    assert roles['bed']['size_m'][0]+2*.66<=3.64
    inventory[:] = [r for r in inventory if r['kind']!='nightstand']
    result = rk.room_kit(None,'bedroom',[3.64,3.78])
    assert not any(r['placement'].startswith('on:nightstand') for r in result['kit'])
    assert any('missing support nightstand' in n for n in result['notes'])


def test_bed_never_relaxes_required_access(inventory):
    inventory[:] = [item('king','bed',[2.02,2.1,.6])]
    result = rk.room_kit(None,'bedroom',[2.5,2.5])
    assert not result['kit']
    assert any('0.6 m side and foot' in n for n in result['notes'])


def test_show_kit_same_arguments_returns_mcp_image(inventory, monkeypatch):
    import asyncio
    from unittest.mock import MagicMock
    import mcp_server
    conn = MagicMock()
    conn.__enter__.return_value.execute.return_value.__iter__.return_value = iter([])
    monkeypatch.setattr(mcp_server,'_conn',lambda: conn)
    # Unknown thumbnail rows produce a real JPEG sheet without any fetch or DB.
    result = asyncio.run(mcp_server.server.call_tool('show_kit', {
        'room_type':'living','room_size':[3.7,6.4], 'style':'scandinavian',
        'richness':'rich','seed':2,
    }))
    content = result.content
    assert any(getattr(block,'type',None)=='image' for block in content)


def test_headboard_and_sofa_back_height_do_not_reject_tables(inventory):
    for r in inventory:
        if r['kind'] in ('bed', 'sofa'):
            r['size_m'][2] = 1.2
    assert 'side_table' in {r['role'] for r in kit()['kit']}
    result = rk.room_kit(None, 'bedroom', [3.64,3.78])
    assert {'nightstand','nightstand_2'} <= {r['role'] for r in result['kit']}
