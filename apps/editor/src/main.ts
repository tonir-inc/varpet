import './ui/style.css';
import './ui/motion.css';
import './ui/designer-panel.css';
import { mountDesignerPanel, designerHttpAdapter } from './ui/designer-panel';
import type { AgentProposal, CatalogAsset, EditCommand, ObjectPatch, Operation, SceneDocument, SceneObject, ToolMode, ViewMode, ViewportLayer, WallMode } from './contracts';
import { demoScene, localCatalog } from './core/demo';
import { EditorStore } from './core/store';
import { expandFurnitureSelection, furnitureMembers } from './core/grouping';
import { validateScene } from './core/validation';
import { OPENING_MOVE_SNAP } from './core/opening-move';
import { loadLocal, parseScene, saveLocal, serializeScene } from './core/persistence';
import { catalogAdapter, designerAdapter as mockDesignerAdapter, structureAdapter } from './adapters/mock';
import { createViewport } from './render/viewport';
import { createFloorPlan } from './render/floor-plan';
import { createCatalogPreviews } from './render/catalog-previews';
import { icon } from './ui/icons';
import { createRenovationUI, type RenovationUI } from './ui/renovation';
import { createIntake } from './features/intake';
import { downloadText, projectReport, projectSchedule } from './features/handoff';
import { buildFinishOperations, getFinishPreset, type FinishPreset } from './core/finish-presets';
import { createMaterialsUI } from './ui/materials';
import { renderEntityInspector, renderAssetChoices } from './ui/inspector';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="app-header">
    <a class="brand" href="#" aria-label="Varpet home"><span class="brand-mark">v</span><span>varpet</span></a>
    <span class="header-divider"></span>
    <div class="project-name"><strong id="project-name">Apartment 01</strong><span>Local project</span></div>
    <div class="header-actions"><span id="save-state" class="save-state">Demo scene</span>
      <div class="history-buttons"><button id="undo" class="icon-button" title="Undo · ⌘Z" aria-label="Undo">${icon('undo')}</button><button id="redo" class="icon-button" title="Redo · ⌘⇧Z" aria-label="Redo">${icon('redo')}</button></div>
      <button id="file-menu" class="button quiet" aria-label="Project files">${icon('folder')} <span>File</span> <span class="caret">⌄</span></button>
      <button id="save" class="button primary" title="Save on this device · ⌘S">${icon('save')} <span>Save</span></button>
    </div>
  </header>
  <div class="workspace">
    <nav class="workspace-nav" aria-label="Workspace panels">
      <button id="scene-tab" class="nav-button active" aria-label="Scene panel" aria-expanded="true" aria-controls="scene-panel" title="Scene · 1">${icon('layers')}<span>Scene</span></button>
      <button id="renovation-tab" class="nav-button" aria-label="Renovation panel" aria-expanded="false" aria-controls="renovation-panel" title="Renovate · 4">${icon('walls')}<span>Renovate</span></button>
      <button id="assets-tab" class="nav-button" aria-label="Furniture panel" aria-expanded="false" aria-controls="assets-panel" title="Furniture · 2">${icon('sofa')}<span>Furniture</span></button>
      <button id="materials-tab" class="nav-button" aria-label="Materials panel" aria-expanded="false" aria-controls="materials-panel" title="Materials · 5">${icon('grid')}<span>Materials</span></button>
      <button id="assistant-tab" class="nav-button" aria-label="Assistant panel" aria-expanded="false" aria-controls="assistant-panel" title="Assistant · 3">${icon('sparkles')}<span>Assistant</span><i id="proposal-badge" class="nav-badge" hidden></i></button>
      <div class="nav-spacer"></div>
      <button id="integrations" class="nav-button" aria-label="Integrations" title="Integrations">${icon('connections')}<span>Connect</span></button>
      <button id="help" class="nav-button" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">${icon('help')}<span>Help</span></button>
    </nav>
    <aside class="left-panel" aria-labelledby="panel-title">
      <div class="panel-heading"><h1 id="panel-title">Scene</h1><button id="collapse-panel" class="icon-button" aria-label="Collapse sidebar" title="Collapse sidebar · [">${icon('panel-close')}</button></div>
      <section id="scene-panel" class="panel-content" aria-label="Scene explorer">
        <div class="scene-summary"><span id="scene-area">80 m²</span><span id="room-count">4 rooms</span><span><span id="object-count">20</span> objects</span></div>
        <label class="search">${icon('search')}<input id="scene-search" placeholder="Find an object…" aria-label="Search scene" /></label>
        <div class="scene-root">${icon('home')}<strong>Ground floor</strong><span class="pill">3D</span></div>
        <div id="hierarchy" class="hierarchy"></div>
        <button id="browse-assets" class="button full">${icon('plus')} Add furniture <span class="shortcut">2</span></button>
        <button id="edit-shell" class="button full" style="margin-top:8px">${icon('walls')} Edit apartment & systems <span class="shortcut">4</span></button>
        <div class="structure-note">${icon('layers')} Your apartment, explained<span>Renovate lets you correct walls and openings, review assumptions, compare options and plan services.</span></div>
      </section>
      <section id="assets-panel" class="panel-content" aria-label="Furniture library" hidden>
        <div class="section-title"><span>Furniture library</span><span id="asset-count" class="count"></span></div>
        <label class="search">${icon('search')}<input id="asset-search" placeholder="Search furniture…" aria-label="Search furniture" /></label>
        <div id="asset-categories" class="category-list" aria-label="Furniture categories"></div>
        <div id="catalog-scroll"><div id="asset-list" class="asset-list"></div></div>
        <p class="muted catalog-note">Click a piece to add it to your space.</p>
      </section>
      <section id="assistant-panel" class="panel-content" aria-label="Design assistant" hidden>
        <section class="assistant-card"><div class="assistant-heading"><span class="assistant-icon">${icon('sparkles')}</span><div><strong>Design together</strong><span>Design assistant <span class="mock-label">DEMO</span></span></div></div><p>Explore a change to your apartment. Review the proposal before applying it.</p><button id="suggest" class="button suggestion">${icon('sparkles')} Suggest an edit ${icon('arrow')}</button><div id="proposal" aria-live="polite"></div></section>
        <div class="assistant-note">${icon('lock')} You're in control. Every change needs your approval and can be undone.</div>
      </section>
      <section id="renovation-panel" class="panel-content" aria-label="Apartment renovation workspace" hidden></section>
      <section id="materials-panel" class="panel-content" aria-label="Surface materials" hidden></section>
    </aside>
    <main class="viewport-shell" aria-label="Apartment editor">
      <div id="viewport"></div>
      <div id="floor-plan" hidden></div>
      <div class="viewport-top"><div class="view-switch" role="group" aria-label="Apartment view"><button id="perspective" class="active" aria-pressed="true" title="Perspective camera">${icon('cube')} 3D</button><button id="top-view" aria-pressed="false" title="Orthographic camera">${icon('top')} Top</button><button id="plan-view" aria-pressed="false" title="Floor plan with room dimensions">${icon('room')} Plan</button></div><div class="view-options"><button id="walls" title="Cycle wall visibility">${icon('walls')} <span>Cutaway</span></button><button id="quality" aria-pressed="false" title="Toggle rendering quality">${icon('sun')} <span>Balanced</span></button><button id="preview" aria-pressed="false" title="Preview apartment · P">${icon('eye')} <span>Preview</span></button></div></div>
      <div class="canvas-label">${icon('layers')} <span>Ground floor</span><span class="pill">1 level</span></div>
      <div class="selection-chip" hidden><span id="selected-name"></span><button id="focus-selected" class="icon-button" aria-label="Frame selected object" title="Frame selection · F">${icon('focus')}</button></div>
      <div class="tool-rail" role="toolbar" aria-label="Object tools">${(['select','move','rotate','scale'] as ToolMode[]).map((tool, i) => `<button data-tool="${tool}" class="${i === 0 ? 'active' : ''}" aria-label="${{select:'Select',move:'Move',rotate:'Rotate',scale:'Resize'}[tool]} tool" title="${{select:'Select · V',move:'Move · G',rotate:'Rotate · R',scale:'Resize · S'}[tool]}">${icon(tool)}<kbd>${['V','G','R','S'][i]}</kbd></button>`).join('')}<div class="tool-divider"></div><button id="focus" aria-label="Focus selection" title="Frame selection / apartment · F">${icon('focus')}<kbd>F</kbd></button><div class="tool-divider"></div><button id="snap" aria-pressed="true" class="snap active" title="Toggle grid snapping">${icon('grid')}<strong>0.25 m</strong></button></div>
      <div class="canvas-bottom"><span id="view-hint">Drag to orbit <b>·</b> Right drag to pan <b>·</b> Scroll to zoom</span></div>
      <aside class="right-panel" aria-label="Selection properties" hidden><div class="inspector-heading"><span>Properties</span><button id="close-inspector" class="icon-button" aria-label="Close properties" title="Clear selection · Esc">${icon('close')}</button></div><div id="inspector" class="inspector"></div></aside>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <div id="render-error" class="render-error" hidden></div>
    </main>
  </div>
  <footer class="status-bar"><span><i class="connection-dot"></i> <span id="status-text">All changes stay on this device</span></span><span id="selection-status">Select an item to edit</span><span>Metres <b>·</b> <span id="revision">Revision 0</span></span></footer>
  <input id="file-input" type="file" accept=".json,application/json" hidden />
  <dialog id="modal"><div id="modal-content"></div></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const uid = () => crypto.randomUUID();
let catalog: CatalogAsset[] = localCatalog;
const store = new EditorStore(demoScene, catalog);
const designerAdapter = import.meta.env.VITE_DESIGNER_URL ? designerHttpAdapter : mockDesignerAdapter;
let selectedId: string | null = null;
let selectedFurnitureIds: string[] = [];
let tool: ToolMode = 'select';
type ApartmentView = ViewMode | 'plan';
let view: ApartmentView = 'perspective';
let previewReturnView: ApartmentView | null = null;
let wallMode: WallMode = 'cutaway';
let snap = true;
let interacting = false;
let interactionRevision = 0;
let savedRevision = -1;
let pending: AgentProposal | null = null;
let busy = false;
let assetCategory = 'All';
let toastTimer: ReturnType<typeof setTimeout>;
type Panel = 'scene' | 'assets' | 'assistant' | 'renovation' | 'materials';
let activePanel: Panel = 'scene';
let panelOpen = true;
let previewMode = false;
let proposalView = false;
let renovationUI: RenovationUI | undefined;
let activeFinish: FinishPreset | null = null;
const collapsedRooms = new Set<string>();
const catalogPreviews = createCatalogPreviews($('#catalog-scroll'));

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
  onFinish: (presetId, target) => {
    if (previewMode || proposalView || view === 'plan') return false;
    const preset = getFinishPreset(presetId); if (!preset) return false;
    try {
      const operations = buildFinishOperations(store.scene, preset, target.entityId, target.surface);
      if (!operations.length) { notify(`${preset.name} is already applied here.`); return false; }
      return run(operations, `Apply ${preset.name} to ${entityName(target.entityId) ?? 'surface'}`);
    } catch (error) { notify(error instanceof Error ? error.message : 'This finish could not be applied.', true); return false; }
  },
  onSelect: (id, additive) => { if (!previewMode) select(id, additive); },
  onTransform: (id, patch) => {
    run([{type:'update', id, patch}], `Transform ${store.scene.objects.find(o => o.id === id)?.name ?? 'object'}`, interactionRevision);
    viewport.setScene(store.scene, catalog);
    viewport.setSelection(selectedId, selectedFurnitureIds);
  },
  onInteraction: active => { interacting = active; if (active) interactionRevision = store.revision; renderProposal(); },
  onWallMove: (id, start, end) => {
    run([{ type: 'update-wall', id, patch: { start, end } }], 'Move connected wall', interactionRevision);
    viewport.setScene(store.scene, catalog);
  },
  onWallEndpoint: (id, endpoint, point) => {
    run([{ type: 'update-wall', id, patch: { [endpoint]: point } }], 'Correct wall endpoint', interactionRevision);
    viewport.setScene(store.scene, catalog);
  },
  onOpeningMove: (id, offset) => {
    const opening = store.scene.walls.flatMap(w => w.openings).find(o => o.id === id);
    run([{ type: 'update-opening', id, patch: { offset } }], `Move ${opening?.kind ?? 'opening'} along wall`, interactionRevision);
    viewport.setScene(store.scene, catalog);
    viewport.setSelection(selectedId, selectedFurnitureIds);
  },
  onComponentTransform: (id, patch) => {
    const component = store.scene.project?.components.find(c => c.id === id);
    if (component) run([{ type: 'upsert-component', component: { ...component, ...patch } }], `Transform ${component.name}`, interactionRevision);
    viewport.setScene(store.scene, catalog); viewport.setSelection(selectedId, selectedFurnitureIds);
  },
  onError: message => notify(message, true),
});
const floorPlan = createFloorPlan($('#floor-plan'), id => select(id), {
  onInteraction: active => { interacting = active; if (active) interactionRevision = store.revision; renderProposal(); },
  onCommit: (operation, label) => { run([operation], label, interactionRevision); },
  onError: message => notify(message, true),
  onSnapChange: enabled => { snap = enabled; viewport.setSnap(snap); renderViewportHints(); renderInspector(); },
});
const materialsUI = createMaterialsUI($('#materials-panel'), {
  onChoose: preset => chooseFinish(preset),
  onDragStart: preset => chooseFinish(preset),
  onDragEnd: () => chooseFinish(null),
});

function chooseFinish(preset: FinishPreset | null) {
  if (preset && previewMode) { notify('Exit preview to apply materials.'); return; }
  if (preset) {
    if (view === 'plan' || (view === 'top' && preset.category === 'wall')) setView('perspective');
    setTool('select');
    // Paint needs a visible wall face; a cutaway exposes only a narrow stub.
    if (preset.category === 'wall' && wallMode !== 'full') {
      wallMode = 'full'; viewport.setWalls(wallMode); $('#walls span').textContent = 'Full walls';
    }
  }
  activeFinish = preset;
  materialsUI.setActive(preset?.id ?? null);
  viewport.setFinishBrush(preset?.id ?? null);
  renderViewportHints();
}

function focusView(id?: string) {
  if (view === 'plan') floorPlan.focus(id);
  else viewport.focus(id);
}

function run(operations: Operation[], label: string, revision = store.revision) {
  if (previewMode) { notify('Exit preview to edit the apartment.'); return false; }
  const command: EditCommand = {id:uid(), label, source:'human', baseRevision:revision, operations};
  const result = store.execute(command, true);
  if (!result.ok) notify(result.errors.join(' '), true);
  else if (result.warnings.length) notify(`${label}. ${result.warnings[0]}`);
  else notify(label);
  return result.ok;
}

function entityName(id: string): string | undefined {
  const scene = store.scene;
  const object = scene.objects.find(o => o.id === id); if (object) return object.name;
  const room = scene.rooms.find(r => r.id === id); if (room) return room.name;
  const wall = scene.walls.find(w => w.id === id); if (wall) return scene.project?.metadata[id]?.name ?? `Wall ${scene.walls.indexOf(wall) + 1}`;
  const opening = scene.walls.flatMap(w => w.openings).find(o => o.id === id); if (opening) return scene.project?.metadata[id]?.name ?? `${opening.kind} · ${scene.project?.metadata[id]?.role ?? id}`;
  return scene.project?.components.find(c => c.id === id)?.name ?? scene.project?.routes.find(r => r.id === id)?.name;
}

const intake = createIntake({
  getScene: () => store.scene, getCatalog: () => catalog, getRevision: () => store.revision,
  execute: (label, operations, revision) => run(operations, label, revision), notice: notify,
  propose: (scene, title, description, revision) => {
    pending = { id: uid(), title, description, command: { id: uid(), label: title, source: 'architect', baseRevision: revision, operations: [{ type: 'replace-scene', scene }] } };
    switchPanel('assistant'); renderProposal(); notify('Reconstruction ready. Inspect it in 3D, then apply or dismiss.');
  },
});

function exportProject(kind: 'project' | 'schedule' | 'report') {
  if (kind === 'project') downloadText('varpet-apartment.json', serializeScene(store.scene), 'application/json');
  else if (kind === 'schedule') downloadText('varpet-renovation-schedule.csv', projectSchedule(store.scene, catalog), 'text/csv;charset=utf-8');
  else downloadText('varpet-renovation-review.html', projectReport(store.scene, catalog), 'text/html;charset=utf-8');
  notify(`${{ project: 'Project with evidence', schedule: 'Renovation schedule', report: 'Review report' }[kind]} exported`);
}

renovationUI = createRenovationUI($('#renovation-panel'), {
  getScene: () => store.scene, getCatalog: () => catalog,
  execute: (label, operations) => run(operations, label), select,
  focus: id => focusView(id), notice: notify,
  testDoor: (id, angle) => viewport.setDoorAngle(id, angle), getDoorAngle: id => viewport.getDoorAngle(id),
  toggleSwitch: id => viewport.toggleSwitch(id), setSwitchLevel: (id, level) => viewport.setSwitchLevel(id, level), getSwitchLevel: id => viewport.getSwitchLevel(id), onSources: () => intake.sources(), onReconstruct: () => intake.reconstruction(), onExport: exportProject,
  onLayer: (name, enabled) => viewport.setLayer(name as ViewportLayer, enabled),
  onComparison: enabled => viewport.setComparison(enabled),
});

function selectionLabel(): string {
  if (selectedFurnitureIds.length > 1) return `${selectedFurnitureIds.length} objects${selectedGroupId() ? ' · Group' : ' selected'}`;
  return selectedId ? entityName(selectedId) ?? '' : 'Nothing selected';
}
function selectedGroupId(): string | undefined {
  const objects = store.scene.objects.filter(object => selectedFurnitureIds.includes(object.id));
  const id = objects[0]?.groupId;
  return id && objects.length > 1 && objects.every(object => object.groupId === id) ? id : undefined;
}
function select(id: string | null, additive = false) {
  const members = id ? furnitureMembers(store.scene, id).map(object => object.id) : [];
  if (additive && members.length) {
    const remove = members.every(member => selectedFurnitureIds.includes(member));
    selectedFurnitureIds = remove ? selectedFurnitureIds.filter(member => !members.includes(member))
      : [...new Set([...selectedFurnitureIds, ...members])];
    selectedId = remove ? selectedFurnitureIds.at(-1) ?? null : id;
  } else if (additive && !id) return;
  else { selectedId = id && entityName(id) ? id : null; selectedFurnitureIds = members; }
  viewport.setSelection(selectedId, selectedFurnitureIds);
  floorPlan.setSelection(selectedId);
  $('#hierarchy').querySelectorAll<HTMLButtonElement>('[data-object]').forEach(button => {
    const selected = selectedFurnitureIds.includes(button.dataset.object!);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    const dot = button.querySelector<HTMLElement>('.selected-dot');
    if (dot) dot.hidden = !selected;
  });
  renderInspector();
  renovationUI?.setSelection(selectedId);
  $('#selection-status').textContent = selectionLabel();
  renderViewportHints();
}
function groupSelected() {
  if (interacting || previewMode || selectedFurnitureIds.length < 2 || selectedGroupId()) return;
  if (run([{ type: 'group', id: uid(), objectIds: [...selectedFurnitureIds] }], 'Group furniture')) {
    select(selectedId); setTool('move');
  }
}
function ungroupSelected() {
  if (interacting || previewMode) return;
  const groupIds = [...new Set(store.scene.objects.filter(object => selectedFurnitureIds.includes(object.id)).map(object => object.groupId).filter((id): id is string => !!id))];
  if (groupIds.length && run(groupIds.map(id => ({ type: 'ungroup', id })), 'Ungroup furniture')) select(selectedId);
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
  const search = $<HTMLInputElement>('#scene-search').value.trim().toLowerCase();
  const assigned = new Set<string>();
  const row = (o: SceneObject) => `<button class="object-row ${selectedFurnitureIds.includes(o.id) ? 'selected' : ''}" data-object="${escape(o.id)}" aria-pressed="${selectedFurnitureIds.includes(o.id)}">${icon(o.groupId ? 'layers' : 'box')}<span>${escape(o.name)}</span><span class="selected-dot" ${selectedFurnitureIds.includes(o.id)?'':'hidden'}></span></button>`;
  $('#hierarchy').innerHTML = scene.rooms.map(room => {
    const objects = scene.objects.filter(o => !assigned.has(o.id) && inRoom(o.position[0],o.position[2],room.polygon));
    objects.forEach(o => assigned.add(o.id));
    const matches = room.name.toLowerCase().includes(search) ? objects : objects.filter(o => o.name.toLowerCase().includes(search));
    if (search && !matches.length) return '';
    return `<details data-room="${escape(room.id)}" ${search || !collapsedRooms.has(room.id) ? 'open' : ''}><summary><span class="room-chevron">⌄</span>${icon('room')}<span>${escape(room.name)}</span><span class="count">${objects.length}</span></summary><div class="room-objects">${matches.map(row).join('')}</div></details>`;
  }).join('') + scene.objects.filter(o=>!assigned.has(o.id) && o.name.toLowerCase().includes(search)).map(row).join('');
  if (!$('#hierarchy').innerHTML) $('#hierarchy').innerHTML = '<p class="empty-message">No matching objects.</p>';
  $('#object-count').textContent = String(scene.objects.length);
  $('#hierarchy').querySelectorAll<HTMLDetailsElement>('[data-room]').forEach(details => details.ontoggle = () => {
    if (!search) { if (details.open) collapsedRooms.delete(details.dataset.room!); else collapsedRooms.add(details.dataset.room!); }
  });
  $('#hierarchy').querySelectorAll<HTMLButtonElement>('[data-object]').forEach(button => {
    button.onclick = event => select(button.dataset.object!, event.shiftKey);
    button.ondblclick = () => focusView(button.dataset.object!);
  });
}

function renderInspector() {
  const object = store.scene.objects.find(o=>o.id===selectedId);
  const name = selectedId ? entityName(selectedId) : undefined;
  $('.right-panel').hidden = !name;
  $('.selection-chip').hidden = !name;
  $('#selected-name').textContent = name ? selectionLabel() : '';
  const inspectorOptions = {
    getScene: () => store.scene, getCatalog: () => catalog, execute: run,
    notice: notify, refresh: renderInspector,
    advanced: () => { switchPanel('renovation'); renovationUI?.setSelection(selectedId); },
    getDoorAngle: (id: string) => viewport.getDoorAngle(id),
    testDoor: (id: string, angle: number) => viewport.setDoorAngle(id, angle),
    onFinishDragStart: (preset: FinishPreset) => chooseFinish(preset),
    onFinishDragEnd: () => chooseFinish(null),
  };
  if (!object) {
    if (!selectedId || !renderEntityInspector($('#inspector'), selectedId, inspectorOptions)) $('#inspector').innerHTML = '';
    return;
  }
  if (selectedFurnitureIds.length > 1) {
    const grouped = !!selectedGroupId();
    const members = store.scene.objects.filter(item => selectedFurnitureIds.includes(item.id));
    $('#inspector').innerHTML = `<div class="selected-asset-heading"><span class="asset-symbol">${icon('layers')}</span><div><span class="eyebrow">${grouped ? 'Furniture group' : 'Multiple selection'}</span><h2>${members.length} objects</h2></div></div>
      <p class="field-note">${grouped ? 'Move or rotate any member to arrange the whole group.' : 'Group these pieces to move and rotate them together.'}</p>
      <div class="property-section"><div class="property-label">Selected furniture</div><ul class="group-members">${members.map(item => `<li>${escape(item.name)}</li>`).join('')}</ul></div>
      ${grouped ? `<div class="property-section"><div class="property-label">Group position <span>m</span></div><div class="field-grid two"><label class="number-field"><span>X</span><input type="number" aria-label="Group position X" data-group-axis="0" value="${Number(object.position[0].toFixed(3))}" step="${snap ? '0.25' : '0.05'}"></label><label class="number-field"><span>Z</span><input type="number" aria-label="Group position Z" data-group-axis="2" value="${Number(object.position[2].toFixed(3))}" step="${snap ? '0.25' : '0.05'}"></label></div><p class="field-note">Position of ${escape(object.name)}; all members follow.</p></div><div class="property-section"><div class="property-label">Group rotation <span>degrees</span></div><label class="number-field"><span>Y</span><input id="group-rotation" type="number" aria-label="Group rotation" value="${Number((object.rotation * 180 / Math.PI).toFixed(3))}" step="15"></label></div>` : ''}
      <div class="object-actions"><button id="group-furniture" class="button primary" ${grouped ? 'hidden' : ''} title="Group · ⌘/Ctrl+G">${icon('layers')} Group</button><button id="ungroup-furniture" class="button" ${members.some(item => item.groupId) ? '' : 'hidden'} title="Ungroup · ⌘/Ctrl+Shift+G">Ungroup</button></div>
      <button id="delete-group" class="button full danger" style="margin-top:12px">${icon('trash')} Delete ${grouped ? 'group' : 'selected objects'}</button>
      <p class="field-note">Shift-click to add or remove furniture.${grouped ? ' Ungroup to edit or resize individual pieces.' : ''}</p>`;
    $('#group-furniture').onclick = groupSelected;
    $('#ungroup-furniture').onclick = ungroupSelected;
    $('#delete-group').onclick = deleteSelected;
    $('#inspector').querySelectorAll<HTMLInputElement>('[data-group-axis]').forEach(input => input.onchange = () => {
      if (!Number.isFinite(input.valueAsNumber)) { notify('Enter a finite number.', true); renderInspector(); return; }
      const position = [...object.position] as SceneObject['position'];
      position[Number(input.dataset.groupAxis)] = snap ? Math.round(input.valueAsNumber * 4) / 4 : input.valueAsNumber;
      updateSelected({ position }, 'Move furniture group');
    });
    if (grouped) $<HTMLInputElement>('#group-rotation').onchange = event => {
      const value = (event.target as HTMLInputElement).valueAsNumber;
      if (!Number.isFinite(value)) { notify('Enter a finite number.', true); renderInspector(); return; }
      updateSelected({ rotation: value * Math.PI / 180 }, 'Rotate furniture group');
    };
    return;
  }
  const asset=catalog.find(a=>a.id===object.assetId)!;
  const dimension=asset.dimensions.map((d,i)=>d*object.scale[i]!);
  const field=(name:string,label:string,value:number,step:string,min?:string)=>`<label class="number-field"><span>${label}</span><input type="number" aria-label="${name}" data-field="${name}" value="${Number(value.toFixed(3))}" step="${step}" ${min ? `min="${min}"` : ''}/></label>`;
  $('#inspector').innerHTML = `<div class="selected-asset-heading"><span class="asset-symbol" style="--asset-color:${escape(object.color??asset.color)}">${icon('box')}</span><div><span class="eyebrow">${escape(asset.category)}</span><h2>${escape(object.name)}</h2></div></div><p class="field-note">Shift-click other furniture to select pieces for a group.</p><div id="inspector-replacement"></div><label class="text-field">Object name<input id="object-name" value="${escape(object.name)}" maxlength="80" /></label><div class="property-section"><div class="property-label">Position <span>m</span></div><div class="field-grid two">${field('Position X','X',object.position[0],snap?'0.25':'0.05')}${field('Position Z','Z',object.position[2],snap?'0.25':'0.05')}</div><p class="field-note">${icon('lock')} Grounded on the floor</p></div><div class="property-section"><div class="property-label">Rotation <span>degrees</span></div>${field('Rotation','Y',(object.rotation*180/Math.PI)%360,'15')}</div><div class="property-section"><div class="property-label">Dimensions <span>m</span></div><div class="field-grid">${field('Width','W',dimension[0]!,'0.05','0.05')}${field('Height','H',dimension[1]!,'0.05','0.05')}${field('Depth','D',dimension[2]!,'0.05','0.05')}</div></div><div class="property-section"><div class="property-label">Finish <span>base material</span></div><div class="finish-row"><input id="object-color" type="color" aria-label="Object finish color" value="${escape(object.color??asset.color)}"/><span>${escape(object.color??asset.color)}</span><button id="reset-finish" class="text-button">Reset</button></div></div><div class="object-actions"><button id="duplicate" class="button">${icon('duplicate')} Duplicate</button><button id="delete" class="button danger" title="Delete object" aria-label="Delete object">${icon('trash')}</button></div><div class="asset-reference"><span>Catalog reference</span><code>${escape(asset.id)}</code><span>Approx. catalog price <strong>$${asset.price.toLocaleString()}</strong></span></div>`;
  renderAssetChoices($('#inspector-replacement'), object, inspectorOptions);
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
function deleteSelected() {
  if (!selectedId || interacting) return;
  if (!selectedFurnitureIds.length) { notify('Use the element’s delete controls in Renovate to review its dependencies.'); return; }
  if (selectedFurnitureIds.length > 100) { notify('Ungroup and delete fewer than 100 pieces at a time.', true); return; }
  if (run(selectedFurnitureIds.map(id => ({type:'delete', id})), selectedFurnitureIds.length > 1 ? 'Delete selected furniture' : 'Delete object')) select(null);
}
function addAsset(asset:CatalogAsset, original?:SceneObject) {
  if(interacting)return;
  if(store.scene.objects.length>=400){notify('This editor supports up to 400 furnishings.',true);return;}
  const object:SceneObject=original? structuredClone(original):{id:'',name:asset.name,assetId:asset.id,position:[0,0,0],rotation:0,scale:[1,1,1]};
  object.id=uid();delete object.groupId;if(original)object.name=`${original.name} copy`;
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
    if(validation.ok){if(run([{type:'add',object:structuredClone(object)}],original?'Duplicate object':`Add ${asset.name}`)){select(object.id);setTool('move');viewport.animatePlacement(object.id);notify(`${object.name} added. Drag the arrows to place it.${validation.warnings.length?' '+validation.warnings[0]:''}`);}return;}
    lastErrors=validation.errors;
    if(performance.now()-start>150)break;
  }
  notify(`No nearby supported floor position found. ${lastErrors[0]??''}`,true);
}
function duplicateSelected(){if(selectedFurnitureIds.length>1){notify('Ungroup to duplicate an individual piece.');return;}const o=store.scene.objects.find(o=>o.id===selectedId);const a=catalog.find(a=>a.id===o?.assetId);if(o&&a)addAsset(a,o);}

function renderAssets(){
  const search=$<HTMLInputElement>('#asset-search').value.toLowerCase();
  $('#asset-count').textContent=String(catalog.length);
  $('#asset-categories').innerHTML=['All',...new Set(catalog.map(a=>a.category))].map(c=>`<button class="${assetCategory===c?'active':''}" aria-pressed="${assetCategory===c}" data-category="${escape(c)}">${escape(c)}</button>`).join('');
  $('#asset-categories').querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.onclick=()=>{assetCategory=b.dataset.category!;$('#catalog-scroll').scrollTop=0;renderAssets();});
  const items=catalog.filter(a=>(assetCategory==='All'||a.category===assetCategory)&&`${a.name} ${a.category}`.toLowerCase().includes(search));
  $('#asset-list').innerHTML=items.length?items.map(a=>`<button class="asset-card" data-asset="${escape(a.id)}" aria-label="Add ${escape(a.name)}"><div class="asset-preview" data-preview="${escape(a.id)}">${icon(a.kind==='sofa'?'sofa':'box')}</div><span class="asset-add" aria-hidden="true">+</span><strong class="asset-title">${escape(a.name)}</strong><span class="asset-meta"><span>${a.dimensions[0]} × ${a.dimensions[2]} m</span><span class="asset-price">$${a.price.toLocaleString()}</span></span></button>`).join(''):'<p class="empty-message">No matching furniture. Try another search.</p>';
  $('#asset-list').querySelectorAll<HTMLButtonElement>('[data-asset]').forEach(b=>b.onclick=()=>{const asset=catalog.find(a=>a.id===b.dataset.asset);if(asset)addAsset(asset);});
  catalogPreviews.setAssets(catalog);
}
function switchPanel(panel:Panel, toggle=false){
  if (panel !== 'materials' && activeFinish) chooseFinish(null);
  panelOpen=toggle && activePanel===panel ? !panelOpen : true;
  if (!panelOpen && activeFinish) chooseFinish(null);
  activePanel=panel;
  $('.workspace').classList.toggle('left-collapsed',!panelOpen);
  $('.left-panel').hidden=!panelOpen;
  $('.workspace').classList.toggle('renovation-active', panel === 'renovation' && panelOpen);
  for(const name of ['scene','assets','assistant','renovation','materials']){
    $(`#${name}-panel`).hidden=panel!==name;
    $(`#${name}-tab`).classList.toggle('active',panel===name && panelOpen);
    $(`#${name}-tab`).setAttribute('aria-expanded',String(panel===name && panelOpen));
  }
  $('#panel-title').textContent={scene:'Scene',assets:'Furniture',assistant:'Assistant',renovation:'Renovation studio',materials:'Materials'}[panel];
  if(panel==='assets' && panelOpen)renderAssets();
  if(panel==='renovation' && panelOpen)renovationUI?.render();
}
function renderViewportHints() {
  if (activeFinish && !previewMode) {
    $('#view-hint').textContent = `${activeFinish.name} · Click ${activeFinish.category === 'floor' ? 'a floor' : 'a wall face'} to apply · Esc to cancel`;
    return;
  }
  if (view === 'plan') {
    $('#view-hint').textContent = 'Drag items to move · Empty floor / Alt-drag to pan · Esc to cancel · F to frame';
    return;
  }
  const openingWall = store.scene.walls.find(w => w.openings.some(o => o.id === selectedId));
  const opening = openingWall?.openings.find(o => o.id === selectedId);
  const wall = store.scene.walls.find(w => w.id === selectedId);
  const fineSnap = tool === 'move' && !!(opening || wall);
  const snapStep = fineSnap ? OPENING_MOVE_SNAP : 0.25;
  $('#snap').classList.toggle('active', snap);
  $('#snap').setAttribute('aria-pressed', String(snap));
  $('#snap').innerHTML = `${icon('grid')}<strong>${snap ? `${snapStep.toFixed(2)} m` : 'Off'}</strong>`;
  $('#snap').title = `Toggle ${snapStep.toFixed(2)} m snapping${opening && tool === 'move' ? ' along wall' : ''}`;
  $('#snap').setAttribute('aria-label', `${snap ? 'Disable' : 'Enable'} ${snapStep.toFixed(2)} m snapping`);

  const navigation = view === 'top' ? 'Drag to pan <b>·</b> Scroll to zoom <b>·</b> F to frame' : 'Drag to orbit <b>·</b> Right drag to pan <b>·</b> Scroll to zoom';
  let hint = navigation;
  if (previewMode) hint = `${navigation} <b>·</b> P or Esc to exit preview`;
  else if (selectedFurnitureIds.length > 1) {
    hint = selectedGroupId() ? 'Move or rotate the group <b>·</b> Shift-click to change selection <b>·</b> Ungroup to edit a piece' : 'Choose Group or press ⌘/Ctrl+G <b>·</b> Shift-click to change selection';
  } else if (selectedFurnitureIds.length === 1) {
    hint = `${navigation} <b>·</b> Shift-click furniture to group pieces`;
  } else if (opening && openingWall) {
    if (store.scene.project?.metadata[opening.id]?.locked || store.scene.project?.metadata[openingWall.id]?.locked) {
      hint = 'Opening or wall is locked <b>·</b> Unlock model editing in Renovate to move it';
    } else if (tool === 'move') {
      hint = `Drag the ${opening.kind} or purple arrows along its wall <b>·</b> Esc cancels`;
    } else {
      hint = `Choose Move or press G to move this ${opening.kind} along its wall`;
    }
  } else if (wall && tool === 'move') {
    hint = store.scene.project?.metadata[wall.id]?.locked
      ? 'Wall is locked <b>·</b> Unlock model editing in Renovate to move it'
      : 'Drag the wall or purple center arrows <b>·</b> Connected walls follow <b>·</b> Esc cancels';
  }
  $('#view-hint').innerHTML = hint;
}
function setTool(next:ToolMode){if(next==='scale'&&selectedFurnitureIds.length>1){notify('Ungroup to resize individual furniture.');return;}if(activeFinish)chooseFinish(null);tool=next;viewport.setTool(tool);document.querySelectorAll<HTMLElement>('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));});renderViewportHints();}
function setView(next:ApartmentView){
  if (next === 'plan' && activeFinish) chooseFinish(null);
  if (next === 'plan' && previewMode) setPreview(false);
  viewport.cancelInteraction();
  view=next;
  const isPlan = view === 'plan';
  $('.viewport-shell').classList.toggle('plan-mode', isPlan);
  $('#viewport').hidden = isPlan;
  $('#floor-plan').hidden = !isPlan;
  floorPlan.setVisible(isPlan);
  if (view !== 'plan') viewport.setView(view);
  for (const [id, mode] of [['perspective','perspective'],['top-view','top'],['plan-view','plan']]) {
    $(`#${id}`).classList.toggle('active',view===mode);
    $(`#${id}`).setAttribute('aria-pressed',String(view===mode));
  }
  renderViewportHints();
}
function setPreview(enabled:boolean){
  if (activeFinish) chooseFinish(null);
  viewport.cancelInteraction();
  if (enabled) {
    previewReturnView = view;
    if (view === 'plan') setView('perspective');
  }
  if (!enabled && proposalView) { proposalView = false; viewport.setScene(store.scene, catalog); $<HTMLButtonElement>('#save').disabled = false; }
  previewMode=enabled;
  select(null);
  app.classList.toggle('preview-mode',enabled);
  $('#preview').setAttribute('aria-pressed',String(enabled));
  $('#preview').classList.toggle('active',enabled);
  $('#preview').innerHTML=`${icon(enabled?'close':'eye')} <span>${enabled?'Exit preview':'Preview'}</span>`;
  $<HTMLButtonElement>('#file-menu').disabled=enabled;
  $<HTMLButtonElement>('#undo').disabled=enabled||!store.canUndo;
  $<HTMLButtonElement>('#redo').disabled=enabled||!store.canRedo;
  viewport.setTool(enabled?'select':tool);
  if (!enabled && previewReturnView) {
    const previousView = previewReturnView;
    previewReturnView = null;
    setView(previousView);
  }
  requestAnimationFrame(()=>focusView());
}

function renderProposal(){
  $('#proposal-badge').hidden=!pending;
  const el=$('#proposal');if(!pending){el.innerHTML='';return;}
  const stale=pending.command.baseRevision!==store.revision;
  const canInspect = pending.command.operations.some(o => o.type === 'replace-scene' || o.type === 'replace-structure');
  el.innerHTML=`<div class="proposal"><span class="eyebrow">${pending.command.source==='architect'?'RECONSTRUCTION REVIEW':'PROPOSED CHANGE'}</span><strong>${escape(pending.title)}</strong><p>${escape(pending.description)}</p>${stale?'<p class="proposal-warning">The scene has changed. Request a fresh proposal.</p>':interacting?'<p class="proposal-warning">Finish your current edit before applying.</p>':''}${canInspect?`<button id="inspect-proposal" class="button full" ${stale||interacting?'disabled':''}>Inspect proposed 3D apartment</button>`:''}<div><button id="apply-proposal" class="button primary" ${stale||interacting||previewMode?'disabled':''}>Apply change</button><button id="reject-proposal" class="button quiet">Dismiss</button></div></div>`;
  $('#apply-proposal').onclick=()=>{if(!pending||interacting||previewMode)return;const proposal=pending;const result=store.execute(proposal.command,true);if(result.ok){pending=null;renderProposal();select(null);focusView();notify(`${proposal.title} applied`);}else notify(result.errors.join(' '),true);};
  if(canInspect)$('#inspect-proposal').onclick=()=>{
    if(!pending||pending.command.baseRevision!==store.revision||interacting)return;
    let proposed:SceneDocument=structuredClone(store.scene);
    for(const op of pending.command.operations){if(op.type==='replace-scene')proposed=op.scene;else if(op.type==='replace-structure'){proposed.rooms=op.rooms;proposed.walls=op.walls;}}
    setPreview(true);proposalView=true;$<HTMLButtonElement>('#save').disabled=true;viewport.setScene(proposed,catalog);focusView();notify('Proposed apartment preview. Exit Preview to apply or dismiss it.');
  };
  $('#reject-proposal').onclick=()=>{pending=null;renderProposal();notify('Proposal dismissed');};
}
async function requestProposal(kind:'designer'|'architect'){
  if(busy)return;switchPanel('assistant');busy=true;$<HTMLButtonElement>('#suggest').disabled=true;$('#suggest').innerHTML=`${icon('sparkles')} Considering your space…`;
  const revision=store.revision;const scene=store.scene;
  try{
    if(kind==='designer')pending=await designerAdapter.propose(scene,revision);
    else{const result=await structureAdapter.reconstruct();pending={id:uid(),title:'Import reconstructed structure',description:result.notes.join(' '),command:{id:uid(),label:'Import structure',source:'architect',baseRevision:revision,operations:[{type:'replace-structure',rooms:result.rooms,walls:result.walls}]}};}
    renderProposal();notify('Proposal ready in Assistant. Review before applying.');
  }catch(error){notify(error instanceof Error?error.message:String(error),true);}
  finally{busy=false;$<HTMLButtonElement>('#suggest').disabled=false;$('#suggest').innerHTML=`${icon('sparkles')} Suggest an edit ${icon('arrow')}`;}
}

function refresh(){
  const scene=store.scene;
  selectedFurnitureIds = expandFurnitureSelection(scene, selectedFurnitureIds);
  if(selectedId&&!entityName(selectedId))selectedId=null;
  viewport.setScene(scene,catalog);viewport.setSelection(selectedId, selectedFurnitureIds);
  floorPlan.setScene(scene,catalog);floorPlan.setSelection(selectedId);
  $('#project-name').textContent=scene.name;
  const area=scene.rooms.reduce((sum,r)=>sum+Math.abs(r.polygon.reduce((a,p,i)=>{const q=r.polygon[(i+1)%r.polygon.length]!;return a+p[0]*q[1]-q[0]*p[1];},0))/2,0);
  $('#scene-area').textContent=`${area.toFixed(0)} m²`;
  $('#room-count').textContent=`${scene.rooms.length} rooms`;
  $('#revision').textContent=`Revision ${store.revision}`;
  $<HTMLButtonElement>('#undo').disabled=previewMode||!store.canUndo;$<HTMLButtonElement>('#redo').disabled=previewMode||!store.canRedo;
  $('#save-state').textContent=store.revision===savedRevision?'Saved on this device':store.revision===0?'Demo scene':'Unsaved changes';
  renderHierarchy();renderInspector();renderProposal();
  renovationUI?.render();
  $('#selection-status').textContent=selectionLabel();
  renderViewportHints();
}
store.subscribe(refresh);
const designerHost = document.createElement('section');
$('#proposal').before(designerHost);
const designerPanel = mountDesignerPanel(designerHost, {
  live: Boolean(import.meta.env.VITE_DESIGNER_URL), snapshot: () => ({ scene: store.scene, revision: store.revision }),
  subscribe: listener => store.subscribe(listener), canRequest: () => !busy && !previewMode,
  onBusyChange: waiting => { busy = waiting; $<HTMLButtonElement>('#suggest').disabled = waiting; },
  onProposal: proposal => { pending = proposal; switchPanel('assistant'); renderProposal(); },
});
window.addEventListener('beforeunload', () => designerPanel.dispose());

const modal=$<HTMLDialogElement>('#modal');
function showModal(title:string,body:string){$('#modal-content').innerHTML=`<div class="modal-heading"><h2>${title}</h2><button id="close-modal" class="icon-button" aria-label="Close dialog">${icon('close')}</button></div>${body}`;$('#close-modal').onclick=()=>modal.close();modal.showModal();}
modal.onclick=e=>{if(e.target===modal)modal.close();};
$('#integrations').onclick=()=>{
  showModal('Sources & connections',`<p class="modal-intro">Local reconstruction tools are ready. Provider integrations remain explicit demo adapters until connected.</p><div class="file-actions"><button id="local-sources" class="button">${icon('upload')} Attach photos and plans</button><button id="local-reconstruct" class="button primary">${icon('walls')} Build the apartment shell</button></div><div class="integration-row"><span>${icon('walls')}</span><div><h3>Architect <span class="mock-label">DEMO</span></h3><p>Exercise the proposal workflow with the original demo structure.</p><button id="mock-structure" class="button">Preview demo structural import</button></div></div><div class="integration-row"><span>${icon('sparkles')}</span><div><h3>Designer <span class="mock-label">DEMO</span></h3><p>Propose validated edits against a scene revision. You approve each batch.</p><button id="mock-designer" class="button">Request demo design proposal</button></div></div><div class="integration-row"><span>${icon('box')}</span><div><h3>Catalog <span class="mock-label">DEMO</span></h3><p>Stable asset IDs, metre dimensions, material defaults, and procedural or GLB sources.</p><button id="mock-catalog" class="button">Refresh demo catalog</button></div></div><p class="modal-footnote">No network services or credentials are needed. A proposal becomes stale if the scene changes before approval.</p>`);
  $('#local-sources').onclick=()=>{modal.close();intake.sources();};$('#local-reconstruct').onclick=()=>{modal.close();intake.reconstruction();};
  $('#mock-structure').onclick=()=>{modal.close();void requestProposal('architect');};$('#mock-designer').onclick=()=>{modal.close();void requestProposal('designer');};
  $('#mock-catalog').onclick=async()=>{modal.close();try{catalog=await catalogAdapter.list();renderAssets();viewport.setScene(store.scene,catalog);switchPanel('assets');notify('Demo catalog refreshed');}catch(error){notify(String(error),true);}};
};
$('#file-menu').onclick=()=>{
  showModal('Your apartment project',`<p class="modal-intro">Save locally or carry your apartment, assumptions and source evidence as versioned JSON. Loading and reconstruction can be undone.</p><div class="file-actions"><button id="new-shell" class="button primary">${icon('walls')} Build an empty apartment</button><button id="open-local" class="button">${icon('folder')} Load saved scene</button><button id="import-json" class="button">${icon('upload')} Import project JSON</button><button id="export-json" class="button">${icon('download')} Export project with evidence</button><button id="export-report" class="button">${icon('download')} Export review report</button><button id="export-schedule" class="button">${icon('download')} Export schedule CSV</button><button id="reset-demo" class="button">${icon('home')} Restore furnished demo</button></div><p class="modal-footnote">Original source attachments are embedded in the project export. Catalog models remain references. Browser storage has a limited capacity; keep an exported copy.</p>`);
  $('#new-shell').onclick=()=>{modal.close();intake.reconstruction();};
  $('#open-local').onclick=()=>{try{const scene=loadLocal(catalog);if(!scene){notify('No saved scene yet. Use Save scene first.',true);return;}if(run([{type:'replace-scene',scene}],'Load saved scene')){savedRevision=store.revision;select(null);focusView();refresh();modal.close();}}catch(error){notify(String(error),true);}};
  $('#import-json').onclick=()=>{modal.close();$<HTMLInputElement>('#file-input').click();};
  $('#export-json').onclick=()=>{exportProject('project');modal.close();};$('#export-report').onclick=()=>{exportProject('report');modal.close();};$('#export-schedule').onclick=()=>{exportProject('schedule');modal.close();};
  $('#reset-demo').onclick=()=>{if(run([{type:'replace-scene',scene:demoScene}],'Restore furnished demo')){select(null);focusView();modal.close();}};
};
$('#file-input').onchange=async event=>{const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;const baseRevision=store.revision;try{if(file.size>24_000_000)throw new Error('Project file exceeds the 24 MB limit.');const scene=parseScene(await file.text(),catalog);if(run([{type:'replace-scene',scene}],'Import scene',baseRevision)){select(null);focusView();}}catch(error){notify(error instanceof Error?error.message:String(error),true);}finally{input.value='';}};
$('#save').onclick=()=>{try{saveLocal(store.scene);savedRevision=store.revision;refresh();notify('Scene saved on this device');}catch(error){notify(`Could not save: ${String(error)}`,true);}};
$('#undo').onclick=()=>{if(!interacting&&!previewMode){const r=store.undo();notify(r.ok?'Undo complete':r.errors.join(' '),!r.ok);}};$('#redo').onclick=()=>{if(!interacting&&!previewMode){const r=store.redo();notify(r.ok?'Redo complete':r.errors.join(' '),!r.ok);}};
$('#scene-tab').onclick=()=>switchPanel('scene',true);$('#assets-tab').onclick=()=>switchPanel('assets',true);$('#assistant-tab').onclick=()=>switchPanel('assistant',true);
$('#materials-tab').onclick=()=>switchPanel('materials',true);
$('#renovation-tab').onclick=()=>switchPanel('renovation',true);$('#edit-shell').onclick=()=>switchPanel('renovation');
$('#collapse-panel').onclick=()=>{switchPanel(activePanel,true);$(`#${activePanel}-tab`).focus();};
$('#browse-assets').onclick=()=>switchPanel('assets');
$('#asset-search').oninput=()=>{$('#catalog-scroll').scrollTop=0;renderAssets();};
$('#scene-search').oninput=renderHierarchy;
$('#close-inspector').onclick=()=>{viewport.cancelInteraction();select(null);$('#viewport canvas')?.focus();};
$('#focus-selected').onclick=()=>focusView(selectedId??undefined);
$('#preview').onclick=()=>setPreview(!previewMode);
$('#perspective').onclick=()=>setView('perspective');$('#top-view').onclick=()=>setView('top');$('#plan-view').onclick=()=>setView('plan');
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool as ToolMode));
$('#focus').onclick=()=>focusView(selectedId??undefined);
$('#snap').onclick=()=>{snap=!snap;viewport.setSnap(snap);floorPlan.setSnap(snap);renderViewportHints();renderInspector();};
$('#walls').onclick=()=>{wallMode=wallMode==='cutaway'?'full':wallMode==='full'?'hidden':'cutaway';viewport.setWalls(wallMode);$('#walls span').textContent={cutaway:'Cutaway',full:'Full walls',hidden:'Walls hidden'}[wallMode];};
let highQuality=false;$('#quality').onclick=()=>{highQuality=!highQuality;viewport.setQuality(highQuality?'high':'balanced');$('#quality span').textContent=highQuality?'High quality':'Balanced';$('#quality').setAttribute('aria-pressed',String(highQuality));};
$('#suggest').onclick=()=>void requestProposal('designer');
$('#help').onclick=()=>showModal('Keyboard & navigation',`<p class="modal-intro">Select walls, openings, rooms, furniture and systems in the canvas or Renovate panel. In Select mode, click a selected door or switch again to test it.</p><div class="shortcut-list">${[['1 / 2 / 3 / 4 / 5','Scene / Furniture / Assistant / Renovate / Materials'],['[','Toggle sidebar'],['P','Enter / exit preview'],['V / G / R / S','Select / Move / Rotate / Resize'],['F','Frame selection / apartment'],['⌘ / Ctrl + S','Save on this device'],['Shift + click','Add / remove furniture selection'],['⌘ / Ctrl + G','Group selected furniture'],['⌘ / Ctrl + Shift + G','Ungroup furniture'],['⌘ / Ctrl + D','Duplicate furniture'],['Delete / Backspace','Delete selected furniture'],['⌘ / Ctrl + Z','Undo'],['⌘ / Ctrl + Shift + Z','Redo'],['Esc','Cancel drag / clear selection / exit preview']].map(([key,label])=>`<div><span>${label}</span><kbd>${key}</kbd></div>`).join('')}</div><p class="modal-footnote">Plan: drag furniture, fixtures, walls, doors or windows to move them. Drag empty floor, Alt-drag, or right/middle drag to pan. Hold Shift for finer placement. 3D: drag empty space to orbit, right drag to pan, scroll to zoom. Top: drag to pan. Select a door or window, choose Move (G), then drag it or its purple arrows along the wall. Openings stay inside their wall section and stop at neighbouring openings. Move snaps to 0.05 m for openings and walls; toggle snapping for finer placement. Release to apply, Esc to cancel, or Undo to restore the previous position. Select a wall and choose Move to drag it back or forth with its purple center arrows; connected walls and room boundaries follow. The endpoint spheres adjust individual corners; use Renovate for precise dimensions, evidence and service editing.</p>`);
window.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]') || (event.target instanceof HTMLElement && (event.target.closest('input,textarea,select') || event.target.isContentEditable)))return;
  const key=event.key.toLowerCase();const mod=event.metaKey||event.ctrlKey;
  if(key==='escape'){event.preventDefault();if(activeFinish){chooseFinish(null);return;}if(previewMode){setPreview(false);return;}if(floorPlan.cancelInteraction())return;viewport.cancelInteraction();interacting=false;select(null);renderProposal();return;}
  if(!mod&&key==='p'){event.preventDefault();setPreview(!previewMode);return;}
  if(previewMode){
    if(mod&&key==='s'){event.preventDefault();$('#save').click();}
    else if(mod&&['z','y','d','g'].includes(key))event.preventDefault();
    else if(!mod&&key==='f')focusView();
    return;
  }
  if(interacting)return;
  if(mod&&key==='z'){event.preventDefault();(event.shiftKey?$('#redo'):$('#undo')).click();}
  else if(mod&&key==='y'){event.preventDefault();$('#redo').click();}
  else if(mod&&key==='g'){event.preventDefault();if(event.shiftKey)ungroupSelected();else groupSelected();}
  else if(mod&&key==='d'){event.preventDefault();duplicateSelected();}
  else if(mod&&key==='s'){event.preventDefault();$('#save').click();}
  else if(!mod){if(['delete','backspace'].includes(key)){event.preventDefault();deleteSelected();}else if(key==='f')focusView(selectedId??undefined);else if(key==='v')setTool('select');else if(key==='g'&&view!=='plan')setTool('move');else if(key==='r'&&view!=='plan')setTool('rotate');else if(key==='s'&&view!=='plan')setTool('scale');else if(key==='1')switchPanel('scene');else if(key==='2')switchPanel('assets');else if(key==='3')switchPanel('assistant');else if(key==='4')switchPanel('renovation');else if(key==='5')switchPanel('materials');else if(key==='[')switchPanel(activePanel,true);}
});
window.addEventListener('beforeunload',()=>{materialsUI.dispose();viewport.dispose();floorPlan.dispose();catalogPreviews.dispose();renovationUI?.destroy();intake.destroy();});
refresh();renderAssets();setTool('select');switchPanel('renovation');
