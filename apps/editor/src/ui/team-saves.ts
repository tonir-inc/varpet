import {FlatsError,type FlatSnapshot} from '../adapters/flats-http';
export function guardTeamUnload(event:BeforeUnloadEvent,dirty:boolean){if(dirty){event.preventDefault();event.returnValue='';}}
interface SaveDependencies {revision:()=>number;snapshot:()=>FlatSnapshot;save:(base:number,snapshot:FlatSnapshot)=>Promise<{revision:number}>;changed:()=>void}
/** Serial writes acknowledge only their captured local revision. Conflicts never retry. */
export class TeamAutosave {
 savedRevision:number;remoteRevision:number;saving=false;conflict:Record<string,unknown>|null=null;failed=false;lastSaved=0;
 private timer:ReturnType<typeof setTimeout>|undefined;private retry=2000;private disposed=false;private inFlight:Promise<void>|undefined;
 constructor(private deps:SaveDependencies,remoteRevision:number,savedRevision:number){this.remoteRevision=remoteRevision;this.savedRevision=savedRevision;}
 get dirty(){return this.saving||this.deps.revision()!==this.savedRevision;}
 get status(){return this.conflict?`Conflict: ${this.conflict.updated_by||'Someone'} saved a newer version`:this.saving?'Saving…':this.failed?'Save failed — retrying':this.dirty?'Unsaved changes':`Saved to team · ${new Date(this.lastSaved||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;}
 edit(){if(this.disposed)return;clearTimeout(this.timer);this.deps.changed();if(!this.conflict)this.timer=setTimeout(()=>void this.flush(),2000);}
 flush():Promise<void>{if(this.saving)return this.inFlight??Promise.resolve();const pending=this.perform();this.inFlight=pending;return pending;}
 private async perform(){clearTimeout(this.timer);if(this.disposed||this.saving||this.conflict||!this.dirty)return;
  const local=this.deps.revision();this.saving=true;this.deps.changed();
  try{const result=await this.deps.save(this.remoteRevision,this.deps.snapshot());this.remoteRevision=result.revision;this.savedRevision=local;this.lastSaved=Date.now();this.failed=false;this.retry=2000;}
  catch(error){if(error instanceof FlatsError&&error.status===409)this.conflict=error.details;else this.failed=true;}
  finally{this.saving=false;this.deps.changed();if(!this.disposed&&this.dirty&&!this.conflict){this.timer=setTimeout(()=>void this.flush(),this.failed?this.retry:2000);if(this.failed)this.retry=Math.min(this.retry*2,30000);}}
 }
 pause(){clearTimeout(this.timer);}
 resume(){this.disposed=false;if(this.dirty)this.edit();}
 dispose(){this.disposed=true;clearTimeout(this.timer);}
}
export function askSaveName(title:string,value:string,optional=false):Promise<string|null>{
 return new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='portal-dialog';
 dialog.innerHTML='<form method="dialog" style="padding:24px;display:grid;gap:16px"><h2></h2><input aria-label="Name" maxlength="120"><div><button value="cancel" type="button">Cancel</button> <button value="save">Save</button></div></form>';
 dialog.querySelector('h2')!.textContent=title;const input=dialog.querySelector('input')!;input.value=value;input.required=!optional;
 dialog.querySelector('button')!.onclick=()=>dialog.close('cancel');
 dialog.querySelector('form')!.onsubmit=e=>{if(!optional&&!input.value.trim()){e.preventDefault();input.setCustomValidity('Enter a name.');input.reportValidity();}};input.oninput=()=>input.setCustomValidity('');
 dialog.onclose=()=>{resolve(dialog.returnValue==='save'?input.value.trim():null);dialog.remove();};document.body.append(dialog);dialog.showModal();input.focus();input.select();});
}
let displayName:string|undefined;
export async function teamDisplayName(){
 if(displayName!==undefined)return displayName;
 try{const stored=localStorage.getItem('varpet.team.display-name');if(stored!==null)return displayName=stored;}catch{/* private storage */}
 displayName=await askSaveName('Who is saving? (optional)','',true)??'';
 try{localStorage.setItem('varpet.team.display-name',displayName);}catch{/* session still remembers */}return displayName;
}
export function captureTeamThumbnail():string|undefined {
 try{const source=document.querySelector<HTMLCanvasElement>('#viewport canvas');if(!source?.width||!source.height)return;
 const canvas=document.createElement('canvas');canvas.width=Math.min(480,source.width);canvas.height=Math.round(source.height*canvas.width/source.width);canvas.getContext('2d')!.drawImage(source,0,0,canvas.width,canvas.height);
 for(const quality of [.8,.6,.4,.2]){const data=canvas.toDataURL('image/jpeg',quality);if((data.length-data.indexOf(',')-1)*.75<=300*1024)return data;}
 }catch{/* Cross-origin texture may taint the canvas; the scene must still save. */}return;
}
