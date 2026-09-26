"""Look-before-purchase policy shared by the general agent and single-call selector."""
from __future__ import annotations
import base64
import json
import os
from pathlib import Path
import time

ROOT=Path(__file__).resolve().parents[1]


def enable_product_previews(config):
    server=config['mcp_servers']['varpet-designer']
    server['env']['VARPET_VISION_PRODUCTS']='1'
    if 'show_candidates' not in server['enabled_tools']:
        server['enabled_tools'].append('show_candidates')


def fetch_sheet(ids):
    import designer
    import tempfile
    with tempfile.TemporaryDirectory(prefix='varpet-product-grid-') as tmp:
        path=Path(tmp)/'ids.json';path.write_text(json.dumps(ids))
        result=designer.watch_process([str(ROOT/'packages/designer/node_modules/.bin/tsx'),
                                      str(ROOT/'packages/designer/src/catalog-vision-cli.ts'),str(path)],
                                     deadline=time.monotonic()+15,idle_timeout=15,env={**os.environ,**designer.designer_mcp_env()})
    if result.usage_limited:
        raise RuntimeError('usage limit while fetching product previews')
    if result.returncode or result.deadline_exceeded or result.timed_out:
        raise ValueError('Product preview unavailable within the preview budget')
    return json.loads(result.stdout)


def prepare_product_previews(prepared, directory, fetch=fetch_sheet):
    """One grid, at most 12 distinct SKUs; never let the selector choose an unseen SKU."""
    ids=[];candidates=[]
    for candidate in prepared['candidates']:
        union=list(dict.fromkeys(ids+candidate['catalog_ids']))
        if len(union)<=12:
            ids=union;candidates.append(candidate)
    if not candidates:
        raise ValueError('No complete candidate fits the product preview budget')
    if not ids:
        return {**prepared,'candidates':candidates},[],''
    sheet=fetch(ids)
    images=[part for part in sheet.get('content',[]) if part.get('type')=='image']
    if sheet.get('isError') or not images:
        raise ValueError('No usable product preview image')
    paths=[];directory.mkdir(parents=True,exist_ok=True)
    for index,part in enumerate(images):
        mime=part.get('mimeType')
        if mime not in ('image/png','image/jpeg'):
            raise ValueError('Unsupported product preview image')
        raw=base64.b64decode(part['data'],validate=True)
        if len(raw)>3_000_000 or not raw.startswith(b'\x89PNG\r\n\x1a\n' if mime=='image/png' else b'\xff\xd8'):
            raise ValueError('Invalid product preview image')
        path=directory/f'products-{index}.{"png" if mime=="image/png" else "jpg"}'
        path.write_bytes(raw);paths.append(str(path))
    legend='\n'.join(part['text'] for part in sheet['content'] if part.get('type')=='text')
    return {**prepared,'candidates':candidates},paths,legend
