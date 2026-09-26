import type {CatalogAsset,SceneDocument} from '../../../apps/editor/src/contracts.js';
import {EditorStore} from '../../../apps/editor/src/core/store.js';
import {type EditorBridgeOptions,bridgeCatalog,proposalToEditor} from './editor-bridge.js';
import {DesignerSession} from './session.js';
import type {Scene,Op} from './scene.js';
/** Exact product boundary: a reconciled designer polygon cannot authorize unsupported editor floor. */
export function editorFitRows(editor:SceneDocument,base:Scene,catalog:CatalogAsset[],rows:any[],removeIds:string[]=[],bridgeOptions:EditorBridgeOptions={}):any[]{
 const removals:Op[]=removeIds.map(id=>({type:'remove',id}));
 return rows.flatMap(row=>{
  const slots=row.fit_slots.filter((slot:any)=>{
   try{
    const ops:Op[]=[...removals,...slot.ops],session=new DesignerSession(base);
    const counts=(kinds:string[])=>[...new Set(kinds)].map(kind=>({kinds:[kind],count:kinds.filter(k=>k===kind).length}));
    session.setIntent({room_id:slot.room_id,add:counts(ops.flatMap(op=>op.type==='add'?[op.item.kind]:[])),remove:counts(removeIds.map(id=>base.items.find(i=>i.id===id)!.kind))});
    const p=session.propose(ops,'Catalog fit preview');if(!p.ok)return false;
    const proposal=proposalToEditor(p.proposal,editor,0,{catalogCurrency:'AMD',northDeg:base.north_deg,groupPolicy:'move-together',...bridgeOptions,catalog});
    return new EditorStore(editor,bridgeCatalog(editor,catalog).catalog).execute(proposal.command,true).ok;
   }catch{return false;}
  });
  return slots.length?[{...row,fit_slots:slots}]:[];
 });
}
