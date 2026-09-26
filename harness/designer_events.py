"""Allowlisted customer observations; never forward raw model/tool payloads."""
import json
import math
import re

LABELS = {
    'set_intent':'Understanding your brief', 'scene_summary':'Reading your room',
    'search_catalog':'Finding suitable furniture', 'show_candidates':'Comparing furniture options',
    'reserve_slot':'Reserving a custom piece', 'build_piece':'Queuing a custom build',
    'place':'Trying furniture positions', 'check_layout':'Checking layout and clearances',
    'score_layout':'Comparing the layout', 'sun':'Checking daylight',
    'propose':'Checking your proposed change', 'ask':'Preparing a question', 'quote':'Furniture quote ready',
}

def text(value):
    return value if isinstance(value,str) and value.strip() and len(value)<=200 else None

def ids(values):
    return list(dict.fromkeys(v for v in values if text(v)))[:100]

def result_value(item):
    result=item.get('result') or {}
    if isinstance(result.get('structuredContent'),dict):return result['structuredContent']
    for content in result.get('content',[]) or []:
        if content.get('type')=='text':
            try:value=json.loads(content['text'])
            except (ValueError,KeyError):continue
            if isinstance(value,dict):return value
    return {}

class DesignerEvents:
    def __init__(self,emit,enabled=False):self.emit,self.enabled=emit,enabled
    def tool(self,name,phase,refs=None,call_id=None,summary=None):
        if not self.enabled:return
        record={'type':'tool','name':name,'phase':phase,'summary':summary or LABELS[name]}
        if refs:record['refs']=refs
        if text(call_id):record['callId']=call_id
        self.emit(record)
    def observe(self,event):
        if not self.enabled:return
        method=event.get('method');item=event.get('payload',{}).get('item',{})
        name=item.get('tool')
        if item.get('type')!='mcpToolCall' or item.get('server')!='varpet-designer' or name not in LABELS:return
        if method=='item/started':self.tool(name,'start',call_id=item.get('id'));return
        if method!='item/completed':return
        value=result_value(item); result=item.get('result') or {}
        failed=item.get('status')!='completed' or bool(item.get('error')) or result.get('isError') is True or value.get('ok') is False
        if failed:
            self.tool(name,'error',call_id=item.get('id'),summary=LABELS[name]+' did not complete');return
        refs={}
        for key,source in [('results','items'),('results','results'),('candidates','candidates')]:
            rows=value.get(source)
            if isinstance(rows,list):
                found=ids(r.get('sku') or r.get('id') for r in rows if isinstance(r,dict))
                if found:refs[key]=found
        if text(value.get('slotId')):refs['slotId']=value['slotId']
        size=value.get('size_wdh_m')
        if isinstance(size,list) and len(size)==3 and all(type(v) in (float,int) and math.isfinite(v) and v>0 for v in size):refs['size_wdh_m']=size
        if text(value.get('proposal_id')):refs['proposalId']=value['proposal_id']
        if type(value.get('ok')) is bool:refs['ok']=value['ok']
        self.tool(name,'end',refs,item.get('id'))
        if name=='search_catalog' and ('results' in refs or 'candidates' in refs):self.tool('show_candidates','end',refs,item.get('id'))
    def checked(self,saved):
        if not self.enabled:return
        refs={'proposalId':saved['id']} if text(saved.get('id')) else {}
        checks=saved.get('checks',{})
        if checks.get('ok') is True:
            checked={**refs,'ok':True}
            if any(op.get('type') in ('add','move','rotate') for op in saved.get('ops',[])):
                self.tool('place','end',checked,summary='Furniture positions checked')
            self.tool('check_layout','end',checked,summary='Layout checks passed')
        price=checks.get('price') or saved.get('score',{}).get('price') or {}
        cost=price.get('cost_dram')
        if type(cost) is int and 0<=cost<=9007199254740991 and price.get('currency')=='AMD':
            refs.update(cost_dram=cost,currency='AMD',price_source=price.get('price_source') if price.get('price_source') in ('mock','catalog') else 'unknown')
            if text(price.get('basis')):refs['basis']=price['basis']
            self.tool('quote','end',refs)
    def build(self,record):
        if not self.enabled:return
        sid=record.get('slotId');state=record.get('state')
        if not text(sid) or state not in ('queued','building','fixing','done','failed'):return
        value={'type':'build','slotId':sid,'state':state}
        if state=='done':
            glb=record.get('glb')
            if not isinstance(glb,str) or not re.fullmatch(r'/designer/files/[A-Za-z0-9-]+/'+re.escape(sid)+r'\.glb',glb):return
            value['glb']=glb
        if state=='failed':
            reason=record.get('reason')
            if not isinstance(reason,str) or not reason.strip():reason='The custom build failed; choose a catalog alternative.'
            # Raw compiler/SDK failures can contain local paths or private prompts.
            value['reason']='The custom build failed; choose a catalog alternative.' if any(v in reason for v in ('/','\\','data:', 'Traceback')) else reason[:300]
        self.emit(value)
