import { roomCeilingHeight, DEFAULT_CEILING_HEIGHT } from '../core/heights';
import './renovation.css';
import type { BuildingComponent, CatalogAsset, ComponentKind, EntityMetadata, EvidenceSource, FinishMaterial, Opening, Operation, ProjectTask, PropertyAssumption, RenovationPhase, RenovationProject, Room, SceneDocument, ServiceRoute, ServiceSystem, Vec2, Vec3, Wall } from '../contracts';
import { analyzeProject } from '../core/renovation';

export interface RenovationUIOptions {
  getScene(): SceneDocument;
  getCatalog(): CatalogAsset[];
  execute(label: string, operations: Operation[]): boolean;
  select(id: string | null, additive?: boolean): void;
  focus(id: string): void;
  notice(message: string, error?: boolean): void;
  testDoor?(id: string, angle: number): void;
  getDoorAngle?(id: string): number;
  toggleSwitch?(id: string): void;
  setSwitchLevel?(id: string, level: number): void;
  getSwitchLevel?(id: string): number;
  onSources?(): void;
  onReconstruct?(): void;
  onExport?(kind: 'project' | 'schedule' | 'report'): void;
  onLayer?(name: string, enabled: boolean): void;
  onComparison?(enabled: boolean): void;
}
export interface RenovationUI { render(): void; setSelection(id: string | null, ids?: string[]): void; destroy(): void }
type Tab = 'shell' | 'evidence' | 'assumptions' | 'systems' | 'options' | 'review';
type Pair = readonly [string, string];
const TABS: Pair[] = [['shell','Shell'],['evidence','Evidence'],['assumptions','Assumptions'],['systems','Systems'],['options','Options'],['review','Review']];
const PHASES: Pair[] = [['existing','Existing'],['retain','Retain'],['remove','Remove'],['new','New'],['replace','Replace']];
const COMPONENTS: Pair[] = [['column','Column'],['beam','Beam'],['shaft','Service shaft'],['railing','Balcony railing'],['step','Step / threshold'],['ceiling','Ceiling / bulkhead'],['light','Light fixture'],['switch','Switch / dimmer'],['outlet','Power outlet'],['panel','Electrical panel'],['junction','Junction box'],['sink','Sink'],['toilet','Toilet'],['shower','Shower'],['bath','Bath'],['drain','Floor drain'],['valve','Shutoff valve'],['riser','Pipe riser'],['radiator','Radiator'],['ac','Air conditioning'],['vent','Vent / extractor'],['thermostat','Thermostat'],['cabinet','Cabinet / wardrobe'],['worktop','Worktop'],['appliance','Appliance'],['smoke-detector','Smoke detector'],['security','Security / intercom'],['network','Data / network'],['gas-point','Gas connection'],['access-panel','Access panel']];
const SYSTEMS: Pair[] = [['electrical','Electrical'],['water-hot','Hot water'],['water-cold','Cold water'],['waste','Waste / drainage'],['ventilation','Ventilation'],['heating','Heating'],['gas','Gas'],['data','Data / network']];
const STATUSES: Pair[] = [['unresolved','Unresolved'],['accepted','Accepted for visualization'],['measured','Measured'],['verified','Verified with evidence'],['stale','Needs recheck']];
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const uid = () => crypto.randomUUID();
const num = (value: number, precision = 3) => Number(value.toFixed(precision));
const pretty = (value: string) => value.replace(/-/g,' ').replace(/^./,c=>c.toUpperCase());
const options = (values: readonly Pair[], value: string) => values.map(([v,label])=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(label)}</option>`).join('');
const field = (name: string, label: string, value: unknown, type = 'text', attrs = '', full = false) => `<label class="rv-field ${full?'full':''}"><span>${esc(label)}</span><input name="${esc(name)}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const number = (name: string,label: string,value: number,min?: number,max?: number) => field(name,label,value,'number',`step="any" required ${min!==undefined?`min="${min}"`:''} ${max!==undefined?`max="${max}"`:''}`);
const select = (name: string,label: string,value: string,values: readonly Pair[],full = false) => `<label class="rv-field ${full?'full':''}"><span>${esc(label)}</span><select name="${esc(name)}">${options(values,value)}</select></label>`;
const textarea = (name: string,label: string,value: string,placeholder = '') => `<label class="rv-field full"><span>${esc(label)}</span><textarea name="${esc(name)}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
const checkbox = (name: string,label: string,checked = false) => `<label class="rv-inline rv-help"><input type="checkbox" name="${esc(name)}" ${checked?'checked':''}>${esc(label)}</label>`;
const action = (name: string,label: string,id?: string,cls = '') => `<button type="button" class="button ${cls}" data-action="${name}" ${id?`data-id="${esc(id)}"`:''}>${esc(label)}</button>`;
const submit = (label: string) => `<div class="rv-actions"><button class="button primary" type="submit">${esc(label)}</button></div>`;
const badge = (value: string) => `<span class="rv-badge ${esc(value)}">${esc(pretty(value))}</span>`;
const form = (type: string,body: string,id = '') => `<form data-form="${type}" data-id="${esc(id)}">${body}<p class="rv-validation" role="alert" hidden></p></form>`;
const emptyProject = (): RenovationProject => ({mode:'correct',currency:'USD',metadata:{},components:[],routes:[],sources:[],assumptions:[],materials:[],finishes:[],tasks:[],options:[]});
function text(fd: FormData,key: string) { return String(fd.get(key) ?? '').trim(); }
function numeric(fd: FormData,key: string) { const raw=text(fd,key); const value=Number(raw); if (!raw || !Number.isFinite(value)) throw new Error(`${pretty(key)} must be a finite number.`); return value; }
function required(fd: FormData,key: string) { const value=text(fd,key); if(!value) throw new Error(`${pretty(key)} is required.`); return value; }
function points(fd: FormData,key: string,count: 2 | 3,minimum: number): number[][] {
  const result = text(fd,key).split(/\n|;/).map(s=>s.trim()).filter(Boolean).map(line=> {
    const values=line.split(/[,\s]+/).filter(Boolean).map(Number);
    if(values.length!==count || values.some(v=>!Number.isFinite(v))) throw new Error(`Use ${count===2?'X, Z':'X, Y, Z'} in metres, one point per line.`);
    return values;
  });
  if(result.length<minimum) throw new Error(`Enter at least ${minimum} points.`);
  return result;
}
function safeSourceUrl(source: EvidenceSource) {
  const url = source.dataUrl || source.url;
  return url && (/^data:(image\/(png|jpeg|webp|gif)|application\/pdf);base64,/i.test(url) || /^https?:\/\//i.test(url)) ? url : undefined;
}

export function createRenovationUI(container: HTMLElement, config: RenovationUIOptions): RenovationUI {
  let tab: Tab = 'shell';
  let selectedId: string | null = null;
  let selectedIds: string[] = [];
  let treeSearch = '';
  let assumptionFilter = 'all';
  let assumptionEditor: string | null = null;
  let componentEditor: string | null = null;
  let routeEditor: string | null = null;
  let materialEditor: string | null = null;
  let taskEditor: string | null = null;
  let sourceEditor: string | null = null;
  let comparison = false;
  const layers = new Map<string,boolean>();
  const openDisclosures = new Map<string,boolean>();
  const switchLevels = new Map<string,number>();
  const p = () => config.getScene().project ?? emptyProject();
  const meta = (id: string) => p().metadata[id] ?? {};
  const name = (id: string) => entities().find(e=>e.id===id)?.name ?? evidenceEntityOptions().find(([entityId])=>entityId===id)?.[1] ?? id;
  function entities() {
    const scene=config.getScene(), project=p();
    return [...scene.rooms.map(r=>({id:r.id,name:r.name,kind:'room'})),...scene.walls.flatMap((w,i)=>[{id:w.id,name:project.metadata[w.id]?.name || `Wall ${i+1}`,kind:'wall'},...w.openings.map((o,j)=>({id:o.id,name:project.metadata[o.id]?.name || `${pretty(o.kind)} ${i+1}.${j+1}`,kind:o.kind}))]),...project.components.map(c=>({id:c.id,name:c.name,kind:c.kind})),...project.routes.map(r=>({id:r.id,name:r.name,kind:'route'})),...scene.objects.map(o=>({id:o.id,name:o.name,kind:'furniture'}))];
  }
  function entityOptions(includeNone=false): Pair[] { return [...(includeNone?[['','None'] as Pair]:[]),...entities().map(e=>[e.id,`${e.name} · ${pretty(e.kind)}`] as Pair)]; }
  function evidenceEntityOptions(): Pair[] {
    const result=entityOptions(), known=new Set(result.map(([id])=>id));
    const project=p();
    const snapshots=[...(project.baseline?[project.baseline]:[]),...project.options.map(option=>option.snapshot)];
    for(const snapshot of snapshots) for(const entity of [...snapshot.rooms,...snapshot.walls,...snapshot.walls.flatMap(wall=>wall.openings),...snapshot.objects,...snapshot.components,...snapshot.routes]) {
      if(known.has(entity.id)) continue;
      known.add(entity.id);
      const title=snapshot.metadata[entity.id]?.name || ('name' in entity?entity.name:entity.id);
      result.push([entity.id,`${title} · saved option / baseline`]);
    }
    return result;
  }
  function finishEntities(): Pair[] {
    const scene=config.getScene();
    return [...scene.rooms.map(r=>[r.id,r.name] as Pair),...scene.walls.map(w=>[w.id,name(w.id)] as Pair),...p().components.map(c=>[c.id,c.name] as Pair)];
  }
  function finishSurfaces(id: string): Pair[] {
    if(config.getScene().rooms.some(room=>room.id===id)) return [['floor','Floor'],['ceiling','Ceiling'],['skirting','Skirting / perimeter']];
    if(config.getScene().walls.some(wall=>wall.id===id)) return [['wall-front','Wall side A'],['wall-back','Wall side B'],['skirting','Skirting / perimeter']];
    return [['component','Component']];
  }
  function finishMaterials(surface: string): Pair[] {
    const unit=surface==='skirting'?'m':surface==='component'?'each':'m2';
    const matches=p().materials.filter(material=>material.unit===unit).map(material=>[material.id,material.name] as Pair);
    return matches.length?matches:[['',`Add a material priced per ${unit==='m2'?'m²':unit} first`]];
  }
  function run(label: string,ops: Operation[]) {
    const operations=config.getScene().project?ops:[{type:'migrate-project'} as Operation,...ops];
    const success=config.execute(label,operations);
    if(success) render();
    return success;
  }
  function choose(id: string, focus = false, additive = false) {
    selectedId=id;
    const project=p();
    if(project.components.some(c=>c.id===id)) { tab='systems'; componentEditor=id; routeEditor=null; }
    else if(project.routes.some(r=>r.id===id)) { tab='systems'; routeEditor=id; componentEditor=null; }
    else tab='shell';
    config.select(id, additive);
    if(focus) config.focus(id);
    render();
  }
  function row(id: string,title: string,kind: string) { return `<button type="button" class="rv-entity-row" data-action="select" data-id="${esc(id)}" aria-pressed="${selectedIds.includes(id) || selectedId===id}"><span class="rv-kind">${esc(kind.slice(0,4))}</span><span>${esc(title)}</span>${p().assumptions.some(a=>a.entityId===id && ['unresolved','stale'].includes(a.status))?'<span class="rv-badge unknown" title="Unresolved assumptions">?</span>':''}</button>`; }
  function commonMetadata(id: string, extra = '') {
    const m=meta(id), component=p().components.some(c=>c.id===id), room=config.getScene().rooms.some(r=>r.id===id);
    return `<details class="rv-disclosure"><summary>Renovation &amp; evidence</summary>${form('metadata',`<div class="rv-fields">${component||room?'':field('name','Label',m.name ?? name(id))}${component?'':select('phase','Renovation action',m.phase ?? 'existing',PHASES)}${select('review','Alteration review',m.review ?? 'unreviewed',[['unreviewed','Unreviewed'],['required','Review required'],['reviewed','Review recorded']])}${field('material','Existing material',m.material ?? '')}${extra}${textarea('notes','Notes / review reference',m.notes ?? '')}</div>${checkbox('locked','Lock model editing',m.locked)}${submit('Save classification')}`,id)}<div class="rv-actions">${action('assumption-new','Add property assumption',id)}${action('focus','Focus in 3D',id)}</div></details>`;
  }
  function selectedAssumptions(id: string) {
    const list=p().assumptions.filter(a=>a.entityId===id);
    return list.length ? `<div class="rv-section"><h3>Property evidence</h3>${list.map(a=>`<button type="button" class="rv-issue" data-action="assumption-edit" data-id="${esc(a.id)}">${badge(a.status)}<strong>${esc(a.property)}: ${esc(a.value || 'Unknown')}</strong><p>${esc(a.question || a.rationale || 'Review the evidence for this property.')}</p></button>`).join('')}</div>` : '';
  }
  function wallInspector(wall: Wall) {
    const length=Math.hypot(wall.end[0]-wall.start[0],wall.end[1]-wall.start[1]);
    return `<div class="rv-card"><div class="rv-card-head"><strong>${esc(name(wall.id))}</strong><span class="rv-meter">${num(length)} m</span></div>${form('wall',`<div class="rv-fields">${number('start-x','Start X (m)',wall.start[0])}${number('start-z','Start Z (m)',wall.start[1])}${number('end-x','End X (m)',wall.end[0])}${number('end-z','End Z (m)',wall.end[1])}${number('height','Height (m)',wall.height,0.01)}${number('thickness','Thickness (m)',wall.thickness,0.01)}${field('color','Display colour',wall.color,'color')}</div><p class="rv-help">Shared corners and hosted openings stay connected. Conflicting changes are rejected atomically.</p>${submit('Apply wall dimensions')}`,wall.id)}${commonMetadata(wall.id,`${select('structuralRole','Structural role',meta(wall.id).structuralRole ?? 'unknown',[['unknown','Unknown'],['structural','Structural'],['partition','Non-load-bearing partition']])}${select('boundary','Boundary',meta(wall.id).boundary ?? 'interior',[['interior','Interior'],['exterior','Exterior'],['shared','Shared / neighbour']])}`)}<details class="rv-disclosure"><summary>Split or join wall</summary>${form('split-wall',`<div class="rv-fields">${number('offset','Split from start (m)',length/2,0.01,length-0.01)}</div>${submit('Split wall')}`,wall.id)}${form('join-walls',`<div class="rv-fields">${select('otherId','Join to collinear wall','',config.getScene().walls.filter(w=>w.id!==wall.id).map(w=>[w.id,name(w.id)]),true)}</div>${submit('Join walls')}`,wall.id)}</details><div class="rv-section"><h3>Doors &amp; windows</h3>${wall.openings.map(o=>row(o.id,name(o.id),o.kind)).join('') || '<p class="rv-help">No openings on this wall.</p>'}<details class="rv-disclosure"><summary>Add opening</summary>${openingForm(undefined,wall)}</details></div><div class="rv-actions">${action('delete-wall','Delete wall',wall.id,'rv-danger')}</div>${selectedAssumptions(wall.id)}</div>`;
  }
  function openingForm(opening: Opening | undefined,wall: Wall) {
    const m=opening?meta(opening.id):{};
    const o=opening ?? {id:'',kind:'door',offset:0.2,width:0.9,height:2.1,sill:0};
    return form('opening',`<input name="wallId" type="hidden" value="${esc(wall.id)}"><div class="rv-fields">${select('kind','Opening type',o.kind,[['door','Door'],['window','Window']])}${select('role','Connection',m.role ?? 'interior',[['entrance','Apartment entrance'],['interior','Internal'],['balcony','Balcony access'],['access','Service access']])}${number('offset','Offset from wall start (m)',o.offset,0)}${number('width','Opening width (m)',o.width,0.01)}${number('height','Opening height (m)',o.height,0.01)}${number('sill',o.kind==='door'?'Opening base · doors at 0 (m)':'Window sill above floor (m)',o.sill,0,o.kind==='door'?0:wall.height)}${select('mechanism','Mechanism',m.mechanism ?? '',[['','Unspecified / provisional'],['hinged','Hinged'],['double','Double leaves'],['sliding','Sliding'],['pocket','Pocket'],['fixed','Fixed glazing'],['casement','Casement'],['tilt','Tilt']])}${select('hinge','Hinge side',m.hinge ?? '',[['','Unspecified / provisional'],['left','Left at wall start'],['right','Right at wall end']])}${select('swing','Swing direction',m.swing===undefined?'':String(m.swing),[['','Unspecified / provisional'],['1','Wall side A'],['-1','Wall side B']])}${number('frameWidth','Frame width (m)',m.frameWidth ?? 0.05,0)}${number('leafThickness','Leaf thickness (m)',m.leafThickness ?? 0.04,0.001)}${number('threshold','Threshold height (m)',m.threshold ?? 0,0)}</div><p class="rv-help">Dimensions describe the wall opening. Frame, leaves and threshold reduce usable passage. Unspecified mechanisms use provisional preview geometry; record uncertain dimensions as assumptions.</p>${submit(opening?'Apply opening changes':'Add opening')}`,opening?.id);
  }
  function openingInspector(opening: Opening,wall: Wall) {
    const angle=config.getDoorAngle?.(opening.id) ?? 0;
    return `<div class="rv-card"><div class="rv-card-head"><strong>${esc(name(opening.id))}</strong>${badge(meta(opening.id).role ?? opening.kind)}</div><p class="rv-help">Hosted by ${esc(name(wall.id))}</p>${openingForm(opening,wall)}${config.testDoor && (meta(opening.id).mechanism ?? (opening.kind==='window'?'fixed':'hinged'))!=='fixed'?`<div class="rv-card rv-test"><div class="rv-card-head"><strong>Test opening</strong><output id="rv-angle-output">${Math.round(angle*180/Math.PI)}°</output></div><label class="rv-field"><span>Opening angle / travel</span><input id="rv-door-angle" data-id="${esc(opening.id)}" type="range" min="0" max="90" step="1" value="${Math.round(angle*180/Math.PI)}"></label><div class="rv-actions">${action('door-close','Close',opening.id)}${action('door-open','Open',opening.id)}</div><p class="rv-help">Preview only. The saved apartment stays unchanged.</p></div>`:''}${commonMetadata(opening.id)}<div class="rv-actions">${action('delete-opening','Delete opening',opening.id,'rv-danger')}${action('select','Select host wall',wall.id)}</div>${selectedAssumptions(opening.id)}</div>`;
  }
  function roomForm(room?: Room) {
    const r=room ?? {id:'',name:'New room',polygon:[[0,0],[4,0],[4,3],[0,3]] as Vec2[],color:'#b7a38d'};
    const m=room?meta(room.id):{};
    return form('room',`<div class="rv-fields">${field('name','Room name',r.name,'text','required')}${select('zone','Space type',m.zone ?? 'interior',[['interior','Interior room'],['balcony','Balcony'],['loggia','Loggia'],['terrace','Terrace']])}${number('elevation','Floor elevation (m)',m.elevation ?? 0)}${number('ceilingHeight','Ceiling height (m)',room ? roomCeilingHeight(config.getScene(), room) : DEFAULT_CEILING_HEIGHT,0.01)}${field('color','Floor display colour',r.color,'color')}${textarea('polygon','Boundary points · X, Z (m)',r.polygon.map(v=>v.join(', ')).join('\n'),'0, 0\n4, 0\n4, 3\n0, 3')}</div>${submit(room?'Apply room geometry':'Add room')}`,room?.id);
  }
  function shellView() {
    const scene=config.getScene();
    const shell=entities().filter(e=>['room','wall','door','window'].includes(e.kind));
    const filtered=shell.filter(e=>`${e.name} ${e.kind}`.toLowerCase().includes(treeSearch.toLowerCase()));
    const wall=scene.walls.find(w=>w.id===selectedId);
    const host=scene.walls.find(w=>w.openings.some(o=>o.id===selectedId));
    const opening=host?.openings.find(o=>o.id===selectedId);
    const room=scene.rooms.find(r=>r.id===selectedId);
    return `<h2>Build the apartment</h2><p class="rv-lede">Correct the empty shell, identify the entrance and record what still needs measuring.</p><div class="rv-toolbar">${config.onSources?action('sources','Add evidence'):''}${config.onReconstruct?action('reconstruct','Build from plan'):''}</div><label class="rv-field"><span>Find a wall, opening or room</span><input id="rv-tree-search" placeholder="Search shell…" value="${esc(treeSearch)}"></label><div class="rv-entity-list">${filtered.map(e=>row(e.id,e.name,e.kind)).join('') || '<p class="rv-empty">No matching shell elements.</p>'}</div><div class="rv-inline rv-help">${shell.length} elements · all dimensions in metres</div>${wall?wallInspector(wall):opening&&host?openingInspector(opening,host):room?`<div class="rv-card"><div class="rv-card-head"><strong>${esc(room.name)}</strong>${badge(meta(room.id).zone ?? 'interior')}</div>${roomForm(room)}${commonMetadata(room.id)}<div class="rv-actions">${action('delete-room','Delete room',room.id,'rv-danger')}</div>${selectedAssumptions(room.id)}</div>`:'<p class="rv-empty">Select an element here or in the 3D scene to edit its dimensions and evidence.</p>'}<details class="rv-disclosure"><summary>Add wall</summary>${form('wall-new',`<div class="rv-fields">${field('name','Wall label','New wall')}${select('structuralRole','Structural role','unknown',[['unknown','Unknown'],['structural','Structural'],['partition','Non-load-bearing partition']])}${number('start-x','Start X (m)',0)}${number('start-z','Start Z (m)',0)}${number('end-x','End X (m)',4)}${number('end-z','End Z (m)',0)}${number('height','Height (m)',2.8,0.01)}${number('thickness','Thickness (m)',0.15,0.01)}</div>${submit('Add wall')}`)}</details><details class="rv-disclosure"><summary>Add room / balcony</summary>${roomForm()}</details>${config.onLayer?`<details class="rv-disclosure"><summary>Model overlays</summary>${layerCheckbox('shell','Apartment shell',true)}${layerCheckbox('furniture','Furniture',true)}${layerCheckbox('ceilings','Full ceilings',false)}${layerCheckbox('dimensions','Show dimensions',false)}${layerCheckbox('assumptions','Highlight unresolved assumptions',false)}${layerCheckbox('clearances','Show use / maintenance envelopes',false)}</details>`:''}`;
  }
  function sourceForm(source: EvidenceSource) {
    const cal=source.calibration;
    const url=safeSourceUrl(source);
    return `<div class="rv-card">${form('source',`<div class="rv-fields">${field('name','Source name',source.name,'text','required')}${select('kind','Evidence type',source.kind,[['photo','Photo'],['plan','Plan / blueprint'],['measurement','Measurement'],['document','Document']])}${select('roomId','Associated room',source.roomId ?? '',[['','Whole apartment / unspecified'],...config.getScene().rooms.map(r=>[r.id,r.name] as Pair),...(source.roomId&&!config.getScene().rooms.some(r=>r.id===source.roomId)?[[source.roomId,name(source.roomId)] as Pair]:[])],true)}${field('url','External evidence URL',source.url ?? '','url','',true)}${textarea('notes','Evidence notes',source.notes ?? '')}</div>${cal?`<h3>Scale calibration</h3><div class="rv-fields">${number('metres','Known distance (m)',cal.metres,0.001)}${number('pixels','Image distance (px)',cal.pixels,0.001)}${number('origin-x','Origin X (px)',cal.origin[0])}${number('origin-z','Origin Y (px)',cal.origin[1])}${number('rotation','Orientation (degrees)',cal.rotation*180/Math.PI)}</div>`:''}${submit('Save evidence details')}`,source.id)}${url?`<a class="rv-source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open original evidence</a>${/^data:image\//.test(url)?`<img class="rv-preview-image" src="${esc(url)}" alt="${esc(source.name)}">`:''}`:'<p class="rv-help">No attached file or accessible URL. The source notes remain in the project.</p>'}<div class="rv-actions">${action('delete-source','Remove source',source.id,'rv-danger')}${action('source-close','Close details')}</div></div>`;
  }
  function evidenceView() {
    const sources=p().sources;
    const source=sources.find(s=>s.id===sourceEditor);
    return `<h2>Evidence &amp; measurements</h2><p class="rv-lede">Keep original photos, plans and measurements with the apartment. A source is evidence, not a verified conclusion.</p><div class="rv-toolbar">${config.onSources?action('sources','Import photos / plans'):''}${config.onReconstruct?action('reconstruct','Calibrate & build shell'):''}</div>${sources.map(s=>`<div class="rv-card"><div class="rv-card-head"><strong>${esc(s.name)}</strong>${badge(s.kind)}</div><p class="rv-file-details">${s.roomId?esc(name(s.roomId)):'Whole apartment'} · ${s.dataUrl?'File embedded':s.url?'External link':'Notes only'}${s.calibration?` · ${num(s.calibration.metres/s.calibration.pixels,5)} m / pixel`:''}</p>${s.notes?`<p class="rv-help">${esc(s.notes)}</p>`:''}<div class="rv-actions">${action('source-edit','Review evidence',s.id)}${action('assumption-new-source','Link an assumption',s.id)}</div></div>`).join('') || '<p class="rv-empty">Start with a blueprint, room photos or a known measurement. The model stays editable as evidence improves.</p>'}${source?sourceForm(source):''}<details class="rv-disclosure"><summary>Record a measurement / document reference</summary>${form('source-new',`<div class="rv-fields">${field('name','Measurement or document name','','text','required',true)}${select('kind','Evidence type','measurement',[['measurement','Measurement'],['document','Document'],['photo','Photo reference'],['plan','Plan reference']])}${select('roomId','Room','',[['','Whole apartment'],...config.getScene().rooms.map(r=>[r.id,r.name] as Pair)])}${field('url','Evidence URL (optional)','','url','',true)}${textarea('notes','Measured value, method, date and reference','','For example: living-room width, 4.25 m, laser measurement, 26 Sep.')}</div>${submit('Record source')}`)}</details>`;
  }
  function assumptionForm(existing?: PropertyAssumption) {
    const a=existing ?? {id:'',entityId:selectedId ?? entities()[0]?.id ?? '',property:'',value:'',status:'unresolved',sourceKind:'unknown',sourceIds:[],rationale:'',alternatives:[]} as PropertyAssumption;
    return `<div class="rv-card"><h3>${existing?'Review property':'Record an assumption'}</h3>${form('assumption',`<div class="rv-fields">${select('entityId','Element',a.entityId,evidenceEntityOptions(),true)}${field('property','Property',a.property,'text','required placeholder="sill height, structural role…"')}${field('value','Value represented',a.value,'text','placeholder="unknown or 0.90 m"')}${select('sourceKind','Knowledge',a.sourceKind,[['unknown','Unknown / temporary default'],['inferred','Inferred'],['measured','Measured'],['observed','Observed'],['design','Proposed design choice']])}${select('status','Review status',a.status,STATUSES)}<label class="rv-field full"><span>Supporting evidence (multiple allowed)</span><select name="sourceIds" multiple>${p().sources.map(s=>`<option value="${esc(s.id)}" ${a.sourceIds.includes(s.id)?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>${textarea('rationale','Reasoning and conflicts',a.rationale)}${textarea('question','Measurement / answer needed',a.question ?? '')}${textarea('alternatives','Alternatives · one per line',a.alternatives.join('\n'))}<label class="rv-field full"><span>Depends on these elements / evidence</span><select name="dependsOn" multiple>${[...evidenceEntityOptions(),...p().sources.map(source=>[source.id,`${source.name} · evidence`] as Pair),...p().assumptions.filter(other=>other.id!==a.id).map(other=>[other.id,`${other.property} · assumption`] as Pair)].map(([id,title])=>`<option value="${esc(id)}" ${a.dependsOn?.includes(id)?'selected':''}>${esc(title)}</option>`).join('')}</select></label>${select('region-source','Evidence crop / region source',a.sourceRegion?.sourceId ?? '',[['','No region'],...p().sources.map(s=>[s.id,s.name] as Pair)],true)}${number('region-x','Region X (0–1)',a.sourceRegion?.x ?? 0,0,1)}${number('region-y','Region Y (0–1)',a.sourceRegion?.y ?? 0,0,1)}${number('region-width','Region width (0–1)',a.sourceRegion?.width ?? 1,0.001,1)}${number('region-height','Region height (0–1)',a.sourceRegion?.height ?? 1,0.001,1)}</div><p class="rv-help">Acceptance is for visualization. Measured and verified properties need a supporting source. Updating this record does not automatically change geometry.</p>${submit(existing?'Save evidence review':'Add assumption')}`,existing?.id)}<div class="rv-actions">${existing?action('delete-assumption','Delete record',existing.id,'rv-danger'):''}${action('assumption-close','Close form')}</div></div>`;
  }
  function assumptionsView() {
    const assumptions=p().assumptions;
    const list=assumptions.filter(a=>assumptionFilter==='all'||a.status===assumptionFilter||(assumptionFilter==='selected'&&a.entityId===selectedId));
    const existing=assumptions.find(a=>a.id===assumptionEditor);
    return `<h2>What do we know?</h2><p class="rv-lede">Review uncertainty per property. Keep visualization choices separate from measurements and verified evidence.</p><div class="rv-fields">${select('assumption-filter','Show',assumptionFilter,[['all','All properties'],['selected','Selected element'],...STATUSES],true)}</div><div class="rv-actions">${action('assumption-new','Add assumption',selectedId ?? undefined,'primary')}</div>${assumptionEditor!==null?assumptionForm(existing):''}${list.map(a=>`<div class="rv-card"><div class="rv-card-head"><strong>${esc(name(a.entityId))}</strong>${badge(a.status)}</div><p><strong>${esc(a.property)}</strong>: ${esc(a.value || 'Unknown')}</p><p class="rv-help">${esc(a.question || a.rationale || 'No rationale recorded.')}</p>${a.alternatives.length?`<p class="rv-help">Alternatives: ${a.alternatives.map(esc).join(' · ')}</p>`:''}<p class="rv-file-details">${esc(pretty(a.sourceKind))} · ${a.sourceIds.length} evidence source${a.sourceIds.length===1?'':'s'}${a.dependsOn?.length?` · depends on ${a.dependsOn.map(id=>esc(name(id))).join(', ')}`:''}</p><div class="rv-actions">${action('assumption-edit','Review',a.id)}${action('focus','Focus element',a.entityId)}${action('select','Edit geometry',a.entityId)}</div></div>`).join('') || '<p class="rv-empty">No assumptions match this filter. Add unresolved measurements or alternatives before treating inferred geometry as fact.</p>'}`;
  }
  function layerCheckbox(name: string,label: string,defaultValue: boolean) {
    if(!layers.has(name)) layers.set(name,defaultValue);
    return `<label class="rv-inline rv-help"><input type="checkbox" data-layer="${name}" ${layers.get(name)?'checked':''}>${esc(label)}</label>`;
  }
  function defaultComponent(kind: ComponentKind, roomId?: string): BuildingComponent {
    const scene=config.getScene();
    const selectedRoomId=scene.rooms.find(room=>room.id===selectedId)?.id ?? p().components.find(component=>component.id===selectedId)?.roomId;
    const room=roomId!==undefined?scene.rooms.find(candidate=>candidate.id===roomId):scene.rooms.find(candidate=>candidate.id===selectedRoomId) ?? scene.rooms[0];
    const floor=room?meta(room.id).elevation ?? 0:0;
    const centre: Vec3=room?[room.polygon.reduce((sum,v)=>sum+v[0],0)/room.polygon.length,floor,room.polygon.reduce((sum,v)=>sum+v[1],0)/room.polygon.length]:[0,0,0];
    const sizes: Partial<Record<ComponentKind,Vec3>>={column:[0.3,2.8,0.3],beam:[2,0.3,0.3],shaft:[0.6,2.8,0.6],railing:[2,1.1,0.08],step:[1,0.15,0.3],ceiling:[3,0.12,3],light:[0.3,0.12,0.3],switch:[0.08,0.08,0.025],outlet:[0.08,0.08,0.025],panel:[0.4,0.6,0.12],junction:[0.1,0.1,0.05],sink:[0.6,0.85,0.5],toilet:[0.4,0.8,0.7],shower:[0.9,2,0.9],bath:[0.75,0.55,1.7],drain:[0.12,0.03,0.12],valve:[0.1,0.1,0.1],riser:[0.12,2.8,0.12],radiator:[0.9,0.6,0.12],ac:[0.8,0.3,0.22],vent:[0.25,0.25,0.1],thermostat:[0.09,0.12,0.03],cabinet:[0.6,0.9,0.6],worktop:[1.8,0.04,0.6],appliance:[0.6,0.85,0.6],'smoke-detector':[0.12,0.05,0.12],security:[0.1,0.15,0.08],network:[0.15,0.12,0.08],'gas-point':[0.1,0.1,0.1],'access-panel':[0.4,0.4,0.03]};
    if(['light','ceiling','beam','smoke-detector'].includes(kind)) centre[1]=num(floor + ((room?meta(room.id).ceilingHeight:undefined) ?? scene.walls[0]?.height ?? 2.7) - (sizes[kind]?.[1] ?? 0.12),6);
    if(['switch','thermostat'].includes(kind)) centre[1]=num(floor+1.1,6);
    if(['outlet','network'].includes(kind)) centre[1]=num(floor+0.3,6);
    if(['ac','vent'].includes(kind)) centre[1]=num(floor+2.2,6);
    if(kind==='worktop') centre[1]=num(floor+0.9,6);
    return {id:uid(),name:COMPONENTS.find(([k])=>k===kind)?.[1] ?? pretty(kind),kind,position:centre,dimensions:sizes[kind] ?? [0.3,0.3,0.3],rotation:0,color:kind==='light'?'#fff0cb':'#a5adb7',phase:p().mode==='renovate'?'new':'existing',...(room?{roomId:room.id}:{}),...(kind==='light'?{light:{brightness:800,temperature:3000,enabled:true}}:{}),...(kind==='switch'?{control:{type:'single' as const,targets:[],gangs:1}}:{})};
  }
  function componentForm(existing?: BuildingComponent) {
    const c=existing ?? defaultComponent('light');
    return `<div class="rv-card"><h3>${existing?esc(c.name):'Place a building component'}</h3>${form('component',`<div class="rv-fields">${select('kind','Component type',c.kind,COMPONENTS,true)}${field('name','Name',c.name,'text','required',true)}${select('phase','Renovation action',c.phase,PHASES)}${select('roomId','Room',c.roomId ?? '',[['','Unassigned'],...config.getScene().rooms.map(r=>[r.id,r.name] as Pair)])}${number('x','Position X (m)',c.position[0])}${number('y','Base elevation Y (m)',c.position[1])}${number('z','Position Z (m)',c.position[2])}${number('rotation','Rotation (degrees)',c.rotation*180/Math.PI)}${number('width','Width (m)',c.dimensions[0],0.001)}${number('height','Height (m)',c.dimensions[1],0.001)}${number('depth','Depth (m)',c.dimensions[2],0.001)}${field('color','Display colour',c.color,'color')}${number('price','Unit cost',c.price ?? 0,0)}</div><details class="rv-disclosure" ${c.host?'open':''}><summary>Wall mounting</summary><div class="rv-fields">${select('host-wall','Host wall',c.host?.wallId ?? '',[['','Free placement'],...config.getScene().walls.map(w=>[w.id,name(w.id)] as Pair)],true)}${number('host-offset','Centre from wall start (m)',c.host?.offset ?? 0.5,0)}${number('host-elevation','Base elevation Y (m)',c.host?.elevation ?? c.position[1],-10)}${select('host-side','Wall side',String(c.host?.side ?? 1),[['1','Side A'],['-1','Side B']])}</div><p class="rv-help">Mounted components follow the host wall. Offset locates the component centre; elevation locates its base.</p></details><div data-component-extra>${componentExtras(c)}</div><details class="rv-disclosure"><summary>Use &amp; maintenance space</summary><div class="rv-fields">${number('clear-width','Clearance width (m)',c.clearance?.[0] ?? c.dimensions[0],0.001)}${number('clear-height','Clearance height (m)',c.clearance?.[1] ?? c.dimensions[1],0.001)}${number('clear-depth','Clearance depth (m)',c.clearance?.[2] ?? c.dimensions[2]+0.6,0.001)}</div>${checkbox('clear-enabled','Record a clearance envelope',Boolean(c.clearance))}</details><div class="rv-fields">${textarea('notes','Connections / installation notes',c.notes ?? '')}</div>${submit(existing?'Apply component changes':'Place component')}`,existing?.id)}${existing?`${switchTestControls(c)}${commonMetadata(c.id)}${selectedAssumptions(c.id)}<div class="rv-actions">${action('focus','Focus component',c.id)}${action('delete-component','Delete component',c.id,'rv-danger')}</div>`:''}<div class="rv-actions">${action('component-close','Close form')}</div></div>`;
  }
  function switchLevel(id: string): number {
    const fallback=switchLevels.get(id) ?? (p().components.find(component=>component.id===id)?.control?.targets.some(target=>p().components.find(light=>light.id===target)?.light?.enabled)?1:0);
    const level=config.getSwitchLevel?.(id) ?? fallback;
    return Number.isFinite(level)?Math.max(0,Math.min(1,level)):fallback;
  }
  function switchTestControls(component: BuildingComponent): string {
    if(component.kind!=='switch' || (!config.toggleSwitch && !config.setSwitchLevel)) return '';
    const dimmer=component.control?.type==='dimmer' && config.setSwitchLevel;
    const percentage=Math.round(switchLevel(component.id)*100);
    return `<div class="rv-card rv-test"><div class="rv-card-head"><h3>Test controls</h3>${dimmer?`<output id="rv-dimmer-output">${percentage}%</output>`:''}</div><p class="rv-help">${component.control?.targets.length ?? 0} connected lights. Several switches can control the same fixtures.</p>${dimmer?`<label class="rv-field"><span>Group dimmer level</span><input id="rv-dimmer-level" data-id="${esc(component.id)}" type="range" min="0" max="100" step="1" value="${percentage}"></label><p class="rv-help">Sets connected lights to the same level. The percentage shows the brightest active light when their levels differ.</p>`:''}${config.toggleSwitch?`<div class="rv-actions">${action('switch-test','Toggle controlled lights',component.id)}</div>`:''}<p class="rv-help">Temporary preview. Saved brightness and renovation history stay unchanged.</p></div>`;
  }
  function syncTestControls(): void {
    const dimmer=container.querySelector<HTMLInputElement>('#rv-dimmer-level');
    if(dimmer) {
      const percentage=Math.round(switchLevel(dimmer.dataset.id!)*100);
      dimmer.value=String(percentage);
      const output=container.querySelector<HTMLOutputElement>('#rv-dimmer-output');
      if(output) output.textContent=`${percentage}%`;
    }
    const door=container.querySelector<HTMLInputElement>('#rv-door-angle');
    if(door && config.getDoorAngle) setDoorInput(Math.round(config.getDoorAngle(door.dataset.id!)*180/Math.PI));
  }
  function componentExtras(c: BuildingComponent) {
    if(c.kind==='light') return `<div class="rv-section"><h3>Fixture light</h3><div class="rv-fields">${number('brightness','Brightness (lumens)',c.light?.brightness ?? 800,0,10000)}${number('temperature','Colour temperature (K)',c.light?.temperature ?? 3000,1000,15000)}${field('group','Lighting group',c.light?.group ?? '')}</div>${checkbox('light-enabled','Initially on',c.light?.enabled ?? true)}<p class="rv-help">The viewport approximates illumination for design review.</p></div>`;
    if(c.kind==='switch') return `<div class="rv-section"><h3>Logical controls</h3><div class="rv-fields">${select('control-type','Control type',c.control?.type ?? 'single',[['single','Single switch'],['two-way','Multiple-location control'],['dimmer','Dimmer'],['multi-gang','Multi-gang (shared group)']])}${number('gangs','Gangs',c.control?.gangs ?? 1,1,12)}</div><div class="rv-check-list">${p().components.filter(light=>light.kind==='light').map(light=>`<label><input type="checkbox" name="targets" value="${esc(light.id)}" ${c.control?.targets.includes(light.id)?'checked':''}>${esc(light.name)}</label>`).join('') || '<p class="rv-help">Place a light first, then connect it here.</p>'}</div><p class="rv-help">Several controls can operate the same lights. Multi-gang controls currently share one target group. Control links do not describe supply cables; add those as routes.</p></div>`;
    return '';
  }
  function routeForm(existing?: ServiceRoute) {
    const r=existing ?? {id:'',name:'New service route',system:'electrical',points:[[0,1,0],[2,1,0]],diameter:0.02,phase:p().mode==='renovate'?'new':'existing'} as ServiceRoute;
    const endpoints: Pair[]=[['','Unconnected'],...p().components.map(c=>[c.id,c.name] as Pair)];
    return `<div class="rv-card"><h3>${existing?'Edit service route':'Connect a service route'}</h3>${form('route',`<div class="rv-fields">${field('name','Route name',r.name,'text','required',true)}${select('system','Service',r.system,SYSTEMS)}${select('phase','Renovation action',r.phase,PHASES)}${select('from','Start equipment',r.from ?? '',endpoints)}${select('to','End equipment',r.to ?? '',endpoints)}${number('diameter','Outside diameter (m)',r.diameter,0.001)}${number('pricePerMetre','Cost per metre',r.pricePerMetre ?? 0,0)}${field('circuit','Circuit / network label',r.circuit ?? '','text','',true)}${textarea('points','Route points · X, Y, Z (m)',r.points.map(point=>point.join(', ')).join('\n'),'0, 1, 0\n2, 1, 0')}${textarea('notes','Sizing / slope / evidence notes',r.notes ?? '')}</div><p class="rv-help">Endpoint selections snap the route ends to equipment and follow it when moved. Intermediate points describe the physical path. Hidden existing routes remain assumptions.</p>${submit(existing?'Apply route changes':'Add route')}`,existing?.id)}<div class="rv-actions">${existing?action('focus','Focus route',r.id)+action('delete-route','Delete route',r.id,'rv-danger'):''}${action('route-close','Close form')}</div>${existing?selectedAssumptions(existing.id):''}</div>`;
  }
  function systemsView() {
    const project=p();
    const component=project.components.find(c=>c.id===componentEditor);
    const route=project.routes.find(r=>r.id===routeEditor);
    return `<h2>Fixtures &amp; systems</h2><p class="rv-lede">Place fixed features, equipment and built-ins. Connect controls and proposed physical service routes.</p><div class="rv-toolbar">${action('component-new','Add component',undefined,'primary')}${action('route-new','Add route')}</div>${config.onLayer?`<details class="rv-disclosure"><summary>Visible layers</summary>${layerCheckbox('components','Building components',true)}${layerCheckbox('services','All service routes',true)}${SYSTEMS.map(([system,label])=>layerCheckbox(system,label,true)).join('')}${layerCheckbox('clearances','Use / maintenance envelopes',false)}</details>`:''}<div class="rv-entity-list">${project.components.map(c=>row(c.id,c.name,c.kind)).join('')}${project.routes.map(r=>row(r.id,r.name,r.system)).join('') || (!project.components.length?'<p class="rv-empty">Add a light, switch, fixed feature or connection point to begin.</p>':'')}</div>${componentEditor!==null?componentForm(component):''}${routeEditor!==null?routeForm(route):''}`;
  }
  function optionsView() {
    const project=p();
    const analysis=analyzeProject(config.getScene(),config.getCatalog());
    const baseline=project.baseline;
    return `<h2>Existing &amp; proposed</h2><p class="rv-lede">Preserve the existing apartment, then explore renovation options without losing the starting point.</p>${form('project-mode',`<div class="rv-fields">${select('mode','Working mode',project.mode,[['correct','Correct existing model'],['renovate','Propose renovation']],true)}</div><p class="rv-help">Correct mode repairs reconstruction mistakes. Renovation mode records intended changes to the physical apartment.</p>${submit('Set working mode')}`)}<div class="rv-card"><div class="rv-card-head"><strong>Existing-state baseline</strong>${badge(baseline?'saved':'not captured')}</div>${baseline?`<p class="rv-help">${baseline.rooms.length} rooms · ${baseline.walls.length} walls · ${baseline.components.length} components preserved.</p><div class="rv-stats"><div class="rv-stat"><strong>${analysis.changes.added}</strong><span>Added</span></div><div class="rv-stat"><strong>${analysis.changes.removed}</strong><span>Removed</span></div><div class="rv-stat"><strong>${analysis.changes.changed}</strong><span>Changed</span></div></div>${config.onComparison?`<label class="rv-inline rv-help"><input type="checkbox" id="rv-comparison" ${comparison?'checked':''}>Show baseline comparison in 3D</label>`:''}<div class="rv-actions">${action('restore-baseline','Restore baseline')}</div><details class="rv-disclosure"><summary>Replace saved baseline</summary><p class="rv-help">Capture the current model as the new reference. The previous baseline remains available through Undo.</p><div class="rv-actions">${action('capture-baseline','Replace baseline with current')}</div></details>`:`<p class="rv-help">Capture the current model before exploring renovation. Unresolved evidence remains visible.</p><div class="rv-actions">${action('capture-baseline','Capture current as baseline',undefined,'primary')}</div>`}</div><div class="rv-section"><h3>Design options</h3><p class="rv-help">Switching options saves the active geometry first. Evidence, materials and work packages belong to the project.</p>${project.options.map(option=>`<div class="rv-card"><div class="rv-card-head"><strong>${esc(option.name)}</strong>${option.id===project.activeOptionId?badge('active'):''}</div><div class="rv-actions">${option.id!==project.activeOptionId?action('switch-option','Open option',option.id):''}${action('delete-option','Delete option',option.id,'rv-danger')}</div></div>`).join('')}${form('option',`<div class="rv-fields">${field('name','New option name','','text','required placeholder="Open kitchen, option B…"',true)}</div>${submit('Save current as a new option')}`)}</div>`;
  }
  function materialForm(existing?: FinishMaterial) {
    const m=existing ?? {id:'',name:'New finish',color:'#c5beb0',unit:'m2',unitCost:0,thickness:0.01,wastePercent:10} as FinishMaterial;
    return `<div class="rv-card"><h3>${existing?'Edit finish material':'Add finish material'}</h3>${form('material',`<div class="rv-fields">${field('name','Material name',m.name,'text','required',true)}${select('unit','Priced per',m.unit,[['m2','Square metre'],['m','Linear metre'],['each','Each']])}${number('unitCost','Unit cost',m.unitCost,0)}${number('thickness','Layer thickness (m)',m.thickness,0)}${number('wastePercent','Waste allowance (%)',m.wastePercent,0,100)}${field('color','Finish colour',m.color,'color')}${textarea('notes','Specification / price source',m.notes ?? '')}</div>${submit('Save material')}`,existing?.id)}<div class="rv-actions">${existing?action('delete-material','Delete material',m.id,'rv-danger'):''}${action('material-close','Close form')}</div></div>`;
  }
  function taskForm(existing?: ProjectTask) {
    const task=existing ?? {id:'',title:'',trade:'General',status:'todo',entityIds:selectedId?[selectedId]:[],dependsOn:[],allowance:0};
    return `<div class="rv-card"><h3>${existing?'Edit work package':'Add work package'}</h3>${form('task',`<div class="rv-fields">${field('title','Work description',task.title,'text','required',true)}${field('trade','Trade',task.trade,'text','required')}${select('status','Status',task.status,[['todo','To do'],['doing','In progress'],['done','Complete']])}${number('allowance','Labour / work allowance',task.allowance,0)}<label class="rv-field full"><span>Related elements</span><select name="entityIds" multiple>${evidenceEntityOptions().map(([id,title])=>`<option value="${esc(id)}" ${task.entityIds.includes(id)?'selected':''}>${esc(title)}</option>`).join('')}</select></label><label class="rv-field full"><span>Depends on these work packages</span><select name="dependsOn" multiple>${p().tasks.filter(t=>t.id!==task.id).map(t=>`<option value="${esc(t.id)}" ${task.dependsOn.includes(t.id)?'selected':''}>${esc(t.title)}</option>`).join('')}</select></label>${textarea('notes','Work notes / review decisions',task.notes ?? '')}</div>${submit('Save work package')}`,existing?.id)}<div class="rv-actions">${existing?action('delete-task','Delete work package',task.id,'rv-danger'):''}${action('task-close','Close form')}</div></div>`;
  }
  function reviewView() {
    const project=p(), analysis=analyzeProject(config.getScene(),config.getCatalog());
    const material=project.materials.find(m=>m.id===materialEditor), task=project.tasks.find(t=>t.id===taskEditor);
    const finishTargets=finishEntities(), finishTarget=finishTargets.some(([id])=>id===selectedId)?selectedId!:finishTargets[0]?.[0] ?? '';
    const surfaces=finishSurfaces(finishTarget);
    return `<h2>Review &amp; handoff</h2><p class="rv-lede">Resolve model issues, assign finishes and keep an explicit scope of work. Quantities update with the geometry.</p><div class="rv-stats"><div class="rv-stat"><strong>${num(analysis.floorArea,1)}</strong><span>Floor m²</span></div><div class="rv-stat"><strong>${num(analysis.wallArea,1)}</strong><span>Wall m² / face</span></div><div class="rv-stat"><strong>${num(analysis.routeLength,1)}</strong><span>Services m</span></div></div><div class="rv-card"><div class="rv-card-head"><strong>Estimate</strong><strong>${esc(project.currency)} ${analysis.totalCost.toLocaleString(undefined,{maximumFractionDigits:2})}</strong></div><p class="rv-help">Includes priced products, finishes, routes and work allowances. Unpriced work is not included. Uncertain dimensions affect quantities.</p>${form('currency',`<div class="rv-fields">${field('currency','Currency code',project.currency,'text','required minlength="3" maxlength="3" pattern="[A-Za-z]{3}"',true)}</div>${submit('Set currency')}`)}</div><details class="rv-disclosure" open><summary>${analysis.issues.length} model review issues</summary>${analysis.issues.map(issue=>`<${issue.entityId?'button':'div'} ${issue.entityId?`type="button" data-action="issue" data-id="${esc(issue.entityId)}"`:''} class="rv-issue">${badge(issue.severity)}<strong>${esc(issue.title)}</strong><p>${esc(issue.detail)}</p></${issue.entityId?'button':'div'}>`).join('') || '<p class="rv-help">No current model warnings. This is not an engineering or construction approval.</p>'}</details><details class="rv-disclosure"><summary>Quantity &amp; cost schedule</summary><table class="rv-table"><thead><tr><th>Item</th><th>Quantity</th><th>Cost</th></tr></thead><tbody>${analysis.quantities.map(q=>`<tr><td>${esc(q.name)}</td><td>${num(q.quantity,2)} ${esc(q.unit)}</td><td>${num(q.cost,2)}</td></tr>`).join('')}</tbody></table></details><details class="rv-disclosure" ${materialEditor!==null?'open':''}><summary>Finishes &amp; layers</summary><div class="rv-actions">${action('material-new','Add material')}</div>${project.materials.map(m=>`<button type="button" class="rv-entity-row" data-action="material-edit" data-id="${esc(m.id)}"><span class="rv-kind">${esc(m.unit)}</span><span>${esc(m.name)}</span><span class="rv-count">${num(m.unitCost,2)}</span></button>`).join('')}${materialEditor!==null?materialForm(material):''}${project.materials.length?`<div class="rv-section"><h3>Assign a surface finish</h3>${form('finish',`<div class="rv-fields">${select('entityId','Element',finishTarget,finishTargets,true)}${select('surface','Surface',surfaces[0]![0],surfaces)}${select('materialId','Material',finishMaterials(surfaces[0]![0])[0]![0],finishMaterials(surfaces[0]![0]))}</div>${submit('Assign finish')}`)}${project.finishes.map(f=>`<div class="rv-card"><strong>${esc(name(f.entityId))}</strong><p class="rv-help">${esc(pretty(f.surface))} · ${esc(project.materials.find(m=>m.id===f.materialId)?.name ?? 'Missing material')}</p><div class="rv-actions">${action('focus','Focus',f.entityId)}${action('delete-finish','Remove finish',f.id,'rv-danger')}</div></div>`).join('')}</div>`:'<p class="rv-help">Create a material to assign it to walls, floors, ceilings or equipment.</p>'}</details><details class="rv-disclosure" ${taskEditor!==null?'open':''}><summary>Work packages · ${project.tasks.filter(t=>t.status==='done').length}/${project.tasks.length} complete</summary><div class="rv-actions">${action('task-new','Add work package')}</div>${taskEditor!==null?taskForm(task):''}${project.tasks.map(t=>`<div class="rv-card"><div class="rv-card-head"><strong>${esc(t.title)}</strong>${badge(t.status)}</div><p class="rv-help">${esc(t.trade)} · ${esc(project.currency)} ${num(t.allowance,2)}${t.dependsOn.length?` · ${t.dependsOn.length} dependencies`:''}</p><div class="rv-actions">${action('task-edit','Edit work package',t.id)}</div></div>`).join('')}</details>${config.onExport?`<div class="rv-section"><h3>Export project &amp; schedules</h3><div class="rv-actions">${action('export-project','Project JSON')}${action('export-schedule','Quantity CSV')}${action('export-report','Review report')}</div><p class="rv-help">Project export preserves embedded source files, evidence records, baselines and options. External links still require access to their original location.</p></div>`:''}`;
  }
  function handleForm(type: string,id: string,fd: FormData) {
    switch(type) {
      case 'wall': return run('Update wall geometry',[{type:'update-wall',id,patch:{start:[numeric(fd,'start-x'),numeric(fd,'start-z')],end:[numeric(fd,'end-x'),numeric(fd,'end-z')],height:numeric(fd,'height'),thickness:numeric(fd,'thickness'),color:text(fd,'color')}}]);
      case 'wall-new': {
        const wallId=uid();
        const success=run('Add wall',[{type:'add-wall',wall:{id:wallId,start:[numeric(fd,'start-x'),numeric(fd,'start-z')],end:[numeric(fd,'end-x'),numeric(fd,'end-z')],height:numeric(fd,'height'),thickness:numeric(fd,'thickness'),color:'#ddd4c8',openings:[]}},{type:'set-metadata',id:wallId,patch:{name:text(fd,'name'),structuralRole:text(fd,'structuralRole') as EntityMetadata['structuralRole']}}]);
        if(success) choose(wallId); return success;
      }
      case 'metadata': {
        const patch: EntityMetadata={review:text(fd,'review') as EntityMetadata['review'],material:text(fd,'material'),notes:text(fd,'notes'),locked:fd.has('locked')};
        if(fd.has('name')) patch.name=text(fd,'name');
        if(fd.has('phase')) patch.phase=text(fd,'phase') as RenovationPhase;
        if(fd.has('structuralRole')) patch.structuralRole=text(fd,'structuralRole') as EntityMetadata['structuralRole'];
        if(fd.has('boundary')) patch.boundary=text(fd,'boundary') as EntityMetadata['boundary'];
        return run('Update element classification',[{type:'set-metadata',id,patch}]);
      }
      case 'split-wall': return run('Split wall',[{type:'split-wall',id,offset:numeric(fd,'offset'),newId:uid()}]);
      case 'join-walls': return run('Join connected walls',[{type:'join-walls',id,otherId:required(fd,'otherId')}]);
      case 'opening': {
        const openingId=id || uid();
        const opening: Opening={id:openingId,kind:text(fd,'kind') as Opening['kind'],offset:numeric(fd,'offset'),width:numeric(fd,'width'),height:numeric(fd,'height'),sill:numeric(fd,'sill')};
        const patch: EntityMetadata={role:text(fd,'role') as EntityMetadata['role'],mechanism:(text(fd,'mechanism') || undefined) as EntityMetadata['mechanism'],hinge:(text(fd,'hinge') || undefined) as EntityMetadata['hinge'],swing:text(fd,'swing')?numeric(fd,'swing') as 1|-1:undefined,frameWidth:numeric(fd,'frameWidth'),leafThickness:numeric(fd,'leafThickness'),threshold:numeric(fd,'threshold')};
        const {id:_,...openingPatch}=opening;
        const success=run(id?'Edit opening':'Add opening',[id?{type:'update-opening',id,patch:openingPatch}:{type:'add-opening',wallId:required(fd,'wallId'),opening},{type:'set-metadata',id:openingId,patch}]);
        if(success) choose(openingId); return success;
      }
      case 'room': {
        const roomId=id || uid();
        const room: Room={id:roomId,name:required(fd,'name'),polygon:points(fd,'polygon',2,3) as Vec2[],color:text(fd,'color')};
        const {id:_,...patch}=room;
        const success=run(id?'Edit room geometry':'Add room',[id?{type:'update-room',id,patch}:{type:'add-room',room},{type:'set-metadata',id:roomId,patch:{zone:text(fd,'zone') as EntityMetadata['zone'],elevation:numeric(fd,'elevation'),ceilingHeight:numeric(fd,'ceilingHeight')}}]);
        if(success) choose(roomId); return success;
      }
      case 'source':
      case 'source-new': {
        const existing=p().sources.find(s=>s.id===id);
        const source: EvidenceSource={...existing,id:id || uid(),name:required(fd,'name'),kind:text(fd,'kind') as EvidenceSource['kind'],notes:text(fd,'notes')};
        if(text(fd,'roomId')) source.roomId=text(fd,'roomId'); else delete source.roomId;
        if(text(fd,'url')) { if(!/^https?:\/\//i.test(text(fd,'url'))) throw new Error('Evidence URLs must start with https:// or http://.'); source.url=text(fd,'url'); } else delete source.url;
        if(existing?.calibration) source.calibration={metres:numeric(fd,'metres'),pixels:numeric(fd,'pixels'),origin:[numeric(fd,'origin-x'),numeric(fd,'origin-z')],rotation:numeric(fd,'rotation')*Math.PI/180};
        return run('Save evidence source',[{type:'upsert-source',source}]);
      }
      case 'assumption': {
        const assumption: PropertyAssumption={id:id || uid(),entityId:required(fd,'entityId'),property:required(fd,'property'),value:text(fd,'value'),status:text(fd,'status') as PropertyAssumption['status'],sourceKind:text(fd,'sourceKind') as PropertyAssumption['sourceKind'],sourceIds:fd.getAll('sourceIds').map(String),rationale:text(fd,'rationale'),alternatives:text(fd,'alternatives').split('\n').map(s=>s.trim()).filter(Boolean),question:text(fd,'question'),dependsOn:fd.getAll('dependsOn').map(String)};
        if(text(fd,'region-source')) assumption.sourceRegion={sourceId:text(fd,'region-source'),x:numeric(fd,'region-x'),y:numeric(fd,'region-y'),width:numeric(fd,'region-width'),height:numeric(fd,'region-height')};
        if(['measured','verified'].includes(assumption.status) && !assumption.sourceIds.length) throw new Error('Add a supporting evidence source before marking this property measured or verified.');
        const success=run('Save property evidence',[{type:'upsert-assumption',assumption}]);
        if(success) { assumptionEditor=null; render(); } return success;
      }
      case 'component': {
        const kind=text(fd,'kind') as ComponentKind;
        const component: BuildingComponent={id:id || uid(),name:required(fd,'name'),kind,position:[numeric(fd,'x'),numeric(fd,'y'),numeric(fd,'z')],dimensions:[numeric(fd,'width'),numeric(fd,'height'),numeric(fd,'depth')],rotation:numeric(fd,'rotation')*Math.PI/180,color:text(fd,'color'),phase:text(fd,'phase') as RenovationPhase,price:numeric(fd,'price'),notes:text(fd,'notes')};
        if(text(fd,'roomId')) component.roomId=text(fd,'roomId');
        if(text(fd,'host-wall')) component.host={wallId:text(fd,'host-wall'),offset:numeric(fd,'host-offset'),elevation:numeric(fd,'host-elevation'),side:numeric(fd,'host-side') as 1|-1};
        if(fd.has('clear-enabled')) component.clearance=[numeric(fd,'clear-width'),numeric(fd,'clear-height'),numeric(fd,'clear-depth')];
        if(kind==='light') component.light={brightness:numeric(fd,'brightness'),temperature:numeric(fd,'temperature'),enabled:fd.has('light-enabled'),group:text(fd,'group')};
        if(kind==='switch') component.control={type:text(fd,'control-type') as 'single'|'two-way'|'dimmer'|'multi-gang',targets:fd.getAll('targets').map(String),gangs:numeric(fd,'gangs')};
        const success=run(id?'Edit building component':'Place building component',[{type:'upsert-component',component}]);
        if(success) choose(component.id); return success;
      }
      case 'route': {
        const route: ServiceRoute={id:id || uid(),name:required(fd,'name'),system:text(fd,'system') as ServiceSystem,points:points(fd,'points',3,2) as Vec3[],diameter:numeric(fd,'diameter'),phase:text(fd,'phase') as RenovationPhase,pricePerMetre:numeric(fd,'pricePerMetre'),circuit:text(fd,'circuit'),notes:text(fd,'notes')};
        if(text(fd,'from')) route.from=text(fd,'from');
        if(text(fd,'to')) route.to=text(fd,'to');
        const success=run(id?'Edit service route':'Add service route',[{type:'upsert-route',route}]);
        if(success) choose(route.id); return success;
      }
      case 'project-mode': return run('Change working mode',[{type:'set-project',patch:{mode:text(fd,'mode') as 'correct'|'renovate'}}]);
      case 'option': return run('Create renovation option',[{type:'create-option',id:uid(),name:required(fd,'name')}]);
      case 'currency': return run('Set project currency',[{type:'set-project',patch:{currency:required(fd,'currency').toUpperCase()}}]);
      case 'material': return run('Save finish material',[{type:'upsert-material',material:{id:id || uid(),name:required(fd,'name'),color:text(fd,'color'),unit:text(fd,'unit') as FinishMaterial['unit'],unitCost:numeric(fd,'unitCost'),thickness:numeric(fd,'thickness'),wastePercent:numeric(fd,'wastePercent'),notes:text(fd,'notes')}}]);
      case 'finish': {
        const entityId=required(fd,'entityId'), surface=text(fd,'surface') as 'floor'|'ceiling'|'wall-front'|'wall-back'|'skirting'|'component';
        const existing=p().finishes.find(f=>f.entityId===entityId && f.surface===surface);
        return run('Assign surface finish',[{type:'upsert-finish',finish:{id:existing?.id ?? uid(),entityId,surface,materialId:required(fd,'materialId')}}]);
      }
      case 'task': return run('Save work package',[{type:'upsert-task',task:{id:id || uid(),title:required(fd,'title'),trade:required(fd,'trade'),status:text(fd,'status') as ProjectTask['status'],entityIds:fd.getAll('entityIds').map(String),dependsOn:fd.getAll('dependsOn').map(String),allowance:numeric(fd,'allowance'),notes:text(fd,'notes')}}]);
      default: throw new Error(`Unknown form: ${type}`);
    }
  }
  function handleAction(actionName: string,id: string, additive = false) {
    switch(actionName) {
      case 'select': choose(id, false, additive); return;
      case 'focus': selectedId=id; config.select(id); config.focus(id); render(); return;
      case 'issue': choose(id,true); return;
      case 'sources': config.onSources?.(); return;
      case 'reconstruct': config.onReconstruct?.(); return;
      case 'source-edit': sourceEditor=id; tab='evidence'; break;
      case 'source-close': sourceEditor=null; break;
      case 'assumption-new': if(id) selectedId=id; assumptionEditor='new'; tab='assumptions'; break;
      case 'assumption-new-source': assumptionEditor='new'; tab='assumptions'; render(); { const input=container.querySelector<HTMLSelectElement>('[name=sourceIds]'); if(input) [...input.options].forEach(o=>o.selected=o.value===id); } return;
      case 'assumption-edit': assumptionEditor=id; tab='assumptions'; break;
      case 'assumption-close': assumptionEditor=null; break;
      case 'component-new': componentEditor='new'; routeEditor=null; tab='systems'; break;
      case 'component-close': componentEditor=null; break;
      case 'route-new': routeEditor='new'; componentEditor=null; tab='systems'; break;
      case 'route-close': routeEditor=null; break;
      case 'material-new': materialEditor='new'; break;
      case 'material-edit': materialEditor=id; break;
      case 'material-close': materialEditor=null; break;
      case 'task-new': taskEditor='new'; break;
      case 'task-edit': taskEditor=id; break;
      case 'task-close': taskEditor=null; break;
      case 'switch-test': { const previous=switchLevel(id); config.toggleSwitch?.(id); if(!config.getSwitchLevel) switchLevels.set(id,previous>0?0:1); syncTestControls(); return; }
      case 'door-close': config.testDoor?.(id,0); setDoorInput(0); return;
      case 'door-open': config.testDoor?.(id,Math.PI/2); setDoorInput(90); return;
      case 'capture-baseline': run('Capture existing apartment baseline',[{type:'capture-baseline'}]); return;
      case 'restore-baseline': run('Restore existing apartment baseline',[{type:'restore-baseline'}]); return;
      case 'switch-option': run('Switch renovation option',[{type:'switch-option',id}]); return;
      case 'export-project': config.onExport?.('project'); return;
      case 'export-schedule': config.onExport?.('schedule'); return;
      case 'export-report': config.onExport?.('report'); return;
      default: {
        const deleteTypes=['delete-wall','delete-room','delete-opening','delete-component','delete-route','delete-source','delete-assumption','delete-material','delete-finish','delete-task','delete-option'];
        if(deleteTypes.includes(actionName)) {
          const operation={type:actionName,id} as Operation;
          if(run(pretty(actionName),[operation])) {
            if(selectedId===id) { selectedId=null; config.select(null); }
            if(assumptionEditor===id) assumptionEditor=null;
            if(componentEditor===id) componentEditor=null;
            if(routeEditor===id) routeEditor=null;
            if(materialEditor===id) materialEditor=null;
            if(taskEditor===id) taskEditor=null;
            if(sourceEditor===id) sourceEditor=null;
          }
          break;
        }
      }
    }
    render();
  }
  function setDoorInput(angle: number) {
    const input=container.querySelector<HTMLInputElement>('#rv-door-angle'), output=container.querySelector<HTMLOutputElement>('#rv-angle-output');
    if(input) input.value=String(angle);
    if(output) output.textContent=`${angle}°`;
  }
  function updateComponentKind(input: HTMLSelectElement) {
    const form=input.closest('form');
    if(!form) return;
    const extra=form.querySelector<HTMLElement>('[data-component-extra]');
    const roomInput=form.elements.namedItem('roomId') as HTMLSelectElement;
    const defaults=defaultComponent(input.value as ComponentKind,roomInput.value);
    if(extra) extra.innerHTML=componentExtras(defaults);
    // A new palette selection starts with realistic dimensions; an existing component keeps its measured geometry.
    if(!form.dataset.id) {
      const values: Record<string,string|number>={name:defaults.name,width:defaults.dimensions[0],height:defaults.dimensions[1],depth:defaults.dimensions[2],x:defaults.position[0],y:defaults.position[1],z:defaults.position[2],color:defaults.color,'clear-width':defaults.dimensions[0],'clear-height':defaults.dimensions[1],'clear-depth':defaults.dimensions[2]+0.6,'host-elevation':defaults.position[1]};
      for(const [key,value] of Object.entries(values)) { const field=form.elements.namedItem(key); if(field instanceof HTMLInputElement) field.value=String(value); }
    }
  }
  function render() {
    container.querySelectorAll<HTMLDetailsElement>('details').forEach(details=>openDisclosures.set(details.querySelector('summary')?.textContent ?? '',details.open));
    const projectData=p();
    if(componentEditor && componentEditor!=='new' && !projectData.components.some(c=>c.id===componentEditor)) componentEditor=null;
    if(routeEditor && routeEditor!=='new' && !projectData.routes.some(r=>r.id===routeEditor)) routeEditor=null;
    if(materialEditor && materialEditor!=='new' && !projectData.materials.some(m=>m.id===materialEditor)) materialEditor=null;
    if(taskEditor && taskEditor!=='new' && !projectData.tasks.some(t=>t.id===taskEditor)) taskEditor=null;
    if(sourceEditor && !projectData.sources.some(source=>source.id===sourceEditor)) sourceEditor=null;
    if(assumptionEditor && assumptionEditor!=='new' && !projectData.assumptions.some(a=>a.id===assumptionEditor)) assumptionEditor=null;
    const scroll=container.querySelector('.renovation-scroll')?.scrollTop ?? 0;
    const project=p();
    const content={shell:shellView,evidence:evidenceView,assumptions:assumptionsView,systems:systemsView,options:optionsView,review:reviewView}[tab]();
    container.classList.add('renovation-workspace');
    container.innerHTML=`<div class="renovation-nav" role="tablist" aria-label="Renovation workspace">${TABS.map(([id,label])=>`<button type="button" role="tab" id="rv-tab-${id}" data-tab="${id}" aria-selected="${tab===id}" aria-controls="rv-content" tabindex="${tab===id?'0':'-1'}">${label}</button>`).join('')}</div><div class="renovation-scroll" id="rv-content" role="tabpanel" aria-labelledby="rv-tab-${tab}"><div class="rv-work-mode">${project.mode==='correct'?'Correcting the existing model':'Proposing renovation'}${badge(project.mode==='correct'?'correction':'proposal')}</div>${content}</div>`;
    container.querySelectorAll<HTMLDetailsElement>('details').forEach(details=> { const isOpen=openDisclosures.get(details.querySelector('summary')?.textContent ?? ''); if(isOpen!==undefined && !details.hasAttribute('open')) details.open=isOpen; });
    container.querySelector<HTMLElement>('.renovation-scroll')!.scrollTop=scroll;
    container.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button=>{
      button.onclick=()=> { tab=button.dataset.tab as Tab; render(); container.querySelector<HTMLElement>('.renovation-scroll')!.scrollTop=0; container.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.focus(); };
      button.onkeydown=event=> {
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const index=TABS.findIndex(([id])=>id===tab);
        const next=event.key==='Home'?0:event.key==='End'?TABS.length-1:(index+(event.key==='ArrowRight'?1:TABS.length-1))%TABS.length;
        tab=TABS[next]![0] as Tab; render(); container.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.focus();
      };
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>button.onclick=event=>{
      try { handleAction(button.dataset.action!,button.dataset.id ?? '', event.shiftKey); }
      catch(error) { config.notice(error instanceof Error?error.message:String(error),true); }
    });
    container.querySelectorAll<HTMLFormElement>('form[data-form]').forEach(element=>element.onsubmit=event=>{
      event.preventDefault();
      const errorEl=element.querySelector<HTMLElement>('.rv-validation')!;
      try { errorEl.hidden=true; if(!handleForm(element.dataset.form!,element.dataset.id ?? '',new FormData(element))) { errorEl.textContent='Change was not applied. Resolve the reported conflict and try again.'; errorEl.hidden=false; } }
      catch(error) { errorEl.textContent=error instanceof Error?error.message:String(error); errorEl.hidden=false; config.notice(errorEl.textContent,true); }
    });
    const tree=container.querySelector<HTMLInputElement>('#rv-tree-search');
    if(tree) tree.oninput=()=> {
      treeSearch=tree.value;
      const start=tree.selectionStart;
      render();
      const next=container.querySelector<HTMLInputElement>('#rv-tree-search')!;
      next.focus(); if(start!==null) next.setSelectionRange(start,start);
    };
    const filter=container.querySelector<HTMLSelectElement>('[name=assumption-filter]');
    if(filter) filter.onchange=()=> { assumptionFilter=filter.value; render(); };
    const componentKind=container.querySelector<HTMLSelectElement>('form[data-form=component] [name=kind]');
    if(componentKind) componentKind.onchange=()=>updateComponentKind(componentKind);
    const componentRoom=container.querySelector<HTMLSelectElement>('form[data-form=component] [name=roomId]');
    if(componentRoom) componentRoom.onchange=()=> {
      const form=componentRoom.closest('form')!;
      if(form.dataset.id) return;
      const kind=(form.elements.namedItem('kind') as HTMLSelectElement).value as ComponentKind;
      const defaults=defaultComponent(kind,componentRoom.value);
      for(const [key,value] of Object.entries({x:defaults.position[0],y:defaults.position[1],z:defaults.position[2],'host-elevation':defaults.position[1]})) (form.elements.namedItem(key) as HTMLInputElement).value=String(value);
    };
    const openingKind=container.querySelector<HTMLSelectElement>('form[data-form=opening] [name=kind]');
    if(openingKind) openingKind.onchange=()=> {
      const form=openingKind.closest('form')!;
      const sill=form.elements.namedItem('sill') as HTMLInputElement;
      sill.max=openingKind.value==='door'?'0':'6';
      if(openingKind.value==='door') sill.value='0';
      if(form.dataset.id) return;
      const values=openingKind.value==='window'?{width:'1.2',height:'1.4',sill:'0.9',mechanism:'fixed'}:{width:'0.9',height:'2.1',sill:'0',mechanism:'hinged'};
      for(const [key,value] of Object.entries(values)) { const field=form.elements.namedItem(key); if(field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value=value; }
    };
    const finishEntity=container.querySelector<HTMLSelectElement>('form[data-form=finish] [name=entityId]');
    if(finishEntity) finishEntity.onchange=()=> {
      const surface=finishEntity.closest('form')!.querySelector<HTMLSelectElement>('[name=surface]')!;
      const available=finishSurfaces(finishEntity.value);
      surface.innerHTML=options(available,available[0]![0]);
      const material=finishEntity.closest('form')!.querySelector<HTMLSelectElement>('[name=materialId]')!;
      const availableMaterials=finishMaterials(surface.value);
      material.innerHTML=options(availableMaterials,availableMaterials[0]![0]);
    };
    const finishSurface=container.querySelector<HTMLSelectElement>('form[data-form=finish] [name=surface]');
    if(finishSurface) finishSurface.onchange=()=> {
      const material=finishSurface.closest('form')!.querySelector<HTMLSelectElement>('[name=materialId]')!;
      const available=finishMaterials(finishSurface.value);
      material.innerHTML=options(available,available[0]![0]);
    };
    const angle=container.querySelector<HTMLInputElement>('#rv-door-angle');
    if(angle) angle.oninput=()=> { const degrees=Number(angle.value); config.testDoor?.(angle.dataset.id!,degrees*Math.PI/180); container.querySelector<HTMLOutputElement>('#rv-angle-output')!.textContent=`${degrees}°`; };
    const dimmer=container.querySelector<HTMLInputElement>('#rv-dimmer-level');
    if(dimmer) dimmer.oninput=()=> {
      const percentage=Number(dimmer.value);
      if(!Number.isFinite(percentage)) return;
      const level=Math.max(0,Math.min(1,percentage/100));
      switchLevels.set(dimmer.dataset.id!,level);
      config.setSwitchLevel?.(dimmer.dataset.id!,level);
      const output=container.querySelector<HTMLOutputElement>('#rv-dimmer-output');
      if(output) output.textContent=`${Math.round(level*100)}%`;
    };
    container.querySelectorAll<HTMLInputElement>('[data-layer]').forEach(input=>input.onchange=()=> { layers.set(input.dataset.layer!,input.checked); config.onLayer?.(input.dataset.layer!,input.checked); });
    const compare=container.querySelector<HTMLInputElement>('#rv-comparison');
    if(compare) compare.onchange=()=> { comparison=compare.checked; config.onComparison?.(comparison); };
  }
  render();
  return {
    render,
    setSelection(id, ids = id ? [id] : []) {
      const sameIds = JSON.stringify(ids) === JSON.stringify(selectedIds);
      selectedIds = [...ids];
      if(selectedId===id && sameIds) { syncTestControls(); return; }
      selectedId=id;
      const project=p();
      if(project.components.some(c=>c.id===id)) { tab='systems'; componentEditor=id; routeEditor=null; }
      else if(project.routes.some(r=>r.id===id)) { tab='systems'; routeEditor=id; componentEditor=null; }
      else if(config.getScene().walls.some(w=>w.id===id||w.openings.some(o=>o.id===id))||config.getScene().rooms.some(r=>r.id===id)) tab='shell';
      render();
    },
    destroy() { container.replaceChildren(); container.classList.remove('renovation-workspace'); },
  };
}
