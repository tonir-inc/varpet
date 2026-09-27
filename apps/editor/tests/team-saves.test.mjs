import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url)),out=await mkdtemp(join(tmpdir(),'team-saves-'));
after(()=>rm(out,{recursive:true,force:true}));
await build({root,configFile:false,publicDir:false,logLevel:'error',plugins:[{name:'entry',resolveId(id){if(id.endsWith('team-entry'))return '\0entry';},load(id){if(id==='\0entry')return ['adapters/flats-http','ui/team-saves','portal/team-apartments','portal/team-session','portal/templates'].map(p=>`export * from '${root}/src/${p}.ts';`).join('\n');}}],build:{ssr:'team-entry',target:'node22',outDir:out,rolldownOptions:{output:{entryFileNames:'test.mjs'}}}});
const {createFlatsApi,FlatsError,TeamAutosave,guardTeamUnload,teamReloadGuard,saveTeamBeforeReload,teamCards,restoreTeamFlat,createTemplateScene}=await import(pathToFileURL(join(out,'test.mjs')));
const id='12345678-1234-1234-1234-123456789abc';
test('adapter methods, revisions and conflict details',async()=>{const calls=[];const api=createFlatsApi(async(url,init)=>{calls.push([url,init]);return new Response(JSON.stringify({error:{code:'conflict',updated_by:'Serg',current_revision:4}}),{status:409});});await assert.rejects(api.save(id,{base_revision:3}),e=>e instanceof FlatsError&&e.details.updated_by==='Serg');assert.equal(calls[0][0],`/api/flats/${id}`);assert.equal(JSON.parse(calls[0][1].body).base_revision,3);assert.throws(()=>api.thumbnail('../bad'));});
test('debounce, snapshot revision and conflict stop automatic writes',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let revision=0,calls=[],reject=false;
 const c=new TeamAutosave({revision:()=>revision,snapshot:()=>({scene:{},catalog:[]}),save:async(base)=>{calls.push(base);if(reject)throw new FlatsError(409,{updated_by:'Serg'});return {revision:base+1};},changed:()=>{}},4,0);
 revision=1;c.edit();t.mock.timers.tick(1000);revision=2;c.edit();t.mock.timers.tick(1999);assert.equal(calls.length,0);t.mock.timers.tick(1);await Promise.resolve();await Promise.resolve();assert.deepEqual(calls,[4]);assert.equal(c.dirty,false);
 reject=true;revision=3;c.edit();t.mock.timers.tick(2000);await Promise.resolve();await Promise.resolve();assert.equal(c.conflict.updated_by,'Serg');assert.equal(c.dirty,true);t.mock.timers.tick(60000);assert.equal(calls.length,2);c.dispose();
});
test('beforeunload only prevents leaving with unsaved changes',()=>{let prevented=false;const e={preventDefault(){prevented=true;}};guardTeamUnload(e,false);assert.equal(prevented,false);guardTeamUnload(e,true);assert.equal(prevented,true);assert.equal(e.returnValue,'');});
test('team cards escape names and show thumbnail, badges and actions',()=>{const html=teamCards([{id,name:'<script>',kind:'upload',designed:false,updated_at:'2026-09-27',updated_by:'Serg',has_thumbnail:true}]);assert.ok(html.includes('&lt;script&gt;'));for(const text of ['Plan only','Upload','Rename','Delete','Serg',`?flat=${id}`,'/thumbnail'])assert.ok(html.includes(text),text);assert.match(teamCards([]),/No saved apartments/);});
test('flat restore validates scene and keeps catalog before editor startup',async()=>{const scene=createTemplateScene('avani');const restored=await restoreTeamFlat(id,{get:async()=>({id,name:'Team name',revision:5,kind:'template',scene,catalog:[]})});assert.equal(restored.scene.name,'Team name');assert.equal(restored.flat.revision,5);const app=await readFile(join(root,'src/app.ts'),'utf8');assert.match(app,/route.get\('flat'\)/);assert.match(app,/restoreTeamFlat/);});
test('edits during a save remain dirty and use acknowledged base on next write',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let revision=1,resolve;const bases=[];
 const c=new TeamAutosave({revision:()=>revision,snapshot:()=>({scene:{},catalog:[]}),save:base=>{bases.push(base);return new Promise(r=>{resolve=r;});},changed:()=>{}},7,0);
 const first=c.flush();revision=2;c.edit();resolve({revision:8});await first;assert.equal(c.dirty,true);assert.equal(c.savedRevision,1);t.mock.timers.tick(2000);assert.deepEqual(bases,[7,8]);resolve({revision:9});await Promise.resolve();await Promise.resolve();assert.equal(c.dirty,false);c.dispose();
});
test('failed autosave retries with backoff without advancing its base',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0;
 const c=new TeamAutosave({revision:()=>1,snapshot:()=>({scene:{},catalog:[]}),save:async base=>{assert.equal(base,2);calls++;if(calls<3)throw new Error('offline');return {revision:3};},changed:()=>{}},2,0);
 await c.flush();assert.match(c.status,/retrying/);t.mock.timers.tick(2000);await Promise.resolve();await Promise.resolve();assert.equal(calls,2);t.mock.timers.tick(3999);assert.equal(calls,2);t.mock.timers.tick(1);await Promise.resolve();await Promise.resolve();assert.equal(calls,3);assert.equal(c.dirty,false);c.dispose();
});
test('adapter maps list/create/get/rename/delete/history/restore to the contract',async()=>{
 const calls=[];const api=createFlatsApi(async(url,init)=>{calls.push([url,init.method,init.body&&JSON.parse(init.body)]);if(init.method==='DELETE')return new Response(null,{status:204});return new Response(JSON.stringify(url.endsWith('/versions')?{versions:[]}:url.includes('?')?{flats:[]}:{}));});
 assert.deepEqual(await api.list(),[]);await api.create({name:'Flat',kind:'blank',scene:{},catalog:[]});await api.get(id);await api.rename(id,'New');await api.delete(id);assert.deepEqual(await api.versions(id),[]);await api.version(id,3);await api.restore(id,2);
 assert.deepEqual(calls.map(([url,method])=>[url,method]),[['/api/flats?include_deleted=0','GET'],['/api/flats','POST'],[`/api/flats/${id}`,'GET'],[`/api/flats/${id}`,'PATCH'],[`/api/flats/${id}`,'DELETE'],[`/api/flats/${id}/versions`,'GET'],[`/api/flats/${id}/versions/3`,'GET'],[`/api/flats/${id}/restore`,'POST']]);assert.deepEqual(calls[7][2],{revision:2});
});

test('Vite reload flushes dirty changes and suppresses only the reload prompt',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const listeners={};let writes=0;
 const c=new TeamAutosave({revision:()=>1,snapshot:()=>({scene:{},catalog:[]}),save:async(base,payload,keepalive)=>{assert.equal(keepalive,true);writes++;return {revision:base+1};},changed:()=>{}},1,0);
 const reloading=teamReloadGuard({on(event,fn){listeners[event]=fn;}},()=>c.flush(true));
 const prompt=()=>{let prevented=false;guardTeamUnload({preventDefault(){prevented=true;}},true,reloading());return prevented;};
 assert.equal(prompt(),true);
 await listeners['vite:beforeFullReload']();assert.equal(writes,1);assert.equal(prompt(),false);
 t.mock.timers.tick(1000);assert.equal(prompt(),true);
 await listeners['vite:beforeFullReload']();assert.equal(writes,1);c.dispose();
});
test('ordinary HMR updates and production keep real unload protection',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const listeners={};let flushes=0;
 const previous=globalThis.document;globalThis.document={querySelector:()=>null};
 try{const reloading=teamReloadGuard({on(event,fn){listeners[event]=fn;}},async()=>{flushes++;});
 await listeners['vite:beforeUpdate']();assert.equal(reloading(),false);assert.equal(flushes,0);
 assert.equal(teamReloadGuard(undefined)(),false);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
test('reload transport uses keepalive and omits large thumbnails',async()=>{
 let request;await saveTeamBeforeReload(id,4,{scene:{},catalog:[],thumbnail:'large'},async(url,init)=>{request={url,...init};return new Response(JSON.stringify({revision:5}));});
 assert.equal(request.url,`/api/flats/${id}`);assert.equal(request.keepalive,true);assert.equal(request.method,'PUT');
 assert.equal(JSON.parse(request.body).base_revision,4);assert.equal(JSON.parse(request.body).thumbnail,undefined);assert.equal(request.signal,undefined);
});
test('reload flush waits for the active write before saving newer edits',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let revision=1,resolve;const calls=[];
 const c=new TeamAutosave({revision:()=>revision,snapshot:()=>({scene:{},catalog:[]}),save:(base,payload,keepalive)=>{calls.push([base,keepalive]);return calls.length===1?new Promise(r=>{resolve=r;}):Promise.resolve({revision:base+1});},changed:()=>{}},7,0);
 const first=c.flush();revision=2;const reload=c.flush(true);assert.deepEqual(calls,[[7,false]]);
 resolve({revision:8});await first;await reload;assert.deepEqual(calls,[[7,false],[8,true]]);assert.equal(c.dirty,false);c.dispose();
});
test('failed reload flush still allows Vite reload',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const listeners={};
 const reloading=teamReloadGuard({on(event,fn){listeners[event]=fn;}},async()=>{throw new Error('offline');});
 await listeners['vite:beforeFullReload']();assert.equal(reloading(),true);
});
test('first update with a Vite error overlay prepares its fallback reload',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const listeners={};let flushes=0;
 const previous=globalThis.document;globalThis.document={querySelector:()=>({})};
 try{const reloading=teamReloadGuard({on(event,fn){listeners[event]=fn;}},async()=>{flushes++;});
 await listeners['vite:beforeUpdate']();assert.equal(reloading(),true);assert.equal(flushes,1);
 t.mock.timers.tick(1000);await listeners['vite:beforeUpdate']();assert.equal(reloading(),false);assert.equal(flushes,1);
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
