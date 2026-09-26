import {readFileSync,writeFileSync,readdirSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {editorToDesigner} from '../src/editor-bridge.js';
import {scoreComposition} from '../src/taste/composition.js';
import {tasteCases} from './taste-cases.js';
import {resolveStyles} from '../knowledge/styles/index.js';
const root=resolve(process.argv[2]??'packages/designer/eval/taste-runs');
const metadataPath=`${root}/catalog-evidence.json`,metadata:any=existsSync(metadataPath)?JSON.parse(readFileSync(metadataPath,'utf8')):{};
for(const file of existsSync(`${root}/catalog-sweep`)?readdirSync(`${root}/catalog-sweep`):[]){
 const snapshot=JSON.parse(readFileSync(`${root}/catalog-sweep/${file}`,'utf8'));
 for(const products of Object.values(snapshot.catalog?.products??{}) as any[][])for(const p of products)metadata[p.sku]={...metadata[p.sku],...p,style_evidence:'search_furniture.style_astra (inferred)'};
}
writeFileSync(metadataPath,JSON.stringify(metadata,null,2));
const arms=['before',process.argv[3]??'after-retry'];
for(const arm of arms)for(const [id] of tasteCases){if(!existsSync(`${root}/${arm}/${id}.json`))throw new Error(`Missing fixed case ${arm}/${id}; refuse a partial denominator`);}
const cases=arms.flatMap(arm=>tasteCases.map(([id])=>({arm,path:`${root}/${arm}/${id}.json`,data:JSON.parse(readFileSync(`${root}/${arm}/${id}.json`,'utf8'))})));
const ids=[...new Set(cases.flatMap(r=>r.data.scene?.objects.map((o:any)=>o.assetId)??[]))].filter(id=>String(id).startsWith('abo:')&&!metadata[id]);
const client=new Client({name:'taste-eval',version:'1'}),transport=new StreamableHTTPClientTransport(new URL('http://localhost:8765/mcp'));
const payload=(r:any)=>r.structuredContent??JSON.parse(r.content.find((c:any)=>c.type==='text').text);
const missingStyles=Object.entries(metadata).filter(([,m]:[string,any])=>m.styles_inferred===undefined&&m.style_astra===undefined);
if(ids.length||missingStyles.length){await client.connect(transport);for(let i=0;i<ids.length;i+=4){await Promise.all(ids.slice(i,i+4).map(async id=>{metadata[id]=payload(await client.callTool({name:'get_item',arguments:{item_id:id}}));}));writeFileSync(metadataPath,JSON.stringify(metadata,null,2));}for(const [id,m] of missingStyles as [string,any][]){
 const found=payload(await client.callTool({name:'search_furniture',arguments:{kind:m.kind,text:m.name,limit:20}}));
 const exact=found.results?.find((r:any)=>r.id===id);if(exact)metadata[id]={...m,styles_inferred:exact.style_astra??[],style_evidence:'search_furniture.style_astra (inferred)'};
 writeFileSync(metadataPath,JSON.stringify(metadata,null,2));
 }await client.close();}
const evidence=Object.fromEntries(Object.entries(metadata).map(([id,m]:[string,any])=>[id,{styles:m.styles??[],styles_inferred:m.styles_inferred??m.style_astra??m.tags?.astra?.style??[],colors_image:m.colors_image??m.colors_img?.map((c:any)=>c.name)??[]}]));
const rows=[];
for(const c of cases){
 const r=c.data;if(!r.scene)continue;
 const scene=editorToDesigner(r.scene,{catalog:r.catalog,catalogCurrency:'AMD',northDeg:0});
 const styles=resolveStyles(r.requests.at(-1));
 const composition=scoreComposition(scene,'room-living',{program:'living',styles,catalog:evidence});
 const living=scene.items.filter(i=>i.room_id==='room-living');
 // Independent acceptance rubric does not call the candidate generator: complete real items,
 // successful editor application and minimum useful seating capacity.
 const independent={editor_accepted:r.turns.at(-1)?.accepted?.ok===true,sofa:living.some(i=>i.kind==='sofa'&&i.size[0]>=1.4),rug:living.some(i=>i.kind==='rug'&&i.size[0]*i.size[1]>=3),lighting:living.filter(i=>i.kind==='lamp').length>=2,table:living.some(i=>i.kind==='table'&&i.size[2]<=.75),focal:living.some(i=>['shelf','cabinet'].includes(i.kind))};
 const first=r.turns[0];
 const firstSofas=(first.reply?.proposal?.command?.operations??[]).filter((op:any)=>op.type==='add'&&r.catalog.some((a:any)=>a.id===op.object.assetId&&a.kind==='sofa')).map((op:any)=>op.object);
 const twoTurn=r.id!=='ashot'||(r.turns.length===2&&r.turns.every((t:any)=>t.accepted?.ok===true)&&firstSofas.some((o:any)=>Math.hypot(o.position[0]+2.2,o.position[2])<=1)&&firstSofas.every((o:any)=>!r.scene.objects.some((x:any)=>x.id===o.id)));
 const capturePath=`${root}/${c.arm}/${r.id}-capture.json`;
 const capture=existsSync(capturePath)?JSON.parse(readFileSync(capturePath,'utf8')):null;
 const captureComplete=capture?.complete===true&&existsSync(`${root}/${c.arm}/${r.id}-furnished-3d.png`)&&capture.expected.every((id:string)=>capture.loaded.includes(id));
 if(process.argv.includes('--require-captures')&&!captureComplete)throw new Error(`Incomplete capture ${c.arm}/${r.id}`);
 const telemetryPath=`${root}/${c.arm}/${r.id}-telemetry.json`;
 const telemetry:any[]=existsSync(telemetryPath)?JSON.parse(readFileSync(telemetryPath,'utf8')):[];
 const tokenTotal=telemetry.length===r.turns.length&&telemetry.every(t=>t.usage?.totalTokens!=null)?telemetry.reduce((s,t)=>s+t.usage.totalTokens,0):null;
 rows.push({arm:c.arm,id:r.id,pass:composition.pass&&Object.values(independent).every(Boolean)&&twoTurn,two_turn_sequence:twoTurn,capture_complete:captureComplete,score:composition.score,issues:composition.issues,independent,seconds:r.turns.reduce((s:number,t:any)=>s+t.seconds,0),tokens:tokenTotal,screenshot:`${c.arm}/${r.id}-furnished-3d.png`});
}
writeFileSync(`${root}/grades.json`,JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows.map(r=>({arm:r.arm,id:r.id,pass:r.pass,score:r.score,issues:r.issues.map(i=>i.code)})),null,2));
