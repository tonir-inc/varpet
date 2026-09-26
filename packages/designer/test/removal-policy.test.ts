import {test,expect} from 'vitest';
import {requestPolicy} from '../src/request-policy.js';
import {checkRequest} from '../src/request.js';
import {DesignerSession} from '../src/session.js';
import {designRoom} from '../src/taste/design.js';
import type {Scene,Item,Op} from '../src/scene.js';
const sofa:Item={id:'old',sku:'old',name:'Couch',kind:'sofa',size:[2,.8,.8],pos:[4,4],rot:0,room_id:'living',keep:false,price:100};
const scene:Scene={rooms:[{id:'living',name:'Living',polygon:[[0,0],[8,0],[8,8],[0,8]]}],walls:[],openings:[],items:[sofa],fixed:[]};
const words=['put any kind of couch in the middle of the living room','remove the couch, and remake the living room in minimalistic style but make sure it is also cozy'];
test('customer removal persists across turns and only explicit customer addition releases the kind',()=>{
 expect(requestPolicy([...words,'make the room warmer']).blocked_kinds).toContain('sofa');
 expect(requestPolicy([...words,'put a sofa back in the room']).blocked_kinds).not.toContain('sofa');
 expect(requestPolicy(['remove the couch and add a new sofa']).blocked_kinds).not.toContain('sofa');
 expect(requestPolicy(["do not remove the couch"]).blocked_kinds).not.toContain('sofa');
 expect(requestPolicy(["don't add any sofas"]).blocked_kinds).toContain('sofa');
 expect(requestPolicy(['remove the rug and lamp']).blocked_kinds.sort()).toEqual(['lamp','rug']);
});
test('request gate rejects re-adding a removed kind despite model intent and changed identity',()=>{
 const added={...sofa,id:'new',sku:'new'},ops:Op[]=[{type:'remove',id:'old'},{type:'add',item:added}];
 const intent={room_id:'living',remove:[{kinds:['sofa'],count:1}],add:[{kinds:['sofa'],count:1}]};
 const after={...scene,items:[added]};
 expect(checkRequest(scene,after,ops,intent,100,words).errors.map(e=>e.check)).toContain('removed_kind');
 const session=new DesignerSession(scene,words);session.setIntent(intent);session.setIntent(intent);
 const result=session.propose(ops,'A replacement couch.');expect(result.ok).toBe(false);
 expect(checkRequest(scene,after,ops,intent,100,[...words,'Actually add a sofa again']).ok).toBe(true);
});
test('removing the anchor builds two facing chairs with the rest of the complete program',async()=>{
 const dimensions:Record<string,number[]>={sofa:[2,.85,.8],chair:[.8,.8,.8],rug:[3,3,.02],lamp:[.3,.3,1.4],table:[.5,.5,.4],shelf:[1,.3,1.2]};
 const result=await designRoom(scene,{room_id:'living',style_request:words[1]!,remake:true},async p=>({results:[{id:p.kind,kind:p.kind,name:p.kind,size_m:dimensions[p.kind!],price:100,currency:'AMD',styles:['Scandinavian'],colors_image:['beige']}]}));
 expect(result.candidates).toHaveLength(2);
 for(const candidate of result.candidates){const adds=candidate.ops.flatMap(o=>o.type==='add'?[o.item]:[]);expect(adds.some(i=>i.kind==='sofa')).toBe(false);expect(adds.filter(i=>i.kind==='chair')).toHaveLength(2);expect(adds.map(i=>i.kind)).toEqual(expect.arrayContaining(['rug','lamp','table','shelf']));expect(candidate.composition.pass).toBe(true);}
});

test('MCP uses customer history even when the model omits removal in its style query',async()=>{
 const {createServer}=await import('../src/server.js');const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');
 const dimensions:Record<string,number[]>={sofa:[2,.85,.8],chair:[.8,.8,.8],rug:[3,3,.02],lamp:[.3,.3,1.4],table:[.5,.5,.4],shelf:[1,.3,1.2]};
 const server=createServer(scene,{customerRequests:words,catalogQuery:async p=>({results:[{id:p.kind,kind:p.kind,name:p.kind,size_m:dimensions[p.kind!],price:100,currency:'AMD',styles:['Scandinavian'],colors_image:['beige']}]})});
 const client=new Client({name:'removal',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
 try{const result:any=await client.callTool({name:'search_catalog',arguments:{room_id:'living',style_request:'cozy minimalist',remake:true}});const plan=JSON.parse(result.content[0].text);expect(plan.candidates).toHaveLength(2);expect(plan.candidates.flatMap((c:any)=>c.items).some((i:any)=>i.kind==='sofa')).toBe(false);}finally{await client.close();await server.close();}
});

test('editor boundary rechecks customer history independently of saved model intent',async()=>{
 const {editorToDesigner,proposalToEditor}=await import('../src/editor-bridge.js');
 const catalog:any[]=[{id:'sofa',name:'Sofa',category:'Seats',kind:'sofa',dimensions:[2,.8,.8],color:'#cccccc',price:100,source:{type:'procedural'}}];
 const editor:any={format:'varpet.editor',version:1,id:'flat',name:'Flat',units:'m',upAxis:'Y',rooms:[{id:'living',name:'Living',polygon:[[0,0],[8,0],[8,8],[0,8]],color:'#ffffff'}],walls:[],objects:[]};
 const session=new DesignerSession(editorToDesigner(editor,{catalog,catalogCurrency:'AMD'}));
 session.setIntent({room_id:'living',add:[{kinds:['sofa'],count:1}]});
 const result=session.propose([{type:'add',item:{...sofa,id:'new',sku:'sofa',name:'Sofa',pos:[4,-4]}}],'Add sofa');
 expect(result.ok).toBe(true);if(!result.ok)throw Error('fixture proposal failed');
 expect(()=>proposalToEditor(result.proposal,editor,0,{catalog,catalogCurrency:'AMD',customerRequests:words})).toThrow(/removed_kind|customer removed/);
});

test('only direct requested kinds can release an exclusion; references and negation cannot',()=>{
 const removed=['remove the couch'];
 for(const request of ['put a table where the couch used to be','I do not want to add a sofa','do not bring back the sofa','add a lamp beside the couch'])expect(requestPolicy([...removed,request]).blocked_kinds).toContain('sofa');
 expect(requestPolicy(['remove the rug in front of the couch']).blocked_kinds).toEqual(['rug']);
 expect(requestPolicy([...removed,'replace the chair with a sofa']).blocked_kinds).not.toContain('sofa');
});

test('negated nested addition and upholstery modifiers never undo removal',()=>{
 for(const text of ['no need to add a sofa','make the room cozy with sofa-like cushions','add a sofa cover'])expect(requestPolicy(['remove couch',text]).blocked_kinds).toContain('sofa');
 expect(requestPolicy(['remove couch',"don't remove the rug and add a sofa"]).blocked_kinds).not.toContain('sofa');
});

test('coordinated modifiers and shared negative alternatives keep removed kinds blocked',()=>{
 for(const text of ['add a lamp and sofa cushions',"don't buy or add a sofa"])expect(requestPolicy(['remove couch',text]).blocked_kinds).toContain('sofa');
});
