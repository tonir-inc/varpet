import './ui/style.css';
import type { AgentProposal, CatalogAsset, EditCommand, ObjectPatch, Operation, SceneObject, ToolMode, ViewMode, WallMode } from './contracts';
import { demoScene, localCatalog } from './core/demo';
import { EditorStore } from './core/store';
import { validateScene } from './core/validation';
import { loadLocal, parseScene, saveLocal, serializeScene } from './core/persistence';
import { catalogAdapter, designerAdapter, structureAdapter } from './adapters/mock';
import { createViewport } from './render/viewport';
import { icon } from './ui/icons';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="app-header">
    <a class="brand" href="#" aria-label="Varpet home"><span class="brand-mark">v<span>•</span></span><span>varpet<span class="brand-dot">.</span></span></a>
    <span class="header-divider"></span>
    <div class="project-name"><strong id="project-name">Apartment 01</strong><span><i class="connection-dot"></i> Local workspace</span></div>
    <div class="header-actions"><span id="save-state" class="save-state">Demo scene</span>
      <div class="history-buttons"><button id="undo" class="icon-button" title="Undo · ⌘Z" aria-label="Undo">${icon('undo')}</button><button id="redo" class="icon-button" title="Redo · ⌘⇧Z" aria-label="Redo">${icon('redo')}</button></div>
      <button id="integrations" class="button quiet">${icon('connections')} Integrations</button>
      <button id="file-menu" class="button quiet">${icon('folder')} Open <span class="caret">⌄</span></button>
      <button id="save" class="button primary">${icon('save')} Save scene</button>
    </div>
  </header>
  <div class="workspace">
    <aside class="left-panel">
      <div class="panel-tabs" role="tablist" aria-label="Workspace panels"><button id="scene-tab" role="tab" aria-selected="true" class="active">${icon('layers')} Scene</button><button id="assets-tab" role="tab" aria-selected="false">${icon('box')} Assets</button></div>
      <section id="scene-panel" class="panel-content"><div class="section-title"><span>SCENE EXPLORER</span><span id="object-count" class="count"></span></div><div class="scene-root">${icon('home')} <strong>Apartment</strong><span class="pill">1 floor</span></div><div id="hierarchy" class="hierarchy"></div><div class="structure-note">${icon('lock')} Structure is imported<br><span>Select furniture to make it yours.</span></div></section>
      <section id="assets-panel" class="panel-content" hidden><div class="section-title"><span>LOCAL COLLECTION</span><span id="asset-count" class="count"></span></div><label class="search">${icon('search')}<input id="asset-search" placeholder="Find furniture…" aria-label="Search furniture" /></label><div id="asset-categories" class="category-list"></div><div id="asset-list" class="asset-list"></div><p class="muted catalog-note">Built-in 3D models · no downloads needed</p></section>
      <div class="left-footer"><span class="avatar">V</span><div><strong>Your design studio</strong><span>Made for working together</span></div><button id="help" class="icon-button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">${icon('help')}</button></div>
    </aside>
    <main class="viewport-shell" aria-label="3D apartment editor">
      <div id="viewport"></div>
      <div class="viewport-top"><div class="view-switch" role="group" aria-label="Camera view"><button id="perspective" class="active">${icon('cube')} Perspective</button><button id="top-view">${icon('top')} Top view</button></div><div class="view-options"><button id="walls" title="Cycle wall visibility">${icon('walls')} <span>Cutaway</span></button><button id="quality" title="Toggle rendering quality">${icon('sun')} <span>Balanced</span></button></div></div>
      <div class="tool-rail" role="toolbar" aria-label="Object tools">${(['select','move','rotate','scale'] as ToolMode[]).map((tool, i) => `<button data-tool="${tool}" class="${i === 0 ? 'active' : ''}" aria-label="${{select:'Select',move:'Move',rotate:'Rotate',scale:'Resize'}[tool]} tool" title="${{select:'Select · V',move:'Move · G',rotate:'Rotate · R',scale:'Resize · S'}[tool]}">${icon(tool)}</button>`).join('')}<div class="tool-divider"></div><button id="focus" aria-label="Focus selection" title="Frame selection / apartment · F">${icon('focus')}</button></div>
      <div class="canvas-caption"><span class="eyebrow">THE EVERYDAY APARTMENT</span><h1>A place to make your own.</h1><p>Thoughtful spaces, down to the last detail.</p></div>
      <div class="canvas-bottom"><span id="view-hint">Drag to orbit <b>·</b> Right drag to pan <b>·</b> Scroll to zoom</span><button id="snap" aria-pressed="true" class="snap active">${icon('grid')} Snap <strong>0.25 m</strong></button></div>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <div id="render-error" class="render-error" hidden></div>
    </main>
    <aside class="right-panel"><div class="inspector-heading"><span>Properties</span><span class="subtle">${icon('sliders')}</span></div><div id="inspector" class="inspector"></div>
      <section class="assistant-card"><div class="assistant-heading"><span class="assistant-icon">${icon('sparkles')}</span><div><strong>A second pair of eyes</strong><span>Design assistant <span class="mock-label">DEMO</span></span></div></div><p>Explore a small change. You decide what belongs in your space.</p><button id="suggest" class="button suggestion">${icon('sparkles')} Suggest an edit ${icon('arrow')}</button><div id="proposal"></div></section>
    </aside>
  </div>
  <footer class="status-bar"><span><i class="connection-dot"></i> <span id="status-text">Ready to create</span></span><span id="selection-status">Nothing selected</span><span>Metres <b>·</b> Y up <b>·</b> <span id="revision">Revision 0</span></span></footer>
  <input id="file-input" type="file" accept=".json,application/json" hidden />
  <dialog id="modal"><div id="modal-content"></div></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const uid = () => crypto.randomUUID();
let catalog: CatalogAsset[] = localCatalog;
const store = new EditorStore(demoScene, catalog);
let selectedId: string | null = null;
let tool: ToolMode = 'select';
let view: ViewMode = 'perspective';
let wallMode: WallMode = 'cutaway';
let snap = true;
let interacting = false;
let interactionRevision = 0;
let savedRevision = -1;
let pending: AgentProposal | null = null;
let busy = false;
let assetCategory = 'All';
let toastTimer: ReturnType<typeof setTimeout>;

function notify(message: string, error = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 5000);
  $('#status-text').textContent = message;
}

const viewport = createViewport($('#viewport'), {
  onSelect: id => select(id),
  onTransform: (id, patch) => {
    run([{type:'update', id, patch}], `Transform ${store.scene.objects.find(o => o.id === id)?.name ?? 'object'}`, interactionRevision);
    viewport.setScene(store.scene, catalog);
    viewport.setSelection(selectedId);
  },
  onInteraction: active => { interacting = active; if (active) interactionRevision = store.revision; renderProposal(); },
  onError: message => notify(message, true),
});

function run(operations: Operation[], label: string, revision = store.revision) {
  const command: EditCommand = {id:uid(), label, source:'human', baseRevision:revision, operations};
  const result = store.execute(command, true);
  if (!result.ok) notify(result.errors.join(' '), true);
  else if (result.warnings.length) notify(`${label}. ${result.warnings[0]}`);
  else notify(label);
  return result.ok;
}

function select(id: string | null) {
  selectedId = id && store.scene.objects.some(o => o.id === id) ? id : null;
  viewport.setSelection(selectedId);
  renderHierarchy(); renderInspector();
  const object = store.scene.objects.find(o => o.id === selectedId);
  $('#selection-status').textContent = object ? `${object.name} selected` : 'Nothing selected';
  $('.canvas-caption').classList.toggle('compact', !!object);
}

function inRoom(x: number, z: number, polygon: [number, number][]) {
  let inside = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i]!,b=polygon[j]!;
    if ((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}

function renderHierarchy() {
  const scene = store.scene;
  const assigned = new Set<string>();
  const row = (o: SceneObject) => `<button class="object-row ${o.id === selectedId ? 'selected' : ''}" data-object="${escape(o.id)}" aria-pressed="${o.id === selectedId}">${icon('box')}<span>${escape(o.name)}</span>${o.id === selectedId ? '<span class="selected-dot"></span>' : ''}</button>`;
  $('#hierarchy').innerHTML = scene.rooms.map(room => {
    const objects = scene.objects.filter(o => !assigned.has(o.id) && inRoom(o.position[0],o.position[2],room.polygon));
    objects.forEach(o => assigned.add(o.id));
    return `<details open><summary><span class="room-chevron">⌄</span>${icon('room')}<span>${escape(room.name)}</span><span class="count">${objects.length}</span></summary><div class="room-objects">${objects.map(row).join('')}</div></details>`;
  }).join('') + scene.objects.filter(o=>!assigned.has(o.id)).map(row).join('');
  $('#object-count').textContent = String(scene.objects.length);
  $('#hierarchy').querySelectorAll<HTMLButtonElement>('[data-object]').forEach(button => button.onclick = () => select(button.dataset.object!));
}

function renderInspector() {
  const object = store.scene.objects.find(o=>o.id===selectedId);
  if (!object) {
    const area = store.scene.rooms.reduce((sum,r)=> sum + Math.abs(r.polygon.reduce((a,p,i)=>{ const q=r.polygon[(i+1)%r.polygon.length]!; return a+p[0]*q[1]-q[0]*p[1];},0))/2,0);
    $('#inspector').innerHTML = `<div class="overview-icon">${icon('home')}</div><span class="eyebrow">YOUR APARTMENT</span><h2>${escape(store.scene.name)}</h2><p class="inspector-description">A warm, lived-in space. Pick a piece of furniture to adjust its position, proportions, or finish.</p><div class="overview-stats"><div><strong>${area.toFixed(0)}<small> m²</small></strong><span>Floor area</span></div><div><strong>${store.scene.rooms.length}</strong><span>Spaces</span></div><div><strong>${store.scene.objects.length}</strong><span>Objects</span></div></div><div class="section-title"><span>WORKING WITH YOUR SPACE</span></div><div class="instruction"><span>1</span><p>Select furniture in the scene or explorer.</p></div><div class="instruction"><span>2</span><p>Move, rotate, or resize with the tools.</p></div><div class="instruction"><span>3</span><p>Find something new in the asset collection.</p></div><button id="browse-assets" class="button full">${icon('box')} Browse furniture ${icon('arrow')}</button><div class="import-note">${icon('lock')} Walls, doors, and windows come from the architect import.</div>`;
    $('#browse-assets').onclick = ()=>switchPanel('assets');
    return;
  }
  const asset=catalog.find(a=>a.id===object.assetId)!;
  const dimension=asset.dimensions.map((d,i)=>d*object.scale[i]!);
  const field=(name:string,label:string,value:number,step:string,min?:string)=>`<label class="number-field"><span>${label}</span><input type="number" aria-label="${name}" data-field="${name}" value="${Number(value.toFixed(3))}" step="${step}" ${min ? `min="${min}"` : ''}/></label>`;
  $('#inspector').innerHTML = `<div class="selected-asset-heading"><span class="asset-symbol" style="--asset-color:${escape(object.color??asset.color)}">${icon('box')}</span><div><span class="eyebrow">${escape(asset.category)}</span><h2>${escape(object.name)}</h2></div></div><label class="text-field">Object name<input id="object-name" value="${escape(object.name)}" maxlength="80" /></label><div class="property-section"><div class="property-label">Position <span>m</span></div><div class="field-grid two">${field('Position X','X',object.position[0],snap?'0.25':'0.05')}${field('Position Z','Z',object.position[2],snap?'0.25':'0.05')}</div><p class="field-note">${icon('lock')} Grounded on the floor</p></div><div class="property-section"><div class="property-label">Rotation <span>degrees</span></div>${field('Rotation','Y',(object.rotation*180/Math.PI)%360,'15')}</div><div class="property-section"><div class="property-label">Dimensions <span>m</span></div><div class="field-grid">${field('Width','W',dimension[0]!,'0.05','0.05')}${field('Height','H',dimension[1]!,'0.05','0.05')}${field('Depth','D',dimension[2]!,'0.05','0.05')}</div></div><div class="property-section"><div class="property-label">Finish <span>base material</span></div><div class="finish-row"><input id="object-color" type="color" aria-label="Object finish color" value="${escape(object.color??asset.color)}"/><span>${escape(object.color??asset.color)}</span><button id="reset-finish" class="text-button">Reset</button></div></div><div class="object-actions"><button id="duplicate" class="button">${icon('duplicate')} Duplicate</button><button id="delete" class="button danger" title="Delete object" aria-label="Delete object">${icon('trash')}</button></div><div class="asset-reference"><span>Catalog reference</span><code>${escape(asset.id)}</code><span>Approx. catalog price <strong>$${asset.price.toLocaleString()}</strong></span></div>`;
  $('#object-name').onchange = event => updateSelected({name:(event.target as HTMLInputElement).value},'Rename object');
  $('#inspector').querySelectorAll<HTMLInputElement>('[data-field]').forEach(input=>input.onchange=()=>{
    const value=input.valueAsNumber;
    if(!Number.isFinite(value)){ notify('Enter a finite number.',true); renderInspector();return; }
    const name=input.dataset.field;
    const current=store.scene.objects.find(o=>o.id===selectedId); if(!current)return;
    if(name==='Rotation')updateSelected({rotation:value*Math.PI/180},'Rotate object');
    else if(name?.startsWith('Position')) { const position=[...current.position] as [number,number,number]; position[name==='Position X'?0:2]=snap?Math.round(value/0.25)*0.25:value;updateSelected({position},'Move object'); }
    else {const index={Width:0,Height:1,Depth:2}[name!]!;const scale=[...current.scale] as [number,number,number];scale[index]=value/asset.dimensions[index]!;updateSelected({scale},'Resize object');}
  });
  $('#object-color').onchange=event=>updateSelected({color:(event.target as HTMLInputElement).value},'Change finish');
  $('#reset-finish').onclick=()=>updateSelected({color:asset.color},'Reset finish');
  $('#duplicate').onclick=duplicateSelected;
  $('#delete').onclick=deleteSelected;
}

function updateSelected(patch:ObjectPatch,label:string) {if(selectedId){run([{type:'update',id:selectedId,patch}],label);renderInspector();}}
function deleteSelected(){if(selectedId && !interacting){const id=selectedId; if(run([{type:'delete',id}],'Delete object'))select(null);}}
function addAsset(asset:CatalogAsset, original?:SceneObject) {
  if(interacting)return;
  if(store.scene.objects.length>=400){notify('This editor supports up to 400 furnishings.',true);return;}
  const object:SceneObject=original? structuredClone(original):{id:'',name:asset.name,assetId:asset.id,position:[0,0,0],rotation:0,scale:[1,1,1]};
  object.id=uid();if(original)object.name=`${original.name} copy`;
  const preferred=original ? [original.position[0]+0.5,original.position[2]+0.5]:[0,0];
  const points:[number,number][]=[[preferred[0]!,preferred[1]!]];
  for(let radius=0.5;radius<=6;radius+=0.5) for(let angle=0;angle<8;angle++)points.push([Math.round((preferred[0]!+Math.cos(angle*Math.PI/4)*radius)*4)/4,Math.round((preferred[1]!+Math.sin(angle*Math.PI/4)*radius)*4)/4]);
  // Prefer a visibly free footprint before the expensive authoritative geometry check.
  const radius=Math.hypot(asset.dimensions[0]*object.scale[0],asset.dimensions[2]*object.scale[2])/2;
  const free=points.filter(([x,z])=>asset.kind==='rug'||store.scene.objects.every(other=>{const a=catalog.find(a=>a.id===other.assetId)!;return a.kind==='rug'||Math.hypot(x-other.position[0],z-other.position[2])>radius+Math.hypot(a.dimensions[0]*other.scale[0],a.dimensions[2]*other.scale[2])/2+0.05;}));
  let lastErrors:string[]=[];
  const start=performance.now();
  for(const [x,z]of [...free,...points]){
    object.position=[x,0,z];
    const candidate={...store.scene,objects:[...store.scene.objects,object]};
    const validation=validateScene(candidate,catalog);
    if(validation.ok){if(run([{type:'add',object:structuredClone(object)}],original?'Duplicate object':`Add ${asset.name}`)){select(object.id);setTool('move');notify(`${object.name} added. Drag the arrows to place it.${validation.warnings.length?' '+validation.warnings[0]:''}`);}return;}
    lastErrors=validation.errors;
    if(performance.now()-start>150)break;
  }
  notify(`No nearby supported floor position found. ${lastErrors[0]??''}`,true);
}
function duplicateSelected(){const o=store.scene.objects.find(o=>o.id===selectedId);const a=catalog.find(a=>a.id===o?.assetId);if(o&&a)addAsset(a,o);}

function renderAssets(){
  const search=$<HTMLInputElement>('#asset-search').value.toLowerCase();
  $('#asset-count').textContent=String(catalog.length);
  $('#asset-categories').innerHTML=['All',...new Set(catalog.map(a=>a.category))].map(c=>`<button class="${assetCategory===c?'active':''}" data-category="${escape(c)}">${escape(c)}</button>`).join('');
  $('#asset-categories').querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.onclick=()=>{assetCategory=b.dataset.category!;renderAssets();});
  const items=catalog.filter(a=>(assetCategory==='All'||a.category===assetCategory)&&`${a.name} ${a.category}`.toLowerCase().includes(search));
  $('#asset-list').innerHTML=items.length?items.map(a=>`<button class="asset-card" data-asset="${escape(a.id)}" aria-label="Add ${escape(a.name)}"><div class="asset-card-top"><span class="asset-symbol" style="--asset-color:${escape(a.color)}">${icon('box')}</span><span class="asset-add">+</span></div><strong>${escape(a.name)}</strong><span>${a.dimensions[0]} × ${a.dimensions[2]} m</span><span class="asset-price">$${a.price.toLocaleString()}</span></button>`).join(''):'<p class="empty-message">No matching furniture. Try another search.</p>';
  $('#asset-list').querySelectorAll<HTMLButtonElement>('[data-asset]').forEach(b=>b.onclick=()=>{const asset=catalog.find(a=>a.id===b.dataset.asset);if(asset)addAsset(asset);});
}
function switchPanel(panel:'scene'|'assets'){for(const name of ['scene','assets']){$(`#${name}-panel`).hidden=panel!==name;$(`#${name}-tab`).classList.toggle('active',panel===name);$(`#${name}-tab`).setAttribute('aria-selected',String(panel===name));}if(panel==='assets')renderAssets();}
function setTool(next:ToolMode){tool=next;viewport.setTool(tool);document.querySelectorAll<HTMLElement>('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));});}
function setView(next:ViewMode){view=next;viewport.setView(view);$('#perspective').classList.toggle('active',view==='perspective');$('#top-view').classList.toggle('active',view==='top');$('#view-hint').innerHTML=view==='top'?'Right drag to pan <b>·</b> Scroll to zoom <b>·</b> F to frame':'Drag to orbit <b>·</b> Right drag to pan <b>·</b> Scroll to zoom';}

function renderProposal(){
  const el=$('#proposal');if(!pending){el.innerHTML='';return;}
  const stale=pending.command.baseRevision!==store.revision;
  el.innerHTML=`<div class="proposal"><span class="eyebrow">${pending.command.source==='architect'?'ARCHITECT IMPORT':'PROPOSED CHANGE'}</span><strong>${escape(pending.title)}</strong><p>${escape(pending.description)}</p>${stale?'<p class="proposal-warning">The scene has changed. Request a fresh proposal.</p>':interacting?'<p class="proposal-warning">Finish your current edit before applying.</p>':''}<div><button id="apply-proposal" class="button primary" ${stale||interacting?'disabled':''}>Apply change</button><button id="reject-proposal" class="button quiet">Dismiss</button></div></div>`;
  $('#apply-proposal').onclick=()=>{if(!pending||interacting)return;const proposal=pending;const result=store.execute(proposal.command,true);if(result.ok){pending=null;renderProposal();notify(`${proposal.title} applied`);}else notify(result.errors.join(' '),true);};
  $('#reject-proposal').onclick=()=>{pending=null;renderProposal();notify('Proposal dismissed');};
}
async function requestProposal(kind:'designer'|'architect'){
  if(busy)return;busy=true;$<HTMLButtonElement>('#suggest').disabled=true;$('#suggest').innerHTML=`${icon('sparkles')} Considering your space…`;
  const revision=store.revision;const scene=store.scene;
  try{
    if(kind==='designer')pending=await designerAdapter.propose(scene,revision);
    else{const result=await structureAdapter.reconstruct();pending={id:uid(),title:'Import reconstructed structure',description:result.notes.join(' '),command:{id:uid(),label:'Import structure',source:'architect',baseRevision:revision,operations:[{type:'replace-structure',rooms:result.rooms,walls:result.walls}]}};}
    renderProposal();notify('Proposal ready. Review it in the properties panel.');
  }catch(error){notify(error instanceof Error?error.message:String(error),true);}
  finally{busy=false;$<HTMLButtonElement>('#suggest').disabled=false;$('#suggest').innerHTML=`${icon('sparkles')} Suggest an edit ${icon('arrow')}`;}
}

function refresh(){
  const scene=store.scene;
  if(selectedId&&!scene.objects.some(o=>o.id===selectedId))selectedId=null;
  viewport.setScene(scene,catalog);viewport.setSelection(selectedId);
  $('#project-name').textContent=scene.name;
  $('#revision').textContent=`Revision ${store.revision}`;
  $<HTMLButtonElement>('#undo').disabled=!store.canUndo;$<HTMLButtonElement>('#redo').disabled=!store.canRedo;
  $('#save-state').textContent=store.revision===savedRevision?'Saved on this device':store.revision===0?'Demo scene':'Unsaved changes';
  renderHierarchy();renderInspector();renderProposal();
  const object=scene.objects.find(o=>o.id===selectedId);$('#selection-status').textContent=object?`${object.name} selected`:'Nothing selected';
}
store.subscribe(refresh);

const modal=$<HTMLDialogElement>('#modal');
function showModal(title:string,body:string){$('#modal-content').innerHTML=`<div class="modal-heading"><h2>${title}</h2><button id="close-modal" class="icon-button" aria-label="Close dialog">${icon('close')}</button></div>${body}`;$('#close-modal').onclick=()=>modal.close();modal.showModal();}
modal.onclick=e=>{if(e.target===modal)modal.close();};
$('#integrations').onclick=()=>{
  showModal('Built to work together',`<p class="modal-intro">Three explicit connections, one shared scene. These adapters run locally with demo data.</p><div class="integration-row"><span>${icon('walls')}</span><div><h3>Architect <span class="mock-label">SNEK</span></h3><p>Import room polygons, wall segments, doors, and windows. Review before applying.</p><button id="mock-structure" class="button">Preview structural import</button></div></div><div class="integration-row"><span>${icon('sparkles')}</span><div><h3>Designer <span class="mock-label">FOKIE</span></h3><p>Propose validated edits against a scene revision. You approve each batch.</p><button id="mock-designer" class="button">Request design proposal</button></div></div><div class="integration-row"><span>${icon('box')}</span><div><h3>Catalog <span class="mock-label">SERG</span></h3><p>Stable asset IDs, metre dimensions, material defaults, and procedural or GLB sources.</p><button id="mock-catalog" class="button">Refresh demo catalog</button></div></div><p class="modal-footnote">No network services or credentials are needed. A proposal becomes stale if the scene changes before approval.</p>`);
  $('#mock-structure').onclick=()=>{modal.close();void requestProposal('architect');};$('#mock-designer').onclick=()=>{modal.close();void requestProposal('designer');};
  $('#mock-catalog').onclick=async()=>{modal.close();try{catalog=await catalogAdapter.list();renderAssets();viewport.setScene(store.scene,catalog);switchPanel('assets');notify('Demo catalog refreshed');}catch(error){notify(String(error),true);}};
};
$('#file-menu').onclick=()=>{
  showModal('Your scene, your workspace',`<p class="modal-intro">Save locally or carry your scene as a versioned JSON file. Loading can be undone.</p><div class="file-actions"><button id="open-local" class="button">${icon('folder')} Load saved scene</button><button id="import-json" class="button">${icon('upload')} Import JSON file</button><button id="export-json" class="button">${icon('download')} Export JSON file</button><button id="reset-demo" class="button">${icon('home')} Restore furnished demo</button></div><p class="modal-footnote">Local saves stay in this browser on this device. JSON references catalog assets by ID; it does not embed model files.</p>`);
  $('#open-local').onclick=()=>{try{const scene=loadLocal(catalog);if(!scene){notify('No saved scene yet. Use Save scene first.',true);return;}if(run([{type:'replace-scene',scene}],'Load saved scene')){savedRevision=store.revision;select(null);viewport.focus();refresh();modal.close();}}catch(error){notify(String(error),true);}};
  $('#import-json').onclick=()=>{modal.close();$<HTMLInputElement>('#file-input').click();};
  $('#export-json').onclick=()=>{const blob=new Blob([serializeScene(store.scene)],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='varpet-apartment.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Scene exported');modal.close();};
  $('#reset-demo').onclick=()=>{if(run([{type:'replace-scene',scene:demoScene}],'Restore furnished demo')){select(null);viewport.focus();modal.close();}};
};
$('#file-input').onchange=async event=>{const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;const baseRevision=store.revision;try{if(file.size>4_000_000)throw new Error('Scene file exceeds the 4 MB limit.');const scene=parseScene(await file.text(),catalog);if(run([{type:'replace-scene',scene}],'Import scene',baseRevision)){select(null);viewport.focus();}}catch(error){notify(error instanceof Error?error.message:String(error),true);}finally{input.value='';}};
$('#save').onclick=()=>{try{saveLocal(store.scene);savedRevision=store.revision;refresh();notify('Scene saved on this device');}catch(error){notify(`Could not save: ${String(error)}`,true);}};
$('#undo').onclick=()=>{if(!interacting){const r=store.undo();notify(r.ok?'Undo complete':r.errors.join(' '),!r.ok);}};$('#redo').onclick=()=>{if(!interacting){const r=store.redo();notify(r.ok?'Redo complete':r.errors.join(' '),!r.ok);}};
$('#scene-tab').onclick=()=>switchPanel('scene');$('#assets-tab').onclick=()=>switchPanel('assets');$('#asset-search').oninput=renderAssets;
$('#perspective').onclick=()=>setView('perspective');$('#top-view').onclick=()=>setView('top');
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool as ToolMode));
$('#focus').onclick=()=>viewport.focus(selectedId??undefined);
$('#snap').onclick=()=>{snap=!snap;viewport.setSnap(snap);$('#snap').classList.toggle('active',snap);$('#snap').setAttribute('aria-pressed',String(snap));$('#snap').innerHTML=`${icon('grid')} Snap <strong>${snap?'0.25 m':'Off'}</strong>`;renderInspector();};
$('#walls').onclick=()=>{wallMode=wallMode==='cutaway'?'full':wallMode==='full'?'hidden':'cutaway';viewport.setWalls(wallMode);$('#walls span').textContent={cutaway:'Cutaway',full:'Full walls',hidden:'Walls hidden'}[wallMode];};
let highQuality=false;$('#quality').onclick=()=>{highQuality=!highQuality;viewport.setQuality(highQuality?'high':'balanced');$('#quality span').textContent=highQuality?'High quality':'Balanced';};
$('#suggest').onclick=()=>void requestProposal('designer');
$('#help').onclick=()=>showModal('Make yourself at home',`<p class="modal-intro">Click a piece of furniture to select it. Use the colored handles for precise changes, or enter values in Properties.</p><div class="shortcut-list">${[['V','Select'],['G','Move along the floor'],['R','Rotate around the vertical axis'],['S','Resize'],['F','Frame selected object / apartment'],['⌘ / Ctrl + D','Duplicate'],['Delete / Backspace','Delete selected furniture'],['⌘ / Ctrl + Z','Undo'],['⌘ / Ctrl + Shift + Z','Redo'],['Esc','Cancel current drag / clear selection']].map(([key,label])=>`<div><span>${label}</span><kbd>${key}</kbd></div>`).join('')}</div><p class="modal-footnote">Perspective: drag empty space to orbit, right drag to pan, scroll to zoom. Top view uses the same 3D scene with an orthographic camera. Imported structure is read-only.</p>`);
window.addEventListener('keydown',event=>{
  if(modal.open || (event.target instanceof HTMLElement && (event.target.closest('input,textarea,select') || event.target.isContentEditable)))return;
  const key=event.key.toLowerCase();const mod=event.metaKey||event.ctrlKey;
  if(key==='escape'){viewport.cancelInteraction();interacting=false;select(null);renderProposal();return;}
  if(interacting)return;
  if(mod&&key==='z'){event.preventDefault();(event.shiftKey?$('#redo'):$('#undo')).click();}
  else if(mod&&key==='y'){event.preventDefault();$('#redo').click();}
  else if(mod&&key==='d'){event.preventDefault();duplicateSelected();}
  else if(mod&&key==='s'){event.preventDefault();$('#save').click();}
  else if(!mod){if(['delete','backspace'].includes(key)){event.preventDefault();deleteSelected();}else if(key==='f')viewport.focus(selectedId??undefined);else if(key==='v')setTool('select');else if(key==='g')setTool('move');else if(key==='r')setTool('rotate');else if(key==='s')setTool('scale');}
});
window.addEventListener('beforeunload',()=>viewport.dispose());
refresh();renderAssets();setTool('select');
