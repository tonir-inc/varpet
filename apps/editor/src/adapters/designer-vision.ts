import type {SceneDocument} from '../contracts';
/** Optional, request-time visuals. CHAT can pass options without changing the conversation UI. */
export interface VisionImage {dataUrl:string;sceneId?:string;revision?:number;selectedIds?:string[]}
export interface DesignerVision {view?:VisionImage;plan?:VisionImage;products?:boolean;selfCheck?:boolean}
export interface VisionCaptureOptions {view?:boolean;products?:boolean;selfCheck?:boolean;planDataUrl?:string;selectedIds?:string[]}
/** DOM event survives Vite hot reloads. Compare the real rendered document before reading pixels. */
export function registerDesignerRenderer(element:Element,render:()=>void,scene:()=>SceneDocument|null){
 const listener=(event:Event)=>{
  const detail=(event as CustomEvent).detail;if(typeof detail?.capture!=='function')return;
  if(!scene()||JSON.stringify(scene())!==detail.sceneJson){detail.error='The view changed before capture; send a fresh request.';return;}
  try{render();detail.capture();detail.handled=true;}catch(error){detail.error=String(error);}
 };
 element.addEventListener('varpet:designer-capture',listener);
 return ()=>element.removeEventListener('varpet:designer-capture',listener);
}
export async function captureDesignerView(scene:SceneDocument,revision:number,selectedIds:string[]=[],signal?:AbortSignal):Promise<VisionImage>{
 const sceneJson=JSON.stringify(scene),sceneId=scene.id;
 const visible=(e:Element)=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
 const svg=[...document.querySelectorAll<SVGSVGElement>('#floor-plan svg,.floor-plan svg')].find(visible);
 const webgl=[...document.querySelectorAll<HTMLCanvasElement>('#viewport canvas')].find(visible);
 if(!svg&&!webgl)throw new Error('No visible editor view is available for the designer snapshot.');
 return new Promise((resolve,reject)=>{
  let settled=false,frame=0;
  const finish=(error?:unknown,value?:VisionImage)=>{if(settled)return;settled=true;clearTimeout(timer);cancelAnimationFrame(frame);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value!);};
  const abort=()=>finish(new DOMException('Snapshot cancelled','AbortError'));
  const timer=setTimeout(()=>finish(new Error('Snapshot timed out; keep the editor tab visible.')),3000);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  frame=requestAnimationFrame(async()=>{
   try{
    const source=svg??webgl!,bounds=source.getBoundingClientRect(),scale=Math.min(1,1280/Math.max(bounds.width,bounds.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bounds.width*scale));canvas.height=Math.max(1,Math.round(bounds.height*scale));
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#eee9df';ctx.fillRect(0,0,canvas.width,canvas.height);
    const detail={sceneJson,handled:false,error:'',capture:()=>{if(webgl&&!svg)ctx.drawImage(webgl,0,0,canvas.width,canvas.height);}};
    source.dispatchEvent(new CustomEvent('varpet:designer-capture',{detail}));
    if(detail.error||!detail.handled)throw new Error(detail.error||'The viewport snapshot hook is unavailable.');
    if(svg){
     const copy=svg.cloneNode(true) as SVGSVGElement,original=[svg,...svg.querySelectorAll('*')],clones=[copy,...copy.querySelectorAll('*')];
     original.forEach((el,i)=>{const style=getComputedStyle(el);for(const name of ['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-dashoffset','stroke-linecap','stroke-linejoin','font-family','font-size','font-weight','opacity','text-anchor','dominant-baseline','paint-order','vector-effect']) (clones[i] as SVGElement).style.setProperty(name,style.getPropertyValue(name));});
     copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('width',String(bounds.width));copy.setAttribute('height',String(bounds.height));
     const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'}));
     try{const img=new Image();img.src=url;await img.decode();if(settled)return;ctx.drawImage(img,0,0,canvas.width,canvas.height);}finally{URL.revokeObjectURL(url);}
    }
    finish(undefined,{dataUrl:canvas.toDataURL('image/jpeg',.8),sceneId,revision,selectedIds:[...selectedIds]});
   }catch(error){finish(error);}
  });
 });
}
export async function requestVision(scene:SceneDocument,revision:number,options:VisionCaptureOptions,signal?:AbortSignal):Promise<DesignerVision>{
 return {...(options.view?{view:await captureDesignerView(scene,revision,options.selectedIds,signal)}:{}),
  ...(options.products?{products:true}:{}),...(options.selfCheck?{selfCheck:true}:{}),
  ...(options.planDataUrl?{plan:{dataUrl:options.planDataUrl}}:{})};
}
