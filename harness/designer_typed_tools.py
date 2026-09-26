"""Typed customer runtime. Legacy profiles remain available to frozen benchmarks."""
from pathlib import Path
import json
import hashlib
import subprocess
import re

TOOLS = ['plan_room','search_catalog','place','move','remove','paint','propose','show_candidates','inspect_layout','ask']

def configure(config):
    server=config['mcp_servers']['varpet-designer']
    server['env']['VARPET_DESIGNER_TYPED_TOOLS']='1'
    server['enabled_tools']=list(TOOLS)

def instructions():
    return (Path(__file__).parent/'prompts/designer-typed-tools.md').read_text()

def direct_catalog(runtime,model):
    """Model metadata takes precedence over feature flags. Override only this private runtime copy."""
    if runtime.get('model_catalog'):
        catalog=json.loads(Path(runtime['model_catalog']).read_text())
    else:
        catalog=json.loads(subprocess.check_output(['codex','debug','models'],text=True,timeout=20))
    models=catalog.get('models',[]) if isinstance(catalog,dict) else catalog
    selected=next((m for m in models if m.get('slug')==model),None)
    if selected is None:
        raise ValueError('Designer model metadata unavailable; cannot guarantee direct typed tools')
    previous=selected.get('tool_mode')
    selected['tool_mode']='direct'
    # The small fixed tool set needs no deferred tool discovery.
    selected['supports_search_tool']=False
    destination=Path(runtime['home'])/'designer-direct-models.json'
    destination.write_text(json.dumps({'models':models}));destination.chmod(0o600)
    return str(destination),{'tool_mode':'direct','original_tool_mode':previous,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}

def saved_receipt(event,directory):
    """Only a successful direct MCP receipt backed by a durable checked file is terminal."""
    if not directory or event.get('method')!='item/completed':
        return None
    item=event.get('payload',{}).get('item',{})
    if item.get('type')!='mcpToolCall' or item.get('server')!='varpet-designer' or item.get('tool')!='propose' or item.get('status')!='completed' or item.get('error'):
        return None
    result=item.get('result') or {}
    if result.get('isError'):
        return None
    for part in result.get('content',[]):
        if part.get('type')!='text':
            continue
        try:
            receipt=json.loads(part['text'])
            identifier=receipt.get('proposal_id','')
            if receipt.get('ok') is not True or not re.fullmatch(r'proposal-\d+',identifier):
                continue
            proposal=json.loads((Path(directory)/(identifier+'.json')).read_text())
            if proposal.get('id')!=identifier or not proposal.get('ops') or proposal.get('checks',{}).get('ok') is not True or proposal.get('request_check',{}).get('ok') is not True:
                continue
            if proposal.get('requires_user_acceptance') is not True or proposal.get('application_status')!='not_applied' or proposal.get('assets'):
                continue
            return {'message':str(receipt.get('message') or proposal['rationale'])[:1800], 'proposal':proposal}
        except (ValueError,OSError,TypeError,KeyError):
            continue
    return None
