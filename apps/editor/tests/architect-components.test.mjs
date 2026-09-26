import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url));
const output=await mkdtemp(join(tmpdir(),'varpet-architect-components-'));
after(()=>rm(output,{recursive:true}));
await build({root,configFile:false,publicDir:false,logLevel:'error',plugins:[{
 name:'architect-components-entry',resolveId(id){if(id.endsWith('architect-components-entry'))return '\0architect-components-entry';},
 load(id){if(id==='\0architect-components-entry')return `export * from '${root}/src/adapters/architect-http.ts';export * from '${root}/src/core/reconstruction-proposal.ts';export * from '${root}/src/core/apartment-store.ts';`;}
}],build:{ssr:'architect-components-entry',target:'node22',outDir:output,minify:false,rolldownOptions:{output:{entryFileNames:'test.mjs'}}}});
const {createArchitectHttpAdapter,createReconstructionProposal,previewReconstructionProposal,createApartmentStore}=await import(pathToFileURL(join(output,'test.mjs')));
const shell={rooms:[{id:'room',name:'Kitchen and bath',color:'#ffffff',polygon:[[0,0],[6,0],[6,6],[0,6]]}],walls:[],notes:[],components:[
 {id:'sink',name:'Fixed sink',kind:'sink',position:[1,0,1],dimensions:[.6,.85,.6],rotation:0,color:'#ffffff',phase:'existing',roomId:'room'},
 {id:'bath',name:'Fixed bath',kind:'bath',position:[4,0,1],dimensions:[1.7,.6,.75],rotation:0,color:'#ffffff',phase:'existing',roomId:'room'}]};
const reconstruct=components=>createArchitectHttpAdapter({pickFiles:async()=>[new File(['plan'],'plan.png',{type:'image/png'})],fetch:async()=>new Response(JSON.stringify({type:'structure',...shell,components})+'\n')}).reconstruct();
test('architect fixtures survive HTTP, reconstruction preview, Apply and Undo',async()=>{
 const result=await reconstruct(shell.components);
 assert.deepEqual(result.components,shell.components,'HTTP must retain the architect fixed obstacles');
 const original={format:'varpet.editor',version:1,id:'old',name:'Old flat',units:'m',upAxis:'Y',rooms:shell.rooms,walls:[],objects:[]};
 const store=createApartmentStore(original,[]);const before=structuredClone(store.scene);
 const proposal=createReconstructionProposal(store.scene,store.revision,result,true,'import');
 const preview=previewReconstructionProposal(store.scene,store.revision,proposal,[]);
 assert.deepEqual(preview.project.components,shell.components);
 assert.deepEqual(store.scene,before,'preview cannot mutate the original');
 assert.equal(store.execute(proposal.command,true).ok,true);
 assert.deepEqual(store.scene.project.components,shell.components);
 assert.equal(store.undo().ok,true);assert.deepEqual(store.scene,before);
});
test('architect rejects malformed components and broken room references before offering a proposal',async()=>{
 for(const invalid of [null,{},[{...shell.components[0],roomId:'missing'}],[{...shell.components[0],dimensions:[-1,1,1]}],[shell.components[0],shell.components[0]]]){
  await assert.rejects(reconstruct(invalid),/invalid structure/i);
 }
});
test('legacy architect response without components remains valid',async()=>{
 const result=await reconstruct(undefined);assert.equal(result.components,undefined);
});
