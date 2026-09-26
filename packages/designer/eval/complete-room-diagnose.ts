/** Local deterministic replay of recorded rooms; never edits the measured inputs. */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {planIncrementally} from '../src/incremental-room.js';
import {createHttpCatalogQuery,type CatalogQuery} from '../src/catalog.js';
const root=process.env.COMPLETE_OUTPUT??'/tmp/complete-room-diagnosis';
const recordings=process.env.COMPLETE_RECORDINGS;if(!recordings)throw new Error('Set COMPLETE_RECORDINGS to the preserved typed-tools runs directory');mkdirSync(root,{recursive:true});
const live=createHttpCatalogQuery({url:'http://localhost:8765/mcp'});
const query:CatalogQuery=async input=>{const key=createHash('sha256').update(JSON.stringify(input)).digest('hex'),file=root+'/query-'+key+'.json';if(existsSync(file))return JSON.parse(readFileSync(file,'utf8')).response;const response=await live(input);writeFileSync(file,JSON.stringify({input,response}));return response;};
for(const flat of ['avani','balcony','b21-t13'])for(const kind of ['living','bedroom','kids']){
 if(process.argv[2]&&!`${flat}-${kind}`.includes(process.argv[2]))continue;
 const folder=`${recordings}/after-portal-${flat}-1`;
 const events=readFileSync(`${folder}/${kind}-sdk.events.jsonl`,'utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s));
 const scene=events.find(e=>e.kind==='designer_scene').scene,run=JSON.parse(readFileSync(folder+'/run.json','utf8'));
 const request={room_id:run.roles[kind],program:kind,...kind==='kids'?{budget:300000}:{}};
 const start=performance.now(),plan=await planIncrementally(scene,request,query);
 writeFileSync(`${root}/${process.env.COMPLETE_PHASE??'before'}-${flat}-${kind}.json`,JSON.stringify({scene,request,plan},null,2));
 console.log(JSON.stringify({flat,kind,seconds:(performance.now()-start)/1000,complete:plan.complete,pieces:plan.products.map(p=>({id:p.sku,kind:p.kind,size:p.size,price:p.price})),missing:plan.missing}));
}
