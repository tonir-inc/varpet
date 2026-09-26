"""Coherent room purchases, selected locally from one PLACEABLE query.

This is a sizing heuristic, not a placement solver. Dimensions are [w, d, h].
No text model is loaded: Astra/listing words plus cached SigLIP image vectors rank.
"""
from dataclasses import dataclass
import hashlib
import math
import re

import numpy as np
import search
from colors import PALETTE, listing_palette

# Conservative, documented room/surface constraints. Rugs count toward floor area.
FLOOR_SHARE = .45
SOFA_WALL_SHARE = .8
BED_CLEARANCE = .6
RUG_MIN, RUG_MAX = .5, .75
COFFEE_MIN, COFFEE_MAX = .5, 2 / 3
HEIGHT_TOLERANCE = .25
SURFACE_SHARE = .8  # aggregate decor footprint on a support (not a packing proof)
MODEL = 'siglip2-base-patch16-224'


@dataclass(frozen=True)
class Slot:
    role: str
    kinds: tuple[str, ...]
    tier: int = 0
    placement: str = 'floor'
    share: float = 1
    repeat: bool = False


def slot(role, kinds, tier=0, placement='floor', share=1, repeat=False):
    return Slot(role, tuple(kinds.split('|')), tier, placement, share, repeat)


PROGRAMS = {
    'living': [slot('sofa','sofa',share=12), slot('rug','rug',share=3),
        slot('coffee_table','table',share=3), slot('side_table','table',1),
        slot('floor_lamp','lamp',1), slot('accent_chair','chair',1,share=4),
        slot('shelf','shelf|cabinet',1,share=4), slot('plant','plant',1),
        slot('wall_art','wall_art|wall_hanging',1,'wall'),
        slot('wall_art_2','wall_art|wall_hanging',2,'wall'),
        slot('cushion','cushion',2,'on:sofa'), slot('cushion_2','cushion',2,'on:sofa',repeat=True),
        slot('throw_blanket','throw_blanket',2,'on:sofa'),
        slot('vase','vase|decor',2,'on:coffee_table'), slot('books','books|candle',2,'on:shelf')],
    'bedroom': [slot('bed','bed',share=14), slot('nightstand','nightstand|table|cabinet',share=2),
        slot('nightstand_2','nightstand|table|cabinet',share=2,repeat=True),
        slot('bedside_lamp','lamp',placement='on:nightstand'),
        slot('bedside_lamp_2','lamp',placement='on:nightstand_2',repeat=True),
        slot('storage','wardrobe|dresser|cabinet',1,share=5), slot('rug','rug',1,share=3),
        slot('wall_art','wall_art',1,'wall'), slot('plant','plant',1),
        slot('cushion','cushion',2,'on:bed'), slot('throw_blanket','throw_blanket',2,'on:bed'),
        slot('mirror','mirror',2,'wall')],
    'dining': [slot('dining_table','table',share=12),
        *[slot('dining_chair' + (f'_{n}' if n>1 else ''),'chair',share=3,repeat=n>1) for n in range(1,7)],
        slot('floor_lamp','lamp',1), slot('sideboard','cabinet|dresser',1,share=4),
        slot('wall_art','wall_art',1,'wall'), slot('vase','vase',2,'on:dining_table')],
    'office': [slot('desk','desk|table',share=10), slot('office_chair','chair',share=5),
        slot('desk_lamp','lamp',placement='on:desk'), slot('shelf','shelf|cabinet',1,share=4),
        slot('plant','plant',1), slot('wall_art','wall_art',1,'wall'),
        slot('books','books',2,'on:shelf'), slot('picture_frame','picture_frame',2,'on:desk')],
    'kids': [slot('bed','bed',share=12), slot('desk','desk|table',share=5),
        slot('office_chair','chair',share=3), slot('shelf','shelf|cabinet',1,share=4),
        slot('desk_lamp','lamp',1,'on:desk'), slot('rug','rug',1,share=2),
        slot('wall_art','wall_art',1,'wall'), slot('toy','toy',2,'on:shelf'),
        slot('cushion','cushion',2,'on:bed'), slot('throw_blanket','throw_blanket',2,'on:bed')],
    'entry': [slot('bench','bench|stool',share=6), slot('storage','shoe_rack|cabinet',share=5),
        slot('mirror','mirror',1,'wall'), slot('coat_rack','coat_rack',1,share=2),
        slot('plant','plant',1), slot('wall_art','wall_art',2,'wall'),
        slot('tray','tray|bowl',2,'on:storage')],
    'balcony': [slot('outdoor_chair','chair|bench',share=6), slot('balcony_table','table',share=4),
        slot('outdoor_chair_2','chair',1,share=3,repeat=True), slot('plant','plant',1),
        slot('plant_2','plant',2,repeat=True), slot('lantern','lantern',2,'on:balcony_table')],
}


def _load_items(conn):
    fields = ('id','name','kind','size_m','price','currency','styles','color_std','tags')
    rows = conn.execute(f"""select id, name, kind, coalesce(fit_size_m, size_m), price,
        currency, styles, color_std, tags from item where {search.PLACEABLE} order by id""").fetchall()
    return [dict(zip(fields, row)) for row in rows]


def _words(value):
    return {str(v).lower().strip().replace('_','-') for v in search._words(value)}


def _prepare(row):
    r = dict(row)
    size = r.get('size_m')
    if not size or len(size)!=3 or any(not isinstance(x,(int,float)) or not math.isfinite(x) or not .01<=x<=20 for x in size):
        return None
    if not r.get('name') or not isinstance(r.get('price'), (int,float)) or not math.isfinite(r['price']) or r['price']<0 or r['price'] != int(r['price']) or r.get('currency')!='AMD':
        return None
    astra = (r.get('tags') or {}).get('astra') or {}
    r['_styles'] = _words(r.get('styles')) | _words(astra.get('style'))
    r['_colors'] = _words(astra.get('main_color')) | _words(astra.get('other_colors')) | set(listing_palette(r.get('color_std')))
    r['_text'] = r['name'].lower().replace('-', ' ')
    r['size_m'] = list(map(float,size))
    r['price'] = int(r['price'])
    return r


def _fits(a, b, strict=False):
    return all(x < y-1e-8 if strict else x <= y+1e-8 for x,y in zip(sorted(a), sorted(b)))


def _outdoor(r):
    return 'outdoor' in r['_styles'] or bool(re.search(r'\b(outdoor|patio|garden|balcony|bistro|zero gravity)\b', r['_text']))


def _chair_count(table):
    return min(6, max(2, 2 * int(max(table['size_m'][:2]) / .6)))


def _compatible(r, s, chosen, room, room_type, clear_bed=True):
    w,d,h = r['size_m']
    if r['kind'] not in s.kinds:
        return False
    mount = str((r.get('tags') or {}).get('extra',{}).get('placement','')).lower()
    if mount in ('wall','wall-mounted','ceiling','ceiling-mounted') and s.placement!='wall':
        return False
    if mount=='surface' and s.placement=='floor':
        return False
    if room_type=='balcony' and r['kind'] in ('chair','bench','table') and not _outdoor(r):
        return False
    if s.placement=='floor' and not _fits([w,d],room):
        return False
    if s.placement.startswith('on:'):
        parent = chosen.get(s.placement[3:])
        if not parent or not _fits([w,d],parent['size_m'][:2],strict=True):
            return False
        used = sum(x['size_m'][0]*x['size_m'][1] for x in chosen.values() if x['placement']==s.placement)
        if used+w*d > SURFACE_SHARE*math.prod(parent['size_m'][:2])+1e-8:
            return False
    if s.role=='sofa' and w>SOFA_WALL_SHARE*max(room):
        return False
    if s.role=='bed' and clear_bed and not _fits([w+2*BED_CLEARANCE,d+BED_CLEARANCE],room):
        return False
    if s.role=='rug':
        if not all(RUG_MIN*b-1e-8<=a<=RUG_MAX*b+1e-8 for a,b in zip(sorted([w,d]),sorted(room))):
            return False
        table = chosen.get('coffee_table')
        if table and not _fits(table['size_m'][:2],[w,d],strict=True):
            return False
    if s.role=='coffee_table':
        sofa = chosen.get('sofa')
        if not sofa or not COFFEE_MIN*sofa['size_m'][0]<=w<=COFFEE_MAX*sofa['size_m'][0] or not .25<=h<=.6:
            return False
        rug = chosen.get('rug')
        if rug and not _fits([w,d],rug['size_m'][:2],strict=True):
            return False
    if s.role=='side_table' or s.role.startswith('nightstand'):
        parent = chosen.get('sofa' if s.role=='side_table' else 'bed')
        target = parent['size_m'][2] if parent else .6
        if max(w,d)>.85 or abs(h-target)>HEIGHT_TOLERANCE:
            return False
    if s.role in ('dining_table','desk') and not .65<=h<=.85:
        return False
    if s.role=='dining_table' and sum(k.startswith('dining_chair') for k in chosen)>_chair_count(r):
        return False
    if s.role=='balcony_table' and (max(w,d)>1 or not .4<=h<=.85):
        return False
    if r['kind']=='lamp':
        if s.placement=='floor' and h<1:
            return False
        if s.placement.startswith('on:') and h>.85:
            return False
    if s.role.startswith('dining_chair'):
        table = chosen.get('dining_table')
        if not table or max(w,d)>.7 or h>1.3:
            return False
    if s.placement=='floor':
        used = sum(math.prod(x['size_m'][:2]) for x in chosen.values() if x['placement']=='floor')
        if used+w*d > FLOOR_SHARE*math.prod(room)+1e-8:
            return False
    return True


def _noise(seed, role, iid):
    return int.from_bytes(hashlib.sha256(f'{seed}:{role}:{iid}'.encode()).digest()[:8],'big')/2**64


def room_kit(conn, room_type, room_size, style=None, colors=None, budget_amd=None,
             richness='standard', exclude_kinds=None, exclude_ids=None, keep_ids=None, seed=0):
    """Return an ordered kit; totals count purchases only, keeps remain priced catalog records."""
    if room_type not in PROGRAMS:
        raise ValueError('room_type must be living, bedroom, dining, office, kids, entry or balcony')
    if len(room_size)!=2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v<=0 for v in room_size):
        raise ValueError('room_size must contain two finite positive metres [w, d]')
    if richness not in ('essential','standard','rich'):
        raise ValueError('richness must be essential, standard or rich')
    if budget_amd is not None and (isinstance(budget_amd,bool) or not isinstance(budget_amd,(int,float)) or not math.isfinite(budget_amd) or budget_amd<0 or budget_amd!=int(budget_amd)):
        raise ValueError('budget_amd must be a nonnegative integer')
    if not isinstance(seed,int) or isinstance(seed,bool):
        raise ValueError('seed must be an integer')
    palette_input = sorted(_words(colors))
    if any(c not in PALETTE for c in palette_input):
        raise ValueError('colors must be palette names from list_vocab')
    keep_ids = list(dict.fromkeys(keep_ids or []))
    excluded, kinds = set(exclude_ids or []), set(exclude_kinds or [])
    if excluded.intersection(keep_ids):
        raise ValueError('keep_ids conflict with exclude_ids')
    rows = [p for r in _load_items(conn) if (p:=_prepare(r)) is not None]
    by_id = {r['id']:r for r in rows}
    if any(i not in by_id or by_id[i]['kind'] in kinds for i in keep_ids):
        raise ValueError('keep_ids must be placeable, sized, AMD-priced catalog ids and not excluded kinds')
    rows = [r for r in rows if r['id'] not in excluded and r['kind'] not in kinds]
    level = ('essential','standard','rich').index(richness)
    slots = [s for s in PROGRAMS[room_type] if s.tier<=level and not set(s.kinds)<=kinds]
    chosen, notes, kept = {}, [], set(keep_ids)
    style = (style or ('outdoor' if room_type=='balcony' else '')).lower().strip()
    palette = palette_input[:]
    index, matrix = search._emb_matrix(conn, MODEL, 'image') if rows else ({},np.zeros((0,1)))
    # One matrix multiplication for each new reference, never a DB query per slot.
    visuals = {}
    references = []

    def reference(r):
        nonlocal visuals
        if r['id'] in index:
            references.append(matrix[index[r['id']]])
            ref = np.mean(references,axis=0)
            norms = np.linalg.norm(matrix,axis=1)*np.linalg.norm(ref)
            sims = np.divide(matrix@ref,norms,out=np.zeros(len(matrix)),where=norms>0)
            visuals = {iid:float(sims[n]) for iid,n in index.items()}

    for iid in keep_ids:
        reference(by_id[iid])
    if keep_ids and not style:
        style = next(iter(sorted(by_id[keep_ids[0]]['_styles'])), '')
    if keep_ids and not palette:
        palette = sorted(by_id[keep_ids[0]]['_colors'])[:3]
    spent = 0
    selected_slots = {}
    missing_essential = False

    def score(r, s, target):
        text_match = bool(style and style.replace('-',' ') in r['_text'])
        style_match = bool(style and style in r['_styles'])
        anchor_styles = chosen[next(iter(chosen))]['_styles'] if chosen else set()
        shared = len(r['_styles'] & anchor_styles)/max(1,len(anchor_styles))
        col = len(r['_colors'] & set(palette))/max(1,len(r['_colors']))
        tier = 1/(1+abs(r['price']-target)/max(1,target)) if target else 0
        role_words = s.role.replace('_', ' ').rstrip(' 23456')
        role_match = role_words in r['_text']
        kind_preference = (len(s.kinds)-s.kinds.index(r['kind']))/len(s.kinds)
        paired = s.repeat and any(v['id']==r['id'] for v in chosen.values())
        return 4*style_match + text_match + 2*shared + 2*col + visuals.get(r['id'],0) + .6*tier + role_match + .3*kind_preference + paired + .35*_noise(seed,s.role,r['id'])

    for pos,s in enumerate(slots):
        if budget_amd is not None and missing_essential and s.tier>0 and not any(by_id[i]['kind'] in s.kinds for i in kept):
            continue
        if s.role.startswith('dining_chair'):
            table = chosen.get('dining_table')
            count = 2 if not table else _chair_count(table)
            n = int(s.role.rsplit('_',1)[1]) if s.role[-1].isdigit() else 1
            if n>count:
                continue
        used = {r['id'] for r in chosen.values()}
        available = [r for r in rows if (r['id'] not in used or s.repeat and r['id'] not in kept)]
        valid = [r for r in available if _compatible(r,s,chosen,room_size,room_type)]
        relaxed = False
        if not valid and s.role=='bed':
            valid = [r for r in available if _compatible(r,s,chosen,room_size,room_type,False)]
            relaxed = bool(valid)
        owned = [r for r in valid if r['id'] in kept]
        left = budget_amd-spent if budget_amd is not None else None
        affordable = [r for r in valid if r['id'] in kept or left is None or r['price']<=left]
        if not affordable:
            notes.append(f'{s.role}: omitted; no eligible item fits the size, support, floor-area and remaining budget constraints.')
            missing_essential |= s.tier==0
            continue
        target = left*s.share/sum(x.share for x in slots[pos:]) if left is not None else 0
        # Reserve minimum prices for remaining essential slots, so a costly anchor cannot consume everything.
        reserve = 0
        if left is not None:
            for future in slots[pos+1:]:
                if future.tier!=0:
                    continue
                pool = [r['price'] if r['id'] not in kept else 0 for r in rows if r['kind'] in future.kinds]
                reserve += min(pool, default=0)
        pool = owned or [r for r in affordable if left is None or r['price']<=left-reserve] or affordable
        within = [r for r in pool if r['price']<=target or r['id'] in kept] if left is not None else pool
        pool = within or pool
        pick = max(pool,key=lambda r:(score(r,s,target),r['id']))
        reasons = ['fits room/support and floor-area cap']
        if pick['id'] in kept:
            reasons.append('already owned; excluded from purchase total')
        if style in pick['_styles']:
            reasons.append(f'{style} style')
        if pick['_colors'] & set(palette):
            reasons.append('shared palette: '+', '.join(sorted(pick['_colors'] & set(palette))))
        if pick['id'] in visuals:
            reasons.append(f"SigLIP similarity {visuals[pick['id']]:.3f}")
        if left is not None:
            reasons.append(f'within remaining {left} AMD; slot target {round(target)} AMD')
        if relaxed:
            notes.append('bed: full 0.6 m side/foot clearance unavailable; verify access in the editor.')
        chosen[s.role] = {**pick,'role':s.role,'placement':s.placement,'why':'; '.join(reasons)}
        selected_slots[s.role] = s
        spent += 0 if pick['id'] in kept else pick['price']
        if len(chosen)==1:
            reference(pick)
            if not style:
                style = next(iter(sorted(pick['_styles'])), 'unspecified')
            base = sorted(pick['_colors'])[:3]
            # Anchor colours and at most one requested accent beyond them.
            palette = list(dict.fromkeys(base+[c for c in palette_input if c not in base][:1])) or palette_input[:1]
    unused = kept-{r['id'] for r in chosen.values()}
    if unused:
        # Never quietly drop an owned obstacle; no placement for it can be inferred safely.
        raise ValueError('keep_ids cannot be assigned a fitting room role at this richness: '+', '.join(sorted(unused)))
    alternatives = {}
    for role,current in chosen.items():
        alternatives[role] = []
        if current['id'] in kept:
            continue
        s = selected_slots[role]
        others = {k:v for k,v in chosen.items() if k!=role}
        candidates = []
        for r in rows:
            if r['id'] in {v['id'] for v in chosen.values()} or r['id'] in kept:
                continue
            if budget_amd is not None and spent-current['price']+r['price']>budget_amd:
                continue
            if not _compatible(r,s,others,room_size,room_type):
                continue
            replacement = {**r,'role':role,'placement':s.placement}
            trial = {**others,role:replacement}
            if any(not _compatible(v,selected_slots[k],{a:b for a,b in trial.items() if a!=k},room_size,room_type,False) for k,v in others.items()):
                continue
            candidates.append(r)
        alternatives[role] = [r['id'] for r in sorted(candidates,key=lambda r:(-score(r,s,current['price']),r['id']))[:2]]
    notes.append('Sizing is a rectangle heuristic; check doors, wall space, clearances and surface packing in the editor. Prices are catalog estimates.')
    if missing_essential:
        notes.append('Partial essential kit: a complete essential set was not feasible under these constraints.')
    keys = ('role','kind','id','name','size_m','price','currency','placement','why')
    return dict(kit=[{k:r[k] for k in keys} for r in chosen.values()], total_amd=spent,
                budget_left=None if budget_amd is None else budget_amd-spent,
                palette=palette, style=style or 'unspecified', alternatives=alternatives, notes=notes)
