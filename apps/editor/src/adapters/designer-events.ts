/** Customer-facing, opt-in observations. Never scene operations or raw SDK payloads. */
export interface DesignerEventRefs {
  results?:string[];candidates?:string[];itemIds?:string[];slotId?:string;
  size_wdh_m?:[number,number,number];proposalId?:string;ok?:boolean;
  cost_dram?:number;currency?:'AMD';basis?:string;price_source?:'mock'|'catalog'|'unknown';
}
export type DesignerEvent =
  | {type:'tool';name:string;phase:'start'|'end'|'error';callId?:string;summary:string;refs?:DesignerEventRefs}
  | {type:'build';slotId:string;state:'queued'|'building'|'fixing'|'done'|'failed';glb?:string;reason?:string};
const names=['set_intent','scene_summary','search_catalog','show_candidates','reserve_slot','build_piece','place','check_layout','score_layout','sun','propose','ask','quote'];
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Event must be an object.');return v as Record<string,unknown>;};
const keys=(v:Record<string,unknown>,allowed:string[])=>{if(Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Event contains unsupported fields.');};
const text=(v:unknown,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Invalid event text.');return v;};
export function parseDesignerEvent(value:unknown):DesignerEvent {
  const e=object(value);
  if(e.type==='tool'){
    keys(e,['type','name','phase','callId','summary','refs']);
    if(!names.includes(String(e.name))||!['start','end','error'].includes(String(e.phase)))throw Error('Invalid tool event.');
    text(e.summary,300);if(e.callId!==undefined)text(e.callId);
    if(e.refs!==undefined){const r=object(e.refs);keys(r,['results','candidates','itemIds','slotId','size_wdh_m','proposalId','ok','cost_dram','currency','basis','price_source']);
      for(const k of ['results','candidates','itemIds'])if(r[k]!==undefined){if(!Array.isArray(r[k])||r[k].length>100)throw Error('Invalid event references.');r[k].forEach(v=>text(v));}
      for(const k of ['slotId','proposalId','basis'])if(r[k]!==undefined)text(r[k]);
      if(r.ok!==undefined&&typeof r.ok!=='boolean')throw Error('Invalid check result.');
      if(r.size_wdh_m!==undefined&&(!Array.isArray(r.size_wdh_m)||r.size_wdh_m.length!==3||!r.size_wdh_m.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0)))throw Error('Invalid slot size.');
      if(r.cost_dram!==undefined&&(!Number.isSafeInteger(r.cost_dram)||(r.cost_dram as number)<0))throw Error('Invalid quote amount.');
      if(r.currency!==undefined&&r.currency!=='AMD')throw Error('Invalid quote currency.');
      if(r.price_source!==undefined&&!['mock','catalog','unknown'].includes(String(r.price_source)))throw Error('Invalid price provenance.');
    }
  }else if(e.type==='build'){
    keys(e,['type','slotId','state','glb','reason']);const id=text(e.slotId);
    if(!/^custom-[A-Za-z0-9-]+-\d+$/.test(id)||!['queued','building','fixing','done','failed'].includes(String(e.state)))throw Error('Invalid build event.');
    if(e.state==='done'||e.glb!==undefined){const path=text(e.glb,600);if(!/^\/designer\/files\/[A-Za-z0-9-]+\/custom-[A-Za-z0-9-]+-\d+\.glb$/.test(path)||!path.endsWith('/'+id+'.glb')||e.state!=='done')throw Error('Invalid build file.');}
    if(e.state==='failed'||e.reason!==undefined)text(e.reason,300);
  }else throw Error('Unknown designer event.');
  return structuredClone(e) as DesignerEvent;
}
export function designerEventProgress(event:DesignerEvent):string {
  if(event.type==='build'){
    const labels={queued:'Queued',building:'Building',fixing:'Refining',done:'Finished',failed:'Could not build'};
    return `${labels[event.state]} ${event.slotId}${event.state==='failed'?`: ${event.reason}`:''}`;
  }
  if(event.name==='quote'&&event.refs?.currency==='AMD'&&event.refs.cost_dram!==undefined)
    return `${event.summary} · ${event.refs.cost_dram.toLocaleString('en-US')} ֏${event.refs.price_source==='catalog'?'':event.refs.price_source==='mock'?' · sample prices':' · unverified prices'}`;
  return event.summary;
}
