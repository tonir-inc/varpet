"""Request-scoped vision experiments. No visual work on the default fast path."""
from __future__ import annotations
import base64
import binascii
from pathlib import Path
import re

MAX_IMAGE_BYTES = 2 * 1024 * 1024
SELF_CHECK_SECONDS = 20.0
STYLE_REQUEST = re.compile(r'co[sz](?:y|ier)|style|look|aesthetic|minimal|scandi|warm|palette|colour|color|match|harmon|taste', re.I)


def validate_vision(value, scene, revision, request):
    if not isinstance(value, dict) or set(value) - {'view', 'plan', 'products', 'selfCheck'}:
        raise ValueError('vision must contain only view, plan, products and selfCheck')
    for key in ('products', 'selfCheck'):
        if key in value and type(value[key]) is not bool:
            raise ValueError(f'vision.{key} must be boolean')
    if value.get('selfCheck') and not STYLE_REQUEST.search(request):
        raise ValueError('Visual self-check is limited to style and appearance requests')
    for key in ('view', 'plan'):
        if key not in value:
            continue
        image=value[key]
        if not isinstance(image, dict) or set(image)-{'dataUrl','sceneId','revision','selectedIds'}:
            raise ValueError(f'Invalid vision.{key} image')
        if key=='view' and (image.get('sceneId')!=scene.get('id') or type(image.get('revision')) is not int or image['revision']!=revision):
            raise ValueError('Vision snapshot must match the current scene ID and revision')
        if 'selectedIds' in image and (not isinstance(image['selectedIds'],list) or len(image['selectedIds'])>100 or any(not isinstance(i,str) or len(i)>100 for i in image['selectedIds'])):
            raise ValueError('Invalid selectedIds')
        decode_image(image.get('dataUrl'))
    return value


def decode_image(value):
    if not isinstance(value,str) or len(value)>MAX_IMAGE_BYTES*4//3+100:
        raise ValueError('Vision image must be a PNG/JPEG data URL no larger than 2 MiB')
    match=re.fullmatch(r'data:image/(png|jpeg);base64,([A-Za-z0-9+/=\r\n]+)',value)
    if not match:
        raise ValueError('Vision images require inline PNG/JPEG data, never remote URLs or paths')
    try: raw=base64.b64decode(match[2],validate=True)
    except (binascii.Error,ValueError) as error: raise ValueError('Invalid image base64') from error
    expected=b'\x89PNG\r\n\x1a\n' if match[1]=='png' else b'\xff\xd8\xff'
    if not raw.startswith(expected) or len(raw)>MAX_IMAGE_BYTES:
        raise ValueError('Image content does not match PNG/JPEG MIME type or size limit')
    return raw,match[1]


def materialize_images(options, directory:Path):
    paths=[]
    for key in ('view','plan'):
        if key in options:
            raw,extension=decode_image(options[key]['dataUrl'])
            path=directory/f'{key}.{extension}';path.write_bytes(raw);paths.append(str(path))
    return paths


def product_prompt(key):
    import json
    return json.loads((Path(__file__).parent/'prompts/designer-vision.json').read_text())[key]


def guidance(options):
    notes=[]
    if 'view' in options:notes.append(product_prompt('view')+str(options['view'].get('selectedIds',[])))
    if 'plan' in options:notes.append(product_prompt('plan'))
    for key in ('products','selfCheck'):
        if options.get(key):notes.append(product_prompt(key))
    if notes:notes.append(product_prompt('trust'))
    return '\n'.join(notes)


def confirm_proposal(service, body, proposal, directory, cancel, progress):
    """One render plus one read-only judgement, together capped at 20 seconds; never retries."""
    import json, os, sys, time
    import designer
    start=time.monotonic();deadline=start+SELF_CHECK_SECONDS
    evidence={'budget_seconds':SELF_CHECK_SECONDS,'status':'unavailable','tokens':None,'render_seconds':0,'model_seconds':0}
    def record():
        evidence['seconds']=time.monotonic()-start
        observer=getattr(service,'vision_observer',None)
        if observer: observer(evidence.copy(),directory)
    try:
        progress('Checking the rendered style against your request')
        source=directory/'visual-input.json';source.write_text(json.dumps({'scene':body['scene'],'catalog':body.get('catalog',[]),'proposal':proposal}))
        render_dir=directory/'visual-render'
        command=getattr(service,'vision_renderer_command',None) or [sys.executable,str(Path(__file__).with_name('designer_vision_render.py'))]
        result=designer.watch_process(command+['--input',str(source),'--output',str(render_dir)],deadline=deadline,cancel_event=cancel,idle_timeout=SELF_CHECK_SECONDS)
        evidence['render_seconds']=result.seconds
        if result.usage_limited:raise RuntimeError('usage limit during visual render')
        if result.cancelled:raise RuntimeError('Request cancelled')
        if result.returncode or result.deadline_exceeded:raise RuntimeError('Visual rendering failed or exceeded its time budget: '+result.stderr[-300:])
        runtime=designer.prepare_runtime(directory/'visual-runtime',{'proposal':proposal['description'],'request':body['request'],'geometry_checks':'Already passed; judge only the visible style and request match.'})
        job=directory/'visual-job.json'
        job.write_text(json.dumps({'runtime':runtime,'request':body['request'],'effort':'low','profile':{'placement':'without-place','context':'compact-base'},'turn_images':[str(render_dir/'top.png'),str(render_dir/'perspective.png')],'review_only':True}))
        result=designer.watch_process(service.worker_command+[str(job)],deadline=deadline,cancel_event=cancel,idle_timeout=SELF_CHECK_SECONDS)
        evidence['model_seconds']=result.seconds
        events=[]
        for line in result.stdout.splitlines():
            try: events.append(json.loads(line))
            except ValueError: pass
        summaries=[e for e in events if e.get('kind')=='worker_summary']
        usage=next((e.get('total_usage') or e.get('payload',{}).get('tokenUsage',{}).get('total') for e in reversed(events) if e.get('total_usage') or e.get('method')=='thread/tokenUsage/updated'),None)
        evidence['usage']=usage
        evidence['tokens']=usage.get('totalTokens') if usage else None
        if result.usage_limited:raise RuntimeError('usage limit during visual confirmation')
        if result.cancelled:raise RuntimeError('Request cancelled')
        if result.returncode or result.deadline_exceeded or not summaries or summaries[-1].get('status')!='completed':raise RuntimeError('Visual confirmation did not finish within the time budget')
        text=summaries[-1].get('response','').strip()
        if text.startswith('```'):text=re.sub(r'^```(?:json)?\s*|\s*```$','',text)
        review=json.loads(text)
        if type(review.get('accept')) is not bool or not isinstance(review.get('reason'),str):raise ValueError('Invalid visual confirmation')
        observations=review.get('observations',[])
        if not isinstance(observations,list) or any(not isinstance(item,str) for item in observations):raise ValueError('Invalid visual observations')
        evidence.update({key:review[key] for key in ('accept','reason','observations') if key in review})
        evidence['status']='confirmed' if review['accept'] else 'rejected';record()
        return review['accept'],evidence
    except Exception as error:
        evidence['reason']=str(error);evidence['status']='cancelled' if cancel.is_set() else 'timeout' if time.monotonic()>=deadline else 'unavailable';record()
        if cancel.is_set() or 'usage limit' in str(error).lower():raise
        return False,evidence
