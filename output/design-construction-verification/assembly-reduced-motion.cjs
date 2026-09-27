const {chromium} = require('/Users/davitstepanyan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const executablePath = '/Users/davitstepanyan/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const baseURL = 'http://127.0.0.1:5173';
const vertices = new Float32Array([-.5,-.5,-.5,.5,-.5,-.5,.5,.5,-.5,-.5,.5,-.5,-.5,-.5,.5,.5,-.5,.5,.5,.5,.5,-.5,.5,.5]);
const indices = new Uint16Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]);
const bytes = Buffer.concat([Buffer.from(vertices.buffer), Buffer.from(indices.buffer)]);
const model = {asset:{version:'2.0'},scene:0,scenes:[{nodes:Array.from({length:12},(_,i)=>i)}],
  nodes:Array.from({length:12},(_,i)=>({name:`assembly-part-${i}`,mesh:0,translation:[0,i*.12,0],scale:[1,.08,.5]})),
  meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.65,.48,.3,1],metallicFactor:0,roughnessFactor:.8}}],
  buffers:[{byteLength:bytes.length,uri:`data:application/octet-stream;base64,${bytes.toString('base64')}`}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:vertices.byteLength,target:34962},{buffer:0,byteOffset:vertices.byteLength,byteLength:indices.byteLength,target:34963}],
  accessors:[{bufferView:0,componentType:5126,count:8,type:'VEC3',min:[-.5,-.5,-.5],max:[.5,.5,.5]},{bufferView:1,componentType:5123,count:36,type:'SCALAR'}]};
(async () => {
  const browser = await chromium.launch({headless:true, executablePath});
  const checks = [], errors = [];
  try {
    const page = await browser.newPage({viewport:{width:1000,height:720}, reducedMotion:'no-preference'});
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/__assembly-probe',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>body{margin:0}#host{position:relative;width:100vw;height:100vh}</style></head><body><div id="host"></div></body></html>'}));
    await page.route('**/__assembly-probe.glb',route=>route.fulfill({contentType:'model/gltf+json',body:JSON.stringify(model)}));
    await page.goto(`${baseURL}/__assembly-probe`);
    await page.evaluate(async () => {
      const source = await (await fetch('/src/render/viewport.ts')).text();
      const controlsURL = /import \{ TransformControls \} from "([^"]+)"/.exec(source)[1];
      const {TransformControls} = await import(controlsURL);
      window.qa = {frames:0, errors:[], root:null};
      const setMode = TransformControls.prototype.setMode;
      TransformControls.prototype.setMode = function(...args) {
        qa.controls=this;
        return setMode.apply(this,args);
      };
      const {createViewport} = await import('/src/render/viewport.ts');
      qa.scene = {format:'varpet.editor',version:1,id:'assembly-probe',name:'Assembly QA',units:'m',upAxis:'Y',
        rooms:[{id:'room',name:'Room',color:'#cccccc',polygon:[[-3,-3],[3,-3],[3,3],[-3,3]]}],walls:[],
        objects:[{id:'probe',name:'Assembly probe',assetId:'custom-probe-1',position:[0,0,0],rotation:0,scale:[1,1,1]}]};
      qa.before = JSON.stringify(qa.scene);
      qa.asset={id:'custom-probe-1',name:'Assembly probe',category:'Storage',kind:'shelf',dimensions:[1,1.4,.5],color:'#a78059',price:0,source:{type:'gltf',url:'/__assembly-probe.glb'}};
      qa.viewport=createViewport(document.querySelector('#host'),{onSelect(){},onTransform(){},onInteraction(){},onError(message){qa.errors.push(message);}});
      qa.viewport.onFrame(()=>qa.frames++);
      qa.viewport.setScene(qa.scene,[qa.asset]);
      qa.viewport.setSelection('probe'); qa.viewport.setTool('move'); qa.root=qa.controls.object;
      qa.viewport.setCameraPose({position:[4,3,5],target:[0,.6,0]},0);
      qa.parts=()=>{const out=[];qa.root?.traverse(node=>{if(node.isMesh && node.name.startsWith('assembly-part-'))out.push(node);});return out;};
    });
    try { await page.waitForFunction(()=>qa.root && !qa.viewport.loading() && qa.parts().length===12); }
    catch (error) { console.log(await page.evaluate(()=>({errors:qa.errors,loading:qa.viewport.loading(),frames:qa.frames,root:qa.root?.name,parts:qa.parts().map(part=>part.name)}))); throw error; }
    await page.waitForTimeout(300);
    await page.evaluate(()=>{qa.baseline=qa.parts().map(part=>({name:part.name,y:part.position.y}));qa.viewport.animateAssembly('probe');});
    await page.waitForFunction(()=>qa.parts().some(part=>!part.visible) && qa.parts().some(part=>part.position.y!==qa.baseline.find(base=>base.name===part.name).y));
    checks.push('actual loaded model has an active staggered assembly with hidden and lifted parts');
    await page.screenshot({path:path.join(__dirname,'assembly-active.png')});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForTimeout(150);
    const final = await page.evaluate(()=>({allVisible:qa.parts().every(part=>part.visible),exactY:qa.parts().every(part=>part.position.y===qa.baseline.find(base=>base.name===part.name).y),unchanged:JSON.stringify(qa.scene)===qa.before,frames:qa.frames,errors:qa.errors}));
    assert.equal(final.allVisible,true); assert.equal(final.exactY,true); checks.push('live OS preference makes every part visible at its exact original pose on the next render');
    assert.equal(final.unchanged,true); checks.push('assembly and settling leave the authoritative scene unchanged');
    await page.screenshot({path:path.join(__dirname,'assembly-reduced.png')});
    await page.waitForTimeout(400);
    const idle = await page.evaluate(()=>qa.frames);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>qa.frames),idle); checks.push('renderer returns to idle after reduced-motion settling');
    await page.evaluate(()=>qa.viewport.animateAssembly('probe'));
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(()=>qa.parts().every(part=>part.visible && part.position.y===qa.baseline.find(base=>base.name===part.name).y)),true); checks.push('assembly stays settled when reduced motion was already enabled');
    assert.deepEqual(final.errors,[]); assert.deepEqual(errors,[]);
    await page.evaluate(()=>qa.viewport.dispose());
    fs.writeFileSync(path.join(__dirname,'assembly-results.json'),JSON.stringify({checks,pageErrors:errors},null,2));
    for(const name of checks)console.log('PASS '+name);
    console.log(JSON.stringify({status:'passed',checks:checks.length,pageErrors:errors.length}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
