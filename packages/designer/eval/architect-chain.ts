/** Real services; EditorStore is the sole handoff. --replay checks saved browser evidence. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { demoScene, localCatalog } from '../../../apps/editor/src/core/demo.js';
import { EditorStore } from '../../../apps/editor/src/core/store.js';
import { validateScene } from '../../../apps/editor/src/core/validation.js';
import { createCatalogHttpAdapter, mergeCatalogs } from '../../../apps/editor/src/adapters/catalog-http.js';
import type { CatalogAsset } from '../../../apps/editor/src/contracts.js';

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const requests = ['furnish the bedroom', 'make the living room a place to read'];
const argument = (name: string, fallback: string) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1]! : fallback;
const output = resolve(argument('--output', `packages/designer/eval/chain-runs/${new Date().toISOString().replace(/[:.]/g,'-')}`));
const save = (name: string, data: unknown) => writeFileSync(resolve(output,name),JSON.stringify(data,null,2)+'\n');
const seconds = (start: number) => (performance.now()-start)/1000;

function shellStore(structure: any, catalog: CatalogAsset[]) {
  // This deliberately starts a new flat without demo furniture. replace-structure retains objects.
  const store = new EditorStore({...structuredClone(demoScene),objects:[]},catalog);
  const applied = store.execute({id:'chain-structure',label:'Apply architect shell',source:'architect',baseRevision:0,
    operations:[{type:'replace-structure',rooms:structure.rooms,walls:structure.walls}]},true);
  if (!applied.ok) throw new Error(JSON.stringify(applied));
  return store;
}

function accept(store: EditorStore, catalog: CatalogAsset[], reply: any, request: string) {
  if (reply.type !== 'proposal') throw new Error(`${request}: expected proposal; ${reply.type}: ${reply.message??reply.question}`);
  const result = store.execute(reply.proposal.command,true);
  if (!result.ok) throw new Error(JSON.stringify(result));
  const validation = validateScene(store.scene,catalog);
  if (!validation.ok) throw new Error(JSON.stringify(validation));
  const added = reply.proposal.command.operations.filter((op: any)=>op.type==='add').map((op: any)=>catalog.find(a=>a.id===op.object.assetId));
  if (!added.length || added.some((asset: CatalogAsset)=>!asset?.id.startsWith('abo:'))) throw new Error('Expected real ABO catalog additions');
  const requiredKind = request === requests[0] ? 'bed' : 'chair';
  if (!added.some((asset: CatalogAsset)=>asset.kind===requiredKind)) throw new Error(`Missing functional ${requiredKind}`);
  return {result,validation,added:added.map((asset: CatalogAsset)=>({id:asset.id,kind:asset.kind,name:asset.name,price:asset.price}))};
}

async function post(url: string, body: unknown) {
  const started = performance.now();
  const response = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(600_000)});
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}: ${url}`);
  const reader=response.body.pipeThrough(new TextDecoderStream()).getReader();let buffer='';const lines:any[]=[];
  for (;;) {
    const {value,done}=await reader.read(); buffer+=value??'';
    let end:number;
    while ((end=buffer.indexOf('\n'))>=0) {
      const raw=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
      if(!raw)continue;const line=JSON.parse(raw);lines.push(line);
      if(line.type==='progress')console.log(line.message);
    }
    if(done)break;
  }
  if(buffer.trim())lines.push(JSON.parse(buffer));
  const finals=lines.filter(line=>line.type!=='progress');
  if(finals.length!==1)throw new Error(`Expected one final, received ${finals.length}`);
  return {seconds:seconds(started),lines,final:finals[0]};
}

async function main() {
  if(process.argv.includes('--replay')) {
    const directory=resolve(argument('--replay',''));
    const catalog=read(resolve(directory,'editor-shell.json')).catalog;
    const structure=read(resolve(directory,'architect-browser.json')).result.structure;
    const store=shellStore(structure,catalog), rows=read(resolve(directory,'final-browser.json')).runs;
    if(rows.length!==requests.length)throw new Error('Expected both customer requests');
    for(const [index,row] of rows.entries()) {
      if(row.request!==requests[index])throw new Error('Unexpected request order');
      const checked=accept(store,catalog,row.lines.at(-1),row.request);
      console.log(`${row.request}: PASS; revision ${store.revision}; ${checked.added.length} real catalog additions`);
    }
    console.log('CHAIN PASS: architect shell → EditorStore → two Designer proposals → EditorStore');
    return;
  }
  mkdirSync(output,{recursive:true});
  const plan=resolve(argument('--plan','packages/designer/eval/chain-runs/20260926/avani-plan.png'));
  const architect=await post(`${argument('--architect','http://127.0.0.1:8791')}/structure`,{plan:{name:'avani-plan.png',data:readFileSync(plan).toString('base64')},photos:[]});
  save('architect.json',architect);
  if(architect.final.type!=='structure')throw new Error(JSON.stringify(architect.final));
  const catalog=mergeCatalogs(localCatalog,await createCatalogHttpAdapter({url:argument('--catalog','http://localhost:8765/editor/assets')}).list());
  const store=shellStore(architect.final,catalog);save('editor-shell.json',{scene:store.scene,catalog});
  for(const [index,request] of requests.entries()) {
    const response=await post(`${argument('--designer','http://127.0.0.1:8792')}/designer/propose`,{scene:store.scene,revision:store.revision,catalog,catalogCurrency:'AMD',request});
    save(`request-${index}.json`,response);
    const checked=accept(store,catalog,response.final,request);
    save(`accepted-${index}.json`,{...checked,scene:store.scene});
    console.log(`${request}: PASS in ${response.seconds.toFixed(3)}s; revision ${store.revision}`);
  }
  console.log(`CHAIN PASS; evidence ${output}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
