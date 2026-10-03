import './team-saves.css';
import {flatsApi, type FlatMeta, type FlatSnapshot, type FlatKind} from '../adapters/flats-http';
import type {CatalogProduct} from '../adapters/database-catalog';
import type {EditorStore} from '../core/store';
import {apartmentPayload, type EditorSession} from '../portal/session';
import type {TeamStartup} from '../portal/team-session';
import {TeamAutosave,askSaveName,teamDisplayName,captureTeamThumbnail,guardTeamUnload,teamReloadGuard,saveTeamBeforeReload} from './team-saves';
export function mountTeamSaves(deps:{store:EditorStore;products:()=>CatalogProduct[];startup:TeamStartup|null;draft:EditorSession|null;active:()=>boolean;proposal:()=>boolean;initialKind?:FlatKind;notify:(message:string,error?:boolean)=>void;saved:(revision:number)=>void}){
 const {store}=deps;let flat:FlatMeta|null=deps.startup?.flat??null;let controller:TeamAutosave|undefined;let creating=false;let thumbnailAt=0;let who='';let allowLeave=false;let attempted=false;
 const kind:FlatKind=flat?.kind??(deps.draft?.templateId?'template':deps.draft?'upload':deps.initialKind??'blank');
 const actions=document.createElement('span');actions.className='team-save-actions';
 actions.innerHTML='<button class="button quiet" data-team-rename>Rename</button><details><summary class="button quiet" aria-label="Team apartment actions">⋯</summary><div class="team-save-menu"><button class="button quiet" data-team-versions>Versions</button><a href="/?view=apartments">Saved apartments</a><button class="button quiet" data-team-reload hidden>Reload theirs</button><button class="button quiet" data-team-copy hidden>Save mine as a copy</button></div></details>';
 document.querySelector('.project-name')!.after(actions);
 const button=(key:string)=>actions.querySelector<HTMLButtonElement>(`[data-team-${key}]`)!;
 // An opened catalog or Experimental design (templateId) is still in the catalog: unsaved only once edited. An upload
 // draft exists nowhere else, so it counts as unsaved from the start.
 const unsavedDraft=()=>Boolean(deps.draft&&!deps.draft.templateId);
 const dirty=()=>deps.active()&&(creating||(controller?controller.dirty:attempted||store.revision>0||unsavedDraft()));
 function render(){actions.hidden=!deps.active();if(!deps.active())return;
  document.querySelector('#save-state')!.textContent=creating?'Saving…':controller?.status??(dirty()?'Unsaved changes':'Not saved yet');
  document.querySelector('#project-name')!.textContent=flat?.name??store.scene.name;
  document.querySelector('.project-name > span')!.textContent='Team apartment';
  const save=document.querySelector<HTMLButtonElement>('#save')!;save.title='Save to team · ⌘S';save.disabled=creating||Boolean(controller?.saving)||deps.proposal();
  button('rename').disabled=!flat;button('versions').disabled=!flat;
  button('reload').hidden=button('copy').hidden=!controller?.conflict;
  if(controller?.conflict)actions.querySelector('details')!.open=true;
 }
 function snapshot(name=flat?.name??store.scene.name,forceThumbnail=false):FlatSnapshot {
  const payload=apartmentPayload(store.scene,deps.products(),deps.draft?.templateId??null,name);
  const thumbnail=(forceThumbnail||Date.now()-thumbnailAt>=60000)&&!deps.proposal()?captureTeamThumbnail():undefined;
  return {scene:payload.scene,catalog:payload.catalog,designed:store.scene.objects.length>0,summary:{...flat?.summary,rooms:store.scene.rooms.length,items:store.scene.objects.length,area_m2:store.scene.rooms.reduce((sum,room)=>sum+Math.abs(room.polygon.reduce((area,p,i)=>{const q=room.polygon[(i+1)%room.polygon.length]!;return area+p[0]*q[1]-q[0]*p[1];},0))/2,0),source:flat?.summary?.source??deps.draft?.templateId??store.scene.name},updated_by:who||undefined,thumbnail};
 }
 function attach(local:number){controller=new TeamAutosave({revision:()=>store.revision,snapshot,save:async(base,payload,keepalive)=>{
   if(!deps.active()||deps.proposal())throw new Error('Save paused during shared session or proposal review.');
   if(keepalive)return saveTeamBeforeReload(flat!.id,base,payload);
   if(!who)who=await teamDisplayName();payload.updated_by=who||undefined;
   const result=await flatsApi.save(flat!.id,{...payload,base_revision:base});if(payload.thumbnail)thumbnailAt=Date.now();return result;
  },changed:()=>{if(controller&&!controller.dirty)deps.saved(controller.savedRevision);render();}},flat!.revision,local);}
 if(flat){attach(store.revision);controller!.lastSaved=Date.parse(flat.updated_at)||Date.now();}
 async function save(copy=false){if(!deps.active()||creating||deps.proposal())return;
  if(controller&&!copy){await controller.flush();return;}
  creating=true;attempted=true;render();
  try{const name=await askSaveName(copy?'Save mine as a copy':'Save apartment to team',copy?`${flat?.name??store.scene.name} copy`:store.scene.name);if(!name)return;
   who=await teamDisplayName();const revision=store.revision;const payload=snapshot(name,true);
   const saved=await flatsApi.create({...payload,name,kind});controller?.dispose();flat=saved;if(payload.thumbnail)thumbnailAt=Date.now();attach(revision);deps.saved(revision);
   history.replaceState(null,'',`/?flat=${encodeURIComponent(saved.id)}`);if(store.revision!==revision)controller!.edit();
  }catch(error){deps.notify(error instanceof Error?error.message:'Team save failed. Try Save again.',true);}
  finally{creating=false;render();}
 }
 button('rename').onclick=async()=>{if(!flat)return;const name=await askSaveName('Rename apartment',flat.name);if(!name)return;try{flat=await flatsApi.rename(flat.id,name);render();}catch(e){deps.notify(String(e),true);}};
 button('copy').onclick=()=>void save(true);
 button('reload').onclick=()=>{if(window.confirm('Reload their version and discard your unsaved changes?')){allowLeave=true;location.reload();}};
 button('versions').onclick=async()=>{if(!flat)return;try{const versions=await flatsApi.versions(flat.id);const dialog=document.createElement('dialog');dialog.className='portal-dialog';dialog.style.padding='24px';const title=document.createElement('h2');title.textContent='Saved versions';dialog.append(title);
  const close=document.createElement('button');close.textContent='Close';close.onclick=()=>dialog.close();dialog.append(close);
  for(const version of versions){const row=document.createElement('p');row.textContent=`${new Date(version.saved_at).toLocaleString()} · ${version.updated_by||'Anonymous'} · v${version.revision} `;const restore=document.createElement('button');restore.textContent='Restore';restore.onclick=async()=>{if(!window.confirm('Restore this version? Unsaved changes will be discarded.'))return;restore.disabled=true;controller?.dispose();try{await controller?.flush();await flatsApi.restore(flat!.id,version.revision);allowLeave=true;location.reload();}catch(e){restore.disabled=false;controller?.resume();deps.notify(String(e),true);}};row.append(restore);dialog.append(row);}
  dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
 }catch(e){deps.notify(String(e),true);}};
 store.subscribe(()=>{if(deps.active())controller?.edit();else controller?.pause();render();});
 const reloading=teamReloadGuard(import.meta.hot,async()=>{if(flat&&dirty()&&!deps.proposal())await controller?.flush(true);});
 window.addEventListener('beforeunload',event=>guardTeamUnload(event,!allowLeave&&dirty(),reloading()));
 document.addEventListener('click',event=>{const link=(event.target as Element).closest?.('a[href]') as HTMLAnchorElement|null;if(!link||link.target==='_blank'||event.ctrlKey||event.metaKey||!dirty())return;const url=new URL(link.href,location.href);if(url.origin!==location.origin)return;if(!window.confirm('Leave without saving?'))event.preventDefault();else allowLeave=true;},true);
 render();return {save,render};
}
