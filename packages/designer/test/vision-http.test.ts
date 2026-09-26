import {expect,test} from 'vitest';
import {demoScene,localCatalog} from '../../../apps/editor/src/core/demo.js';
import {createDesignerHttpAdapter} from '../../../apps/editor/src/adapters/designer-http.js';
test('explicit visual inputs travel with the exact source revision; normal requests have no vision field',async()=>{
 const vision={view:{dataUrl:'data:image/png;base64,iVBORw0KGgo=',sceneId:demoScene.id,revision:7},products:true};
 for(const opt of [undefined,vision]){
  let sent:any;
  const adapter=createDesignerHttpAdapter({catalog:localCatalog,vision:opt,fetch:async(_u,init)=>{sent=JSON.parse(String(init?.body));return new Response(JSON.stringify({type:'question',conversationId:'test',question:'Choose a corner',options:[]})+'\n',{headers:{'content-type':'application/x-ndjson'}});}});
  await expect(adapter.propose(demoScene,7)).rejects.toThrow('Choose a corner');
  expect(sent.revision).toBe(7);expect(sent.vision).toEqual(opt);expect(sent.scene).toEqual(demoScene);
 }
});

import {registerDesignerRenderer} from '../../../apps/editor/src/adapters/designer-vision.js';
test('snapshot hook refuses pixels from another document and unregisters on dispose',()=>{
 const element=new EventTarget() as unknown as Element;let captured=0,rendered=0;
 const dispose=registerDesignerRenderer(element,()=>{rendered++;},()=>demoScene);
 const detail={sceneJson:JSON.stringify({...demoScene,id:'stale'}),capture:()=>{captured++;},handled:false,error:''};
 element.dispatchEvent(new CustomEvent('varpet:designer-capture',{detail}));expect(detail.error).toContain('changed');expect(captured).toBe(0);expect(rendered).toBe(0);
 detail.sceneJson=JSON.stringify(demoScene);detail.error='';element.dispatchEvent(new CustomEvent('varpet:designer-capture',{detail}));expect(captured).toBe(1);expect(detail.handled).toBe(true);
 dispose();element.dispatchEvent(new CustomEvent('varpet:designer-capture',{detail}));expect(captured).toBe(1);
});

test('snapshot cancellation does not wait for a hidden-tab animation frame',async()=>{
 const {vi}=await import('vitest');const {captureDesignerView}=await import('../../../apps/editor/src/adapters/designer-vision.js');
 const canvas={getBoundingClientRect:()=>({width:100,height:100})};const cancel=vi.fn();
 vi.stubGlobal('document',{querySelectorAll:(selector:string)=>selector==='#viewport canvas'?[canvas]:[]});
 vi.stubGlobal('getComputedStyle',()=>({visibility:'visible'}));vi.stubGlobal('requestAnimationFrame',()=>42);vi.stubGlobal('cancelAnimationFrame',cancel);
 try{const controller=new AbortController(),promise=captureDesignerView(demoScene,1,[],controller.signal);controller.abort();await expect(promise).rejects.toMatchObject({name:'AbortError'});expect(cancel).toHaveBeenCalledWith(42);}finally{vi.unstubAllGlobals();}
});
