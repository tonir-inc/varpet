import {guardTeamUnload,teamReloadGuard} from './ui/team-saves';
import {teamStartup} from './portal/team-session';
import {mountTeamSaves} from './ui/team-saves-editor';
import { placeFurniture, floorHeight } from './core/furniture-support';
import { BLUEPRINT_PAPER, editorSession as startupSession, apartmentPayload, restoreApartmentSharing, ApartmentShareAttachment } from './portal/session';
import { api, AccountError } from './portal/api';
import { showAuth } from './portal/auth';
import { createCeilingUI } from './ui/ceiling-design';
import { decorateGeneratedCeilings } from './core/generated-ceilings';
import { bindHeightControl, heightControlMarkup } from './ui/height-controls';
import { createSunControls, type SunControls } from './ui/sun-controls';
import './ui/style.css';
import { mountSharing } from './ui/sharing';
import { createShareSnapshot, getSharedStartup, ShareCreation, SharingSession } from './core/sharing';
import './ui/motion.css';
import './ui/walkthrough.css';
import { DEFAULT_INSIDE_LENS, isInsideLens } from './render/walkthrough-camera';
import './ui/designer-panel.css';
import { mountDesignerPanel, previewDesignerProposal } from './ui/designer-panel';
import { mountProposalBar } from './ui/review-bar';
import { describeEntity, proposalArrival } from './ui/proposal-review';
import { mountDesignOnboarding } from './ui/design-onboarding';
import { createDesignConstruction } from './ui/design-construction';
import { askDesigner, designerHealth } from './adapters/designer-http';
import { DesignerProposalCatalog } from './core/designer-catalog';
import { CATALOG_CURRENCY } from './adapters/catalog-http';
import { mountFolioShell } from './ui/folio-shell';
import type { AgentProposal, CatalogAsset, EditCommand, ObjectPatch, Operation, SceneDocument, SceneObject, ToolMode, Vec3, ViewMode, ViewportLayer, WallMode } from './contracts';
import { createInitialScene } from './core/initial-scene';
import defaultFlat from '../../../apartments/sunday-b12121/startup.json';
import { databaseCatalog, catalogKinds, catalogCategories, resolveSceneProducts, retainRegisteredProducts, type CatalogProduct } from './adapters/database-catalog';
import { createApartmentStore } from './core/apartment-store';
import { normalizeWallJunctions } from './core/wall-junctions';
import { expandFurnitureSelection, furnitureMembers } from './core/grouping';
import { floorSupported, validateScene } from './core/validation';
import { suggestFurniturePosition } from './core/furniture-placement';
import { OPENING_MOVE_SNAP } from './core/opening-move';
import { STORAGE_KEY, parseScene, saveLocal, serializeScene } from './core/persistence';
import { createDesignerAdapter, structureAdapter as mockStructureAdapter } from './adapters/mock';
import { buildFurnishedFlat, createArchitectHttpAdapter, replayFurnishedFlat } from './adapters/architect-http';
import { applyLiveEvent, liveScene, logArchitectActivity, openArchitectFlat, startArchitectFlat, type ArchitectFlatDeps } from './ui/architect-flat';
import { createBlueprintConstruction, type BlueprintConstruction } from './portal/blueprint-construction';
import { blueprintSource } from './portal/blueprint-source';
import { BUILT_CATEGORY, loadBuiltProducts, resolveFurnitureProducts } from './adapters/built-catalog';
import { createReconstructionProposal, previewReconstructionProposal } from './core/reconstruction-proposal';
import { createViewport, type FinishViewportCallbacks } from './render/viewport';
import { SKYBOX_PRESETS, isSkyboxPreset, type SkyboxPreset } from './render/skybox';
import { mayChangeWallStructure, structuralWallChanges } from './core/structural-wall-confirmation';
import { previewSelectionOperations, selectionTransformOperations, wallSelectionOperations } from './core/multi-selection';
import { createFloorPlan } from './render/floor-plan';
import { createCatalogPreviews } from './render/catalog-previews';
import { icon } from './ui/icons';
import { createRenovationUI, type RenovationUI } from './ui/renovation';
import { createIntake } from './features/intake';
import { downloadText, projectReport, projectSchedule } from './features/handoff';
import { buildFinishOperations, getFinishPreset, type FinishPreset } from './core/finish-presets';
import { createMaterialsUI } from './ui/materials';
import { renderEntityInspector, renderAssetChoices, renderMaterialSlots } from './ui/inspector';
import { renderWallSelectionFinishes, type WallFinishSelectionState } from './ui/wall-selection-finishes';
import { bindFurnitureDragCard } from './ui/furniture-drag';
import { mountThemeToggle } from './ui/theme';
import './ui/arrival.css';

// Anonymous template/upload sessions carry startup data, but save into the team workspace.
const editorSession = startupSession?.user || startupSession?.apartment ? startupSession : null;

// The live designer is the default (VITE_DESIGNER_URL, else the local service on 127.0.0.1:8787); an offline service
// says so in the chat. The keyword replay runs only when asked for: ?designer=replay or VITE_DESIGNER_REPLAY=1.
const designerLive = new URLSearchParams(location.search).get('designer') !== 'replay' && import.meta.env.VITE_DESIGNER_REPLAY !== '1';
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="app-header">
    <a class="brand" href="/" aria-label="Varpet home"><span class="brand-mark">v</span><span>varpet</span></a>
    <span class="header-divider"></span>
    <div class="project-name"><strong id="project-name">Apartment 01</strong><span>Local project</span></div>
    <div class="header-actions"><span id="save-state" class="save-state">Empty apartment</span>
      <div class="history-buttons"><button id="undo" class="icon-button" title="Undo · ⌘Z" aria-label="Undo">${icon('undo')}</button><button id="redo" class="icon-button" title="Redo · ⌘⇧Z" aria-label="Redo">${icon('redo')}</button></div>
      <button id="file-menu" class="button quiet" aria-label="Project files">${icon('folder')} <span>File</span> <span class="caret">⌄</span></button>
      <button id="save" class="button primary" title="Save on this device · ⌘S">${icon('save')} <span>Save</span></button>
      <button id="share" class="button quiet" aria-label="Share progress" aria-haspopup="dialog" aria-expanded="false">${icon('share')} <span>Share</span></button>
    </div>
  </header>
  <div class="workspace">
    <nav class="workspace-nav" aria-label="Workspace panels">
      <button id="scene-tab" class="nav-button active" aria-label="Scene panel" aria-expanded="true" aria-controls="scene-panel" title="Scene · 1">${icon('layers')}<span>Scene</span></button>
      <button id="renovation-tab" class="nav-button" aria-label="Renovation panel" aria-expanded="false" aria-controls="renovation-panel" title="Renovate · 4">${icon('walls')}<span>Renovate</span></button>
      <button id="assets-tab" class="nav-button" aria-label="Furniture panel" aria-expanded="false" aria-controls="assets-panel" title="Furniture · 2">${icon('sofa')}<span>Furniture</span></button>
      <button id="ceilings-tab" class="nav-button" aria-label="Ceilings panel" aria-expanded="false" aria-controls="ceilings-panel" title="Ceilings & lights · 6">${icon('sun')}<span>Ceilings</span></button>
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
        <div id="apartment-height" class="apartment-height"></div>
        <div class="wall-visibility">
          <label><input id="show-outer-walls" type="checkbox" aria-describedby="wall-visibility-note">Show outer walls</label>
          <p id="wall-visibility-note" class="field-note"></p>
        </div>
        <div id="hierarchy" class="hierarchy"></div>
        <button id="browse-assets" class="button full">${icon('plus')} Add furniture <span class="shortcut">2</span></button>
        <button id="edit-shell" class="button full" style="margin-top:8px">${icon('walls')} Edit apartment & systems <span class="shortcut">4</span></button>
        <div class="structure-note">${icon('layers')} Your apartment, explained<span>Renovate lets you correct walls and openings, review assumptions, compare options and plan services.</span></div>
      </section>
      <section id="assistant-panel" class="panel-content" aria-label="Design assistant" hidden>
        <section id="architect-progress" class="af-panel" aria-live="polite" hidden></section>
        <section class="assistant-card"><div class="assistant-heading"><span class="assistant-icon">${icon('sparkles')}</span><div><strong>Design together</strong><span>Design assistant <span class="mock-label">${designerLive ? 'Live' : 'Demo'}</span></span></div></div><p>Explore a change to your apartment. Review the proposal before applying it.</p><button id="suggest" class="button suggestion">${icon('sparkles')} Suggest an edit ${icon('arrow')}</button><div id="proposal" aria-live="polite"></div></section>
        <div class="assistant-note">${icon('lock')} You're in control. Every change needs your approval and can be undone.</div>
      </section>
      <section id="renovation-panel" class="panel-content" aria-label="Apartment renovation workspace" hidden></section>
      <section id="ceilings-panel" class="panel-content" aria-label="Ceilings and lights" hidden></section>
      <section id="materials-panel" class="panel-content" aria-label="Surface materials" hidden></section>
    </aside>
    <main class="viewport-shell" aria-label="Apartment editor">
      <div id="viewport"></div>
      <div id="architect-stage" class="architect-stage-host" hidden></div>
      <div id="floor-plan" hidden></div>
      <div class="viewport-top"><div class="view-switch" role="group" aria-label="Apartment view"><button id="perspective" class="active" aria-pressed="true" title="Perspective camera">${icon('cube')} 3D</button><button id="top-view" aria-pressed="false" title="Orthographic camera">${icon('top')} Top</button><button id="inside-view" aria-pressed="false" title="Walk inside at standing eye height">${icon('eye')} Inside</button><button id="plan-view" aria-pressed="false" title="Floor plan with room dimensions">${icon('room')} Plan</button></div><div class="view-options"><button id="walls" title="Cycle wall visibility">${icon('walls')} <span>Cutaway</span></button><button id="top-lighting" aria-label="Scene lighting" aria-pressed="false" title="Show scene lighting and shadows in Top view" hidden>${icon('sun')} <span>Lighting off</span></button><button id="sun" aria-label="Sun controls" aria-haspopup="dialog" aria-expanded="false" aria-controls="sun-controls" title="Adjust sunlight">${icon('sun')} <span>Sun</span></button><button id="quality" aria-pressed="false" title="Toggle rendering quality">${icon('sun')} <span>Balanced</span></button><button id="preview" aria-pressed="false" title="Preview apartment · P">${icon('eye')} <span>Preview</span></button></div></div>
      <label class="skybox-control" title="Choose a sky for 3D, Inside and Top views">${icon('sun')}<span>Sky</span><select id="skybox" aria-label="Skybox">${SKYBOX_PRESETS.map(preset => `<option value="${preset.id}">${preset.label}</option>`).join('')}</select></label>
      <div class="inside-label"><strong>Inside</strong><span>Eye height · 1.65 m</span><label class="inside-lens">View <select id="inside-lens" aria-label="Inside view width"><option value="standard">Standard</option><option value="photo" selected>Photo</option><option value="wide">Extra wide</option></select></label></div>
      <div class="canvas-label">${icon('layers')} <span>Ground floor</span><span class="pill">1 level</span></div>
      <div class="selection-chip" hidden><span id="selected-name"></span><button id="focus-selected" class="icon-button" aria-label="Frame selected object" title="Frame selection · F">${icon('focus')}</button></div>
      <div class="tool-rail" role="toolbar" aria-label="Object tools">${(['select','move','rotate','scale'] as ToolMode[]).map((tool, i) => `<button data-tool="${tool}" class="${i === 0 ? 'active' : ''}" aria-label="${{select:'Select',move:'Move',rotate:'Rotate',scale:'Resize'}[tool]} tool" title="${{select:'Select · V',move:'Move · G',rotate:'Rotate · R',scale:'Resize · E'}[tool]}">${icon(tool)}<kbd>${['V','G','R','E'][i]}</kbd></button>`).join('')}<div class="tool-divider"></div><button id="multi-select" aria-label="Select multiple items" aria-pressed="false" title="Select several walls or models · Shift-click">${icon('layers')}</button><button id="focus" aria-label="Focus selection" title="Frame selection / apartment · F">${icon('focus')}<kbd>F</kbd></button><div class="tool-divider"></div><button id="snap" aria-pressed="true" class="snap active" title="Toggle grid snapping">${icon('grid')}<strong>0.25 m</strong></button></div>
      <div class="canvas-bottom"><span id="view-hint">WASD / arrows to move <b>·</b> Drag to orbit <b>·</b> Space + drag to pan <b>·</b> Scroll to zoom</span></div>
      <aside id="furniture-library" class="furniture-panel" aria-labelledby="furniture-title" hidden>
        <div class="panel-heading"><h2 id="furniture-title">Furniture</h2><span id="asset-count" class="count"></span><button id="close-furniture" class="icon-button" aria-label="Close furniture library" title="Close furniture library">${icon('close')}</button></div>
      <section id="assets-panel" class="panel-content" aria-label="Furniture library" hidden>
        <label class="search">${icon('search')}<input id="asset-search" placeholder="Search furniture…" aria-label="Search furniture" /></label>
        <label class="text-field">Category<select id="asset-category" aria-label="Furniture category"><option value="">All furniture</option></select></label>
        <p class="muted furniture-help">Click a piece to add it, or drag it onto the floor.</p>
        <div id="catalog-status" role="status" aria-live="polite"></div>
        <button id="catalog-retry" class="button full" hidden>Retry furniture connections</button>
        <div id="catalog-scroll"><div id="asset-list" class="asset-list"></div></div>
        <p class="muted catalog-note">Sample prices in AMD, labeled with their source. Pieces built from your photos are not priced.</p><p class="muted catalog-note">Models: <a href="https://amazon-berkeley-objects.s3.amazonaws.com/index.html" target="_blank" rel="noopener noreferrer">Amazon Berkeley Objects</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Models are centered, oriented and scaled to catalog fit dimensions.</p>
      </section>
      </aside>
      <aside id="selection-properties" class="right-panel" aria-label="Selection properties" hidden><div class="inspector-heading"><span>Properties</span><button id="ask-designer" class="button quiet inspector-ask" title="Attach it to your next message to the designer">${icon('sparkles')} Ask the designer</button><button id="close-inspector" class="icon-button" aria-label="Close properties" title="Close properties">${icon('close')}</button></div><div id="inspector" class="inspector"></div></aside>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
      <div id="render-error" class="render-error" hidden></div>
    </main>
  </div>
  <footer class="status-bar"><span><i class="connection-dot"></i> <span id="status-text">All changes stay on this device</span></span><span id="selection-status">Select an item to edit</span><span>Metres <b>·</b> <span id="revision">Revision 0</span></span></footer>
  <input id="file-input" type="file" accept=".json,application/json" hidden />
  <dialog id="modal"><div id="modal-content"></div></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const disposeThemeToggle = mountThemeToggle($('.header-actions'));
window.addEventListener('pagehide', event => { if (!event.persisted) disposeThemeToggle(); });
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const uid = () => crypto.randomUUID();
const architectLive = Boolean(import.meta.env.VITE_ARCHITECT_URL);
const builtOptions = { url: import.meta.env.VITE_ARCHITECT_URL, run: import.meta.env.VITE_ARCHITECT_RUN };
let builtProducts: CatalogProduct[] = [];
let builtLoading = false;
let builtError = '';
const structureAdapter = architectLive ? createArchitectHttpAdapter({ onProgress: message => notify(message) }) : mockStructureAdapter;
const sharedStartup = getSharedStartup();
const shareOwnerId = () => editorSession ? editorSession.apartment?.id ?? '__account_draft__' : undefined;
let shareSession = sharedStartup ? new SharingSession(sharedStartup.reference, sharedStartup.project) : editorSession?.sharingSession ?? null;
const shareCreation = new ShareCreation();
const shareAttachment = new ApartmentShareAttachment();
// With no shared link or session, the editor opens the demo flat: Sunday Towers B12121, furnished
// (apartments/sunday-b12121; startup.json carries the catalog models it uses, so it opens offline).
const startupFlat = defaultFlat as unknown as { scene: SceneDocument; catalog: CatalogAsset[] };
let catalog: CatalogAsset[] = sharedStartup?.project.catalog ?? teamStartup?.catalog.map(product => product.asset) ?? startupSession?.catalog.map(product => product.asset) ?? startupFlat.catalog;
const store = createApartmentStore(sharedStartup?.project.scene ?? teamStartup?.scene ?? startupSession?.scene ?? startupFlat.scene, catalog);
const startupProducts: CatalogProduct[] = sharedStartup ? catalog.map(asset => ({ asset,
  priceSource: 'shared project · unverified', sizeStatus: 'shared project', attribution: 'Catalog captured with the shared project' }))
  : teamStartup?.catalog ?? startupSession?.catalog ?? startupFlat.catalog.map(asset => ({ asset, priceSource: 'catalog · demo price', sizeStatus: 'catalog',
    attribution: asset.id.startsWith('abo:') ? 'Amazon Berkeley Objects, CC BY 4.0' : 'Made to measure for this flat (varpet)' }));
const catalogProducts = new Map<string, CatalogProduct>(startupProducts.map(product => [product.asset.id, product]));
const designerCatalog = new DesignerProposalCatalog();
let catalogResults: CatalogProduct[] = [];
let catalogLoading = false;
let catalogError = '';
let catalogExcluded = 0;
let catalogNextOffset: number | null = null;
// Browsing stays well inside the store's 1000 retained products.
const CATALOG_BROWSE_LIMIT = 400;
let catalogRequest: AbortController | undefined;
let catalogSearchTimer: ReturnType<typeof setTimeout>;
function registerProducts(products: CatalogProduct[]) {
  // Imports must not invalidate the cards still visible in the current search.
  products = retainRegisteredProducts([...builtProducts, ...catalogResults, ...products], catalogProducts);
  catalog = store.registerCatalogAssets(products.map(product => product.asset));
  products.forEach(product => catalogProducts.set(product.asset.id, product));
  const retained = new Set(catalog.map(asset => asset.id));
  for (const id of catalogProducts.keys()) if (!retained.has(id)) catalogProducts.delete(id);
}
const priceLabel = (asset: CatalogAsset) => asset.id.startsWith('built-') ? 'Not priced · built from your photos' : `${asset.price.toLocaleString()} AMD · ${catalogProducts.get(asset.id)?.priceSource ?? 'unverified'}`;
async function parseDatabaseScene(text: string) {
  if (text.length > 24_000_000) throw new Error('Project file exceeds the 24 MB limit.');
  registerProducts(await resolveSceneProducts(JSON.parse(text), catalogProducts, ids => resolveFurnitureProducts(ids, builtOptions)));
  return parseScene(text, catalog);
}
let selectedId: string | null = null;
let inspectorOpen = false;
let selectedFurnitureIds: string[] = [];
let selectedWallIds: string[] = [];
const wallFinishSelection: WallFinishSelectionState = { selection: '', surface: 'both' };
let multiSelection = false;
const selectionIds = () => [...selectedFurnitureIds, ...selectedWallIds];
let tool: ToolMode = 'select';
type ApartmentView = ViewMode | 'plan';
let view: ApartmentView = 'perspective';
let selectedSkybox: SkyboxPreset = 'studio';
let previewReturnView: ApartmentView | null = null;
let insideReturnView: ApartmentView = 'perspective';
let wallMode: WallMode = 'cutaway';
let snap = true;
let interacting = false;
let selectionRevealFrame = 0;
let interactionRevision = 0;
let savedRevision = editorSession?.apartment || teamStartup ? 0 : -1;
let teamSaves: ReturnType<typeof mountTeamSaves> | undefined;
let accountSaving = false;
let pending: AgentProposal | null = null;
let busy = false;
let assetCategory = '';
let toastTimer: ReturnType<typeof setTimeout>;
type Panel = 'scene' | 'assets' | 'assistant' | 'renovation' | 'materials' | 'ceilings';
let activePanel: Panel = 'scene';
let panelOpen = true;
let folioShell: ReturnType<typeof mountFolioShell> | undefined;
let previewMode = false;
let proposalView = false;
let designOnboarding: ReturnType<typeof mountDesignOnboarding> | undefined;
let guidedPreviewId: string | undefined;
let renovationUI: RenovationUI | undefined;
let sunControls: SunControls | undefined;
let topLightingEnabled = true;
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

const presentation = startupSession?.presentation;
let guidedDesign = presentation?.workflow === 'design' && Boolean(presentation.arriving);
const viewportCallbacks: FinishViewportCallbacks = {
  onLightingChange: () => ceilingUI.syncLighting(),
  onSunChange: settings => {
    sunControls?.refresh(settings);
    renovationUI?.setSelection(selectedId, selectionIds());
    ceilingUI.syncLighting();
  },
  onFinish: (presetId, target) => {
    if (previewMode || proposalView || view === 'plan') return false;
    const preset = getFinishPreset(presetId); if (!preset) return false;
    try {
      const operations = buildFinishOperations(store.scene, preset, target.entityId, target.surface);
      if (!operations.length) { notify(`${preset.name} is already applied here.`); return false; }
      return run(operations, `Apply ${preset.name} to ${entityName(target.entityId) ?? 'surface'}`);
    } catch (error) { notify(error instanceof Error ? error.message : 'This finish could not be applied.', true); return false; }
  },
  onViewChange: next => setView(next),
  // Reviewing a designer proposal: anything in the proposed flat can be picked to comment on; nothing is edited.
  // While a designer proposal is previewed, a click attaches what it hits to the next chat message; it never edits.
  onSelect: (id, additive) => { if (review) { if (id) attachToDesigner(id, review.scene); return; } if (!previewMode && view !== 'inside') select(id, additive); },
  onWallsChange: mode => { wallMode = mode; renderWallControls(); },
  onFurnitureDrop: (assetId, position) => {
    if (previewMode || proposalView) return;
    const asset = catalog.find(item => item.id === assetId);
    if (asset) commitFurnitureAddition(asset, newFurniture(asset), position, `Add ${asset.name}`, interactionRevision);
  },
  onTransform: (id, patch) => {
    transformSelection(id, patch, selectedFurnitureIds.length > 1 ? 'Transform selected furniture' : `Transform ${store.scene.objects.find(o => o.id === id)?.name ?? 'object'}`, interactionRevision);
    viewport.setScene(store.scene, catalog);
    viewport.setSelection(selectedId, selectionIds());
  },
  onInteraction: active => { interacting = active; if (active) { cancelAnimationFrame(selectionRevealFrame); interactionRevision = store.revision; } renderProposal(); },
  onWallMove: (id, start, end) => {
    try {
      const wall = store.scene.walls.find(item => item.id === id);
      const operations = wall && selectedWallIds.length > 1 ? wallSelectionOperations(store.scene, selectedWallIds, [start[0] - wall.start[0], start[1] - wall.start[1]]) : [{ type: 'update-wall' as const, id, patch: { start, end } }];
      run(operations, selectedWallIds.length > 1 ? 'Move selected walls' : 'Move connected wall', interactionRevision);
    } catch (error) { notify(error instanceof Error ? error.message : 'The walls could not be moved.', true); }
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
    viewport.setSelection(selectedId, selectionIds());
  },
  onOpeningTransform: (id, patch) => {
    const opening = store.scene.walls.flatMap(wall => wall.openings).find(item => item.id === id);
    const resized = opening && (Math.abs(opening.width - patch.width) > 1e-8 || Math.abs(opening.height - patch.height) > 1e-8);
    run([{ type: 'update-opening', id, patch }], resized ? 'Resize window' : 'Move window', interactionRevision);
    viewport.setScene(store.scene, catalog); viewport.setSelection(selectedId, selectionIds());
  },
  onComponentTransform: (id, patch) => {
    const component = store.scene.project?.components.find(c => c.id === id);
    if (component) run([{ type: 'upsert-component', component: { ...component, ...patch } }], `Transform ${component.name}`, interactionRevision);
    viewport.setScene(store.scene, catalog); viewport.setSelection(selectedId, selectionIds());
  },
  onError: message => notify(message, true),
};
const adoptedViewport = presentation?.takeViewport?.();
const viewport = adoptedViewport ?? createViewport($('#viewport'), viewportCallbacks, normalizeWallJunctions);
if (adoptedViewport) viewport.attach($('#viewport'), viewportCallbacks, normalizeWallJunctions);
const designConstruction = createDesignConstruction($('.viewport-shell'), viewport);
store.setSurfaceResolver(viewport.furnitureSurface);
/** The designer proposal previewed in the flat: its scene, and the new pieces this turn has already shown. */
let review: { proposal: AgentProposal; scene: SceneDocument; shown: Set<string> } | null = null;
const proposalBar = mountProposalBar({
  host: $('.viewport-shell'),
  accept: proposal => { designerPanel.controller.act(proposal.id, 'apply'); },
  reject: (proposal, partial) => { if (partial || !designerPanel.controller.act(proposal.id, 'dismiss')) setPreview(false); },
});
function endReview() { review = null; proposalBar.hide(); }
/** Attach something in `scene` to the designer chat's next message, as a chip. */
function attachToDesigner(id: string, scene: SceneDocument): boolean {
  const entity = describeEntity(scene, id, catalog);
  if (!entity) return false;
  if (panelOpen) switchPanel(activePanel, true);
  designerPanel.attachEntity(entity);
  return true;
}
/** Free viewer area for framing a room: below the proposal bar, above the dock. */
function arrivalArea() {
  const shell = $('.viewport-shell'), dock = document.querySelector<HTMLElement>('.folio-dock');
  return { left: 24, right: shell.clientWidth - 24, top: 72, bottom: (dock?.offsetTop ?? shell.clientHeight - 80) - 16 };
}
// Every editor entry uses the blueprint workspace, including saved flats and the sandbox.
// Construction handoff additionally preserves its exact camera and tool arrival.
if (!adoptedViewport) viewport.setBackdrop({ paper: presentation?.paper ?? BLUEPRINT_PAPER });
let arrivalPose = adoptedViewport?.cameraPose() ?? presentation?.camera;
if (presentation?.arriving) { document.body.classList.add('editor-arriving'); viewport.setLocked(true); }
const insideLensControl = $<HTMLSelectElement>('#inside-lens');
const insideLensStorageKey = 'varpet.inside-lens.v1';
let insideLens = DEFAULT_INSIDE_LENS;
try {
  const savedLens = localStorage.getItem(insideLensStorageKey);
  if (isInsideLens(savedLens)) insideLens = savedLens;
} catch { /* Camera preferences also work when browser storage is unavailable. */ }
insideLensControl.value = insideLens;
viewport.setInsideLens(insideLens);
insideLensControl.onchange = () => {
  if (!isInsideLens(insideLensControl.value)) return;
  viewport.setInsideLens(insideLensControl.value);
  try { localStorage.setItem(insideLensStorageKey, insideLensControl.value); } catch { /* Optional preference. */ }
};
sunControls = createSunControls($<HTMLButtonElement>('#sun'), $('.viewport-shell'), {
  getSun: () => viewport.getSun(),
  setSun: patch => viewport.setSun(patch),
});
const floorPlan = createFloorPlan($('#floor-plan'), (id, additive) => select(id, additive), {
  onInteraction: active => { interacting = active; if (active) interactionRevision = store.revision; renderProposal(); },
  onCommit: (operation, label) => { run([operation], label, interactionRevision); },
  onCommitMany: (operations, label) => { run(operations, label, interactionRevision); },
  onAdditiveSelectionChange: setMultiSelection,
  onError: message => notify(message, true),
  onSnapChange: enabled => { snap = enabled; viewport.setSnap(snap); renderViewportHints(); renderInspector(); },
}, normalizeWallJunctions);
const ceilingUI = createCeilingUI($('#ceilings-panel'), {
  getScene: () => store.scene, execute: run, select, notice: notify,
  toggleSwitch: id => viewport.toggleSwitch(id),
  getSwitchLevel: id => viewport.getSwitchLevel(id),
  inspect: (id, evening) => {
    if (previewMode) { notify('Exit preview to inspect a ceiling design.'); return; }
    if (!viewport.inspectCeiling(id)) return;
    viewport.setLightingMood(evening ? 'evening' : 'day');
    setView('inside');
  },
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
      setWallMode('full');
    }
  }
  activeFinish = preset;
  materialsUI.setActive(preset?.id ?? null);
  viewport.setFinishBrush(preset?.id ?? null);
  renderViewportHints();
}

function focusView(id?: string) {
  cancelAnimationFrame(selectionRevealFrame);
  if (guidedDesign && !id) return;
  // The first framing keeps the construction view's camera, so the handover has no cut.
  if (arrivalPose && !id && view === 'perspective') { viewport.setCameraPose(arrivalPose, 0); return; }
  if (view === 'plan') floorPlan.focus(id);
  else if (view !== 'inside' && id === selectedId && store.scene.rooms.some(room => room.id === id)) {
    if (!revealSelection()) viewport.focus(id);
  }
  else viewport.focus(id);
}

function run(operations: Operation[], label: string, revision = store.revision, onDeferredApply?: () => void) {
  if (previewMode) { notify('Exit preview to edit the apartment.'); return false; }
  const command: EditCommand = {id:uid(), label, source:'human', baseRevision:revision, operations};
  // Preflight shell edits with the same checks and junction policy as the real
  // store. Compare the result so connected walls count, but paint/type changes do not.
  const shellEdit = operations.some(mayChangeWallStructure);
  if (store.scene.project?.mode === 'renovate' && shellEdit && revision === store.revision) {
    try {
      const candidate = previewSelectionOperations(store.scene, operations, catalog, normalizeWallJunctions);
      const walls = structuralWallChanges(store.scene, candidate, operations).filter(wall => wall.role === 'structural');
      if (walls.length) {
        showModal('Change a load-bearing wall?',
          `<p class="modal-intro">${escape(label)} affects ${walls.length === 1 ? 'this wall' : 'these walls'}. Do you want to continue?</p><ul>${walls.map(wall => `<li><strong>${escape(wall.name)}</strong> — recorded as load-bearing</li>`).join('')}</ul><p class="modal-intro">This changes the renovation proposal. Have a structural professional review the work before changing the real building.</p><div class="file-actions"><button id="cancel-wall-change" type="button" class="button">Cancel</button><button id="confirm-wall-change" type="button" class="button primary">Apply proposed change</button></div>`);
        $('#cancel-wall-change').onclick = () => modal.close();
        modal.addEventListener('close', () => {
          renderInspector();
          renovationUI?.render();
        }, { once: true });
        $('#confirm-wall-change').onclick = () => {
          modal.close();
          // Retain the reviewed revision: a later edit must never reuse consent.
          if (executeHumanCommand(command)) onDeferredApply?.();
        };
        $('#cancel-wall-change').focus();
        return false;
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'This wall change could not be checked.', true);
      return false;
    }
  }
  return executeHumanCommand(command);
}

function executeHumanCommand(command: EditCommand) {
  if (guidedDesign || previewMode) return false;
  const result = store.execute(command, true);
  if (!result.ok) notify(result.errors.join(' '), true);
  else if (result.warnings.length) notify(`${command.label}. ${result.warnings[0]}`);
  else notify(command.label);
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

const replayMode = new URLSearchParams(location.search).get('architect') === 'replay';
function architectDeps(): ArchitectFlatDeps {
  return {
    showModal: (title, body) => showModal(title, body), isOpen: () => modal.open, notify,
    progressHost: () => document.querySelector<HTMLElement>('#architect-progress'),
    onStarted: () => { if (modal.open) modal.close(); switchPanel('assistant'); },
    build: async (input, onProgress) => {
      try {
        await startStage(input.plan);
        return await buildFurnishedFlat(input, message => { onProgress(message); stage?.progress(message); }, { onEvent: event => { logArchitectActivity(event); stage?.event(event as never); } });
      } catch (error) { stopStage(); throw error; }
    },
    onProject: async project => {
      try {
        const scene = decorateGeneratedCeilings(await parseDatabaseScene(JSON.stringify(project)));
        const title = 'Furnished apartment from your plan and photos';
        pending = { id: uid(), title, description: 'The architect read your plan, built the furniture from your photos and placed it where the photos show it. Rooms without recorded lighting receive editable ceiling spots and proposed wall switches where they fit. Applying replaces the current apartment; undo restores it.', command: { id: uid(), label: title, source: 'architect', baseRevision: store.revision, operations: [{ type: 'replace-scene', scene }] } };
        if (!previewMode) setPreview(true);
        proposalView = true; $<HTMLButtonElement>('#save').disabled = true;
        // Let the preview layout settle before the final construction framing.
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        await stage?.finish(scene, catalog);
        const pose = stage?.pose();
        stopStage(true);
        viewport.setScene(scene, catalog);
        if (pose) viewport.setCameraPose(pose, 0); else focusView();
        switchPanel('assistant'); renderProposal(); notify('Your apartment is ready. Inspect it in 3D, then apply or dismiss it.');
      } catch (error) { stopStage(); throw error; }
    },
  };
}
function openArchitect() { openArchitectFlat(architectDeps()); }
async function replayArchitect() {
  const base = '/architect-replay/';
  const file = async (name: string) => new File([await (await fetch(base + name)).blob()], name, { type: 'image/jpeg' });
  const plan = await file('plan.jpg');
  const photos = await Promise.all(['photo-01.jpg', 'photo-02.jpg', 'photo-03.jpg', 'photo-05.jpg', 'photo-06.jpg'].map(file));
  const deps = architectDeps();
  const speed = Number(new URLSearchParams(location.search).get('speed') ?? '1');
  await startArchitectFlat({ ...deps, build: async (input, onProgress) => {
    try {
      await startStage(input.plan);
      return await replayFurnishedFlat(base + 'n3.json', message => { onProgress(message); stage?.progress(message); }, event => { logArchitectActivity(event); stage?.event(event as never); }, speed);
    } catch (error) { stopStage(); throw error; }
  } }, { plan, photos, name: 'Replay' });
}

/* Construction borrows the editor's live world, then returns it for the reviewed proposal. */
let stage: BlueprintConstruction | null = null;
let stageVersion = 0;
let stageReturn: { view: ApartmentView; walls: WallMode; preview: boolean; restore: () => void; controls: [HTMLElement, boolean][] } | null = null;
async function startStage(plan: File) {
  stopStage();
  const version = ++stageVersion;
  const source = await blueprintSource(plan);
  if (version !== stageVersion) throw new DOMException('Construction was replaced.', 'AbortError');
  const controls = [...$('.viewport-shell').children].filter((element): element is HTMLElement => element instanceof HTMLElement && element.id !== 'architect-stage' && element.id !== 'toast')
    .map((element): [HTMLElement, boolean] => [element, element.inert]);
  stageReturn = { view, walls: wallMode, preview: previewMode, restore: viewport.preservePresentation(), controls };
  select(null); setView('perspective'); setWallMode('cutaway');
  controls.forEach(([element]) => { element.inert = true; });
  $('.viewport-shell').classList.add('construction-active');
  const host = $('#architect-stage'); host.hidden = false;
  stage = createBlueprintConstruction(host, { ...source, paper: BLUEPRINT_PAPER, viewport, normalizeScene: normalizeWallJunctions });
  stage.start(); stage.enter();
}
function stopStage(keepResult = false) {
  const version = ++stageVersion, previous = stageReturn;
  stageReturn = null;
  if (stage) {
    stage.takeViewport();
    viewport.attach($('#viewport'), viewportCallbacks, normalizeWallJunctions);
    stage.dispose(); stage = null;
  }
  const host = document.querySelector<HTMLElement>('#architect-stage');
  if (host) { host.hidden = true; host.replaceChildren(); }
  $('.viewport-shell').classList.remove('construction-active');
  if (!previous) return;
  previous.controls.forEach(([element, inert]) => { element.inert = inert; });
  viewport.setLocked(false);
  if (!keepResult) {
    viewport.setBackdrop(null);
    if (!previous.preview && previewMode) setPreview(false);
    viewport.setScene(store.scene, catalog);
    setWallMode(previous.walls); setView(previous.view);
    // A queued preview focus must not replace the camera we restore after a failed build.
    requestAnimationFrame(() => {
      if (version === stageVersion && !stage) previous.restore();
    });
  }
}

/* Earlier live preview in the editor itself (kept for reference; the construction view replaced it). */
let liveEntered = false, liveStopped = false;
function showLive(event: Record<string, unknown>) {
  if (!applyLiveEvent(event) || liveStopped) return;
  if (liveEntered && !previewMode) { liveStopped = true; return; } // the person left the preview: stop following
  const live = liveScene();
  if (!live) return;
  if (!liveEntered && modal.open) modal.close();
  if (!previewMode) setPreview(true);
  proposalView = true; $<HTMLButtonElement>('#save').disabled = true;
  viewport.setScene(live.scene, [...catalog, ...live.assets]);
  if (!liveEntered) { liveEntered = true; focusView(); notify('The walls are in. Watch the furniture arrive; the architect keeps working.'); }
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
  isAwaitingConfirmation: () => modal.open && !!modal.querySelector('#confirm-wall-change'),
  execute: (label, operations, onDeferredApply) => run(operations, label, store.revision, onDeferredApply), select: (id, additive) => select(id, additive || multiSelection),
  focus: id => focusView(id), notice: notify,
  testDoor: (id, angle) => viewport.setDoorAngle(id, angle), getDoorAngle: id => viewport.getDoorAngle(id),
  toggleSwitch: id => viewport.toggleSwitch(id), setSwitchLevel: (id, level) => viewport.setSwitchLevel(id, level), getSwitchLevel: id => viewport.getSwitchLevel(id), onSources: () => intake.sources(), onReconstruct: () => intake.reconstruction(), onArchitect: architectLive ? openArchitect : undefined, onExport: exportProject,
  onLayer: (name, enabled) => viewport.setLayer(name as ViewportLayer, enabled),
  onComparison: enabled => viewport.setComparison(enabled),
});

function selectionLabel(): string {
  if (selectedWallIds.length > 1) return `${selectedWallIds.length} walls selected`;
  if (selectedFurnitureIds.length > 1) return `${selectedFurnitureIds.length} objects${selectedGroupId() ? ' · Group' : ' selected'}`;
  return selectedId ? entityName(selectedId) ?? '' : 'Nothing selected';
}
function selectedGroupId(): string | undefined {
  const objects = store.scene.objects.filter(object => selectedFurnitureIds.includes(object.id));
  const id = objects[0]?.groupId;
  return id && objects.length > 1 && objects.every(object => object.groupId === id) ? id : undefined;
}
function select(id: string | null, additive = false) {
  cancelAnimationFrame(selectionRevealFrame);
  if (interacting) return;
  const previousSelection = JSON.stringify([selectedId, ...selectionIds()]);
  const members = id ? furnitureMembers(store.scene, id).map(object => object.id) : [];
  const wall = id ? store.scene.walls.find(item => item.id === id) : undefined;
  if (additive && members.length) {
    selectedWallIds = [];
    const remove = members.every(member => selectedFurnitureIds.includes(member));
    selectedFurnitureIds = remove ? selectedFurnitureIds.filter(member => !members.includes(member))
      : [...new Set([...selectedFurnitureIds, ...members])];
    selectedId = remove ? selectedFurnitureIds.at(-1) ?? null : id;
  } else if (additive && wall) {
    selectedFurnitureIds = [];
    selectedWallIds = selectedWallIds.includes(wall.id) ? selectedWallIds.filter(member => member !== wall.id) : [...selectedWallIds, wall.id];
    selectedId = selectedWallIds.at(-1) ?? null;
  } else if (additive && !id) return;
  else {
    selectedId = id && entityName(id) ? id : null;
    selectedFurnitureIds = members; selectedWallIds = wall ? [wall.id] : [];
    if (!selectedId) setMultiSelection(false);
  }
  viewport.setSelection(selectedId, selectionIds());
  floorPlan.setSelection(selectedId, selectionIds());
  $('#hierarchy').querySelectorAll<HTMLButtonElement>('[data-object]').forEach(button => {
    const selected = selectedFurnitureIds.includes(button.dataset.object!);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    const dot = button.querySelector<HTMLElement>('.selected-dot');
    if (dot) dot.hidden = !selected;
  });
  if (!selectedId) inspectorOpen = false;
  else if (previousSelection !== JSON.stringify([selectedId, ...selectionIds()])) inspectorOpen = true;
  renderInspector();
  renovationUI?.setSelection(selectedId, selectionIds());
  ceilingUI.setSelection(selectedId);
  $('#selection-status').textContent = selectionLabel();
  renderViewportHints();
  if (selectedId) scheduleSelectionReveal();
  folioShell?.update();
}
function scheduleSelectionReveal() {
  cancelAnimationFrame(selectionRevealFrame);
  // Opening Properties can close a tool drawer and resize the canvas. Let its
  // ResizeObserver update the projection before framing the selection.
  selectionRevealFrame = requestAnimationFrame(() => {
    selectionRevealFrame = requestAnimationFrame(revealSelection);
  });
}
function revealSelection(): boolean {
  selectionRevealFrame = 0;
  if (!selectedId || interacting || previewMode || view === 'plan' || view === 'inside') return false;
  const panel = $(furniturePanelOpen() ? '#furniture-library' : '#selection-properties'), canvas = $('#viewport');
  if (!canvas.clientWidth) return false;
  const toolbar = $('.tool-rail'), dock = $('.folio-dock');
  // Reserve space for the visible right panel so a newly placed piece stays
  // beside the furniture library. Layout offsets exclude entrance animation.
  const right = panel.offsetWidth ? Math.min(canvas.clientWidth, panel.offsetLeft - canvas.offsetLeft) : canvas.clientWidth;
  const available = {
    left: 24,
    right: right - 24,
    top: toolbar.offsetTop + toolbar.offsetHeight + 16,
    bottom: dock.offsetTop - 16,
  };
  if (available.right - available.left < 64 || available.bottom - available.top < 64) return false;
  viewport.revealSelection(available);
  return true;
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
    button.onclick = event => select(button.dataset.object!, event.shiftKey || multiSelection);
    button.ondblclick = () => focusView(button.dataset.object!);
  });
}

function furniturePanelOpen() { return panelOpen && activePanel === 'assets'; }
function inspectorVisible() { return inspectorOpen && !furniturePanelOpen(); }

function setInspectorOpen(open: boolean) {
  if (open && selectedId && furniturePanelOpen()) switchPanel('assets', true);
  inspectorOpen = open && !!selectedId;
  renderInspector();
  folioShell?.update();
  if (inspectorOpen) scheduleSelectionReveal();
  else cancelAnimationFrame(selectionRevealFrame);
}

function renderInspector() {
  const object = store.scene.objects.find(o=>o.id===selectedId);
  const name = selectedId ? entityName(selectedId) : undefined;
  if (!name) inspectorOpen = false;
  $('#selection-properties').hidden = !inspectorVisible();
  $('#ask-designer').hidden = !selectedId || !describeEntity(store.scene, selectedId);
  document.body.classList.toggle('folio-inspect', inspectorVisible());
  $('.selection-chip').hidden = !name;
  $('#selected-name').textContent = name ? selectionLabel() : '';
  const inspectorOptions = {
    selectionOnly: true,
    getScene: () => store.scene, getCatalog: () => catalog,
    execute: (operations: Operation[], label: string, onDeferredApply?: () => void) => run(operations, label, store.revision, onDeferredApply),
    notice: notify, refresh: renderInspector, showFullHeight, select: (id: string) => select(id),
    advanced: () => { switchPanel('renovation'); renovationUI?.setSelection(selectedId, selectionIds()); },
    getDoorAngle: (id: string) => viewport.getDoorAngle(id),
    testDoor: (id: string, angle: number) => viewport.setDoorAngle(id, angle),
    onFinishDragStart: (preset: FinishPreset) => chooseFinish(preset),
    onFinishDragEnd: () => chooseFinish(null),
  };
  if (selectedWallIds.length > 1) {
    const walls = store.scene.walls.filter(wall => selectedWallIds.includes(wall.id));
    const locked = walls.some(wall => store.scene.project?.metadata[wall.id]?.locked);
    $('#inspector').innerHTML = `<div class="selected-asset-heading"><span class="asset-symbol">${icon('layers')}</span><div><span class="eyebrow">Multiple selection</span><h2>${walls.length} walls</h2></div></div>
      <div id="wall-selection-finishes"></div>
      <p class="field-note">Move these walls together. Connected corners, openings and room boundaries follow.</p>
      <button id="move-selection" class="button primary full" ${locked ? 'disabled' : ''}>${icon('move')} Move selected walls</button>
      <div class="property-section"><div class="property-label">Move by <span>m</span></div><div class="field-grid two">${([0, 1] as const).map(axis => `<label class="number-field"><span>${axis === 0 ? 'X' : 'Z'}</span><input type="number" data-wall-move-axis="${axis}" aria-label="Move selected walls ${axis === 0 ? 'X' : 'Z'}" value="0" step="${snap ? '0.05' : '0.01'}" ${locked ? 'disabled' : ''}></label>`).join('')}</div></div>
      <ul class="group-members">${walls.map(wall => `<li>${escape(entityName(wall.id) ?? wall.id)}</li>`).join('')}</ul>
      <p class="field-note">${locked ? 'Unlock selected walls in Renovate before moving.' : 'Shift-click or use Select multiple items to add or remove walls. Esc clears the selection.'}</p>`;
    renderWallSelectionFinishes($('#wall-selection-finishes'), selectedWallIds, inspectorOptions, wallFinishSelection);
    $('#move-selection').onclick = () => setTool('move');
    $('#inspector').querySelectorAll<HTMLInputElement>('[data-wall-move-axis]').forEach(input => input.onchange = () => {
      if (!Number.isFinite(input.valueAsNumber)) { notify('Enter a finite distance.', true); renderInspector(); return; }
      const delta: [number, number] = [0, 0];
      delta[Number(input.dataset.wallMoveAxis)] = snap ? Math.round(input.valueAsNumber * 20) / 20 : input.valueAsNumber;
      if (!delta.some(value => Math.abs(value) > 1e-9)) { renderInspector(); return; }
      try { run(wallSelectionOperations(store.scene, selectedWallIds, delta), 'Move selected walls'); }
      catch (error) { notify(error instanceof Error ? error.message : 'The walls could not be moved.', true); }
      renderInspector();
    });
    return;
  }
  wallFinishSelection.selection = '';
  wallFinishSelection.surface = 'both';
  if (!object) {
    if (!selectedId || !renderEntityInspector($('#inspector'), selectedId, inspectorOptions)) $('#inspector').innerHTML = '';
    return;
  }
  if (selectedFurnitureIds.length > 1) {
    const grouped = !!selectedGroupId();
    const members = store.scene.objects.filter(item => selectedFurnitureIds.includes(item.id));
    $('#inspector').innerHTML = `<div class="selected-asset-heading"><span class="asset-symbol">${icon('layers')}</span><div><span class="eyebrow">${grouped ? 'Furniture group' : 'Multiple selection'}</span><h2>${members.length} objects</h2></div></div>
      <p class="field-note">${grouped ? 'Move or rotate any member to arrange the whole group.' : 'Move or rotate these pieces together. Group is optional and saves the selection for later.'}</p>
      <div class="property-section"><div class="property-label">Selected furniture</div><ul class="group-members">${members.map(item => `<li>${escape(item.name)}</li>`).join('')}</ul></div>
      <button id="move-selection" class="button primary full">${icon('move')} Move selected furniture</button>
      <div class="property-section"><div class="property-label">Selection position <span>m</span></div><div class="field-grid two"><label class="number-field"><span>X</span><input type="number" aria-label="Group position X" data-group-axis="0" value="${Number(object.position[0].toFixed(3))}" step="${snap ? '0.25' : '0.05'}"></label><label class="number-field"><span>Z</span><input type="number" aria-label="Group position Z" data-group-axis="2" value="${Number(object.position[2].toFixed(3))}" step="${snap ? '0.25' : '0.05'}"></label></div><p class="field-note">Position of ${escape(object.name)}; all members follow.</p></div><div class="property-section"><div class="property-label">Selection rotation <span>degrees</span></div><label class="number-field"><span>Y</span><input id="group-rotation" type="number" aria-label="Group rotation" value="${Number((object.rotation * 180 / Math.PI).toFixed(3))}" step="15"></label></div>
      <div class="object-actions"><button id="group-furniture" class="button primary" ${grouped ? 'hidden' : ''} title="Group · ⌘/Ctrl+G">${icon('layers')} Group</button><button id="ungroup-furniture" class="button" ${members.some(item => item.groupId) ? '' : 'hidden'} title="Ungroup · ⌘/Ctrl+Shift+G">Ungroup</button></div>
      <button id="delete-group" class="button full danger" style="margin-top:12px">${icon('trash')} Delete ${grouped ? 'group' : 'selected objects'}</button>
      <p class="field-note">Shift-click to add or remove furniture.${grouped ? ' Ungroup to edit or resize individual pieces.' : ''}</p>`;
    $('#move-selection').onclick = () => setTool('move');
    $('#group-furniture').onclick = groupSelected;
    $('#ungroup-furniture').onclick = ungroupSelected;
    $('#delete-group').onclick = deleteSelected;
    $('#inspector').querySelectorAll<HTMLInputElement>('[data-group-axis]').forEach(input => input.onchange = () => {
      if (!Number.isFinite(input.valueAsNumber)) { notify('Enter a finite number.', true); renderInspector(); return; }
      const position = [...object.position] as SceneObject['position'];
      position[Number(input.dataset.groupAxis)] = snap ? Math.round(input.valueAsNumber * 4) / 4 : input.valueAsNumber;
      updateSelected({ position }, 'Move furniture group');
    });
    $<HTMLInputElement>('#group-rotation').onchange = event => {
      const value = (event.target as HTMLInputElement).valueAsNumber;
      if (!Number.isFinite(value)) { notify('Enter a finite number.', true); renderInspector(); return; }
      updateSelected({ rotation: value * Math.PI / 180 }, 'Rotate furniture group');
    };
    return;
  }
  const asset=catalog.find(a=>a.id===object.assetId)!;
  const dimension=asset.dimensions.map((d,i)=>d*object.scale[i]!);
  const field=(name:string,label:string,value:number,step:string,min?:string)=>`<label class="number-field"><span>${label}</span><input type="number" aria-label="${name}" data-field="${name}" value="${Number(value.toFixed(3))}" step="${step}" ${min ? `min="${min}"` : ''}/></label>`;
  $('#inspector').innerHTML = `<div class="selected-asset-heading"><span class="asset-symbol" style="--asset-color:${escape(object.color??asset.color)}">${icon('box')}</span><div><span class="eyebrow">${escape(asset.category)}</span><h2>${escape(object.name)}</h2></div></div><p class="field-note">Shift-click other models to move them together, or use Select multiple items.</p><div id="inspector-replacement"></div><label class="text-field">Object name<input id="object-name" value="${escape(object.name)}" maxlength="80" /></label><div class="property-section"><div class="property-label">Position <span>m</span></div><div class="field-grid two">${field('Position X','X',object.position[0],snap?'0.25':'0.05')}${field('Position Z','Z',object.position[2],snap?'0.25':'0.05')}</div><p class="field-note">${icon('lock')} ${object.host ? 'Mounted on wall' : object.hangsFrom ? 'Hanging from the ceiling' : object.restsOn ? `Resting on ${escape(store.scene.objects.find(item => item.id === object.restsOn)?.name ?? 'furniture')}` : 'Grounded on the floor'}</p></div><div class="property-section"><div class="property-label">Rotation <span>degrees</span></div>${field('Rotation','Y',(object.rotation*180/Math.PI)%360,'15')}</div><div class="property-section"><div class="property-label">Dimensions <span>m</span></div><div class="field-grid">${field('Width','W',dimension[0]!,'0.01','0.01')}${field('Height','H',dimension[1]!,'0.01','0.01')}${field('Depth','D',dimension[2]!,'0.01','0.01')}</div></div>${asset.materialSlots?'<div id="inspector-finishes"></div>':`<div class="property-section"><div class="property-label">Finish <span>base material</span></div><div class="finish-row"><input id="object-color" type="color" aria-label="Object finish color" value="${escape(object.color??asset.color)}"/><span>${escape(object.color??asset.color)}</span><button id="reset-finish" class="text-button">Reset</button></div></div>`}<div class="object-actions"><button id="duplicate" class="button">${icon('duplicate')} Duplicate</button><button id="delete" class="button danger" title="Delete object" aria-label="Delete object">${icon('trash')}</button></div><div class="asset-reference"><span>Catalog reference</span><code>${escape(asset.id)}</code><span>${escape(catalogProducts.get(asset.id)?.attribution ?? "")} · size ${escape(catalogProducts.get(asset.id)?.sizeStatus ?? "unverified")}</span><span>Catalog price <strong>${escape(priceLabel(asset))}</strong></span></div>`;
  renderAssetChoices($('#inspector-replacement'), object, inspectorOptions);
  // Slotted models (made-to-measure kitchens) restyle per role; a whole-model colour would flatten them.
  if (asset.materialSlots) renderMaterialSlots($('#inspector-finishes'), object, inspectorOptions);
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
  if (!asset.materialSlots) {
    $('#object-color').onchange=event=>updateSelected({color:(event.target as HTMLInputElement).value},'Change finish');
    $('#reset-finish').onclick=()=>updateSelected({color:asset.color},'Reset finish');
  }
  $('#duplicate').onclick=duplicateSelected;
  $('#delete').onclick=deleteSelected;
}

function transformSelection(id: string, patch: ObjectPatch, label: string, revision = store.revision) {
  try { return run(selectionTransformOperations(store.scene, id, patch, selectedFurnitureIds), label, revision); }
  catch (error) { notify(error instanceof Error ? error.message : 'The selection could not be transformed.', true); return false; }
}
function updateSelected(patch:ObjectPatch,label:string) {if(selectedId){transformSelection(selectedId,patch,label);renderInspector();}}
function deleteSelected() {
  if (!selectedId || interacting) return;
  if (!selectedFurnitureIds.length) { notify('Use the element’s delete controls in Renovate to review its dependencies.'); return; }
  if (selectedFurnitureIds.length > 100) { notify('Ungroup and delete fewer than 100 pieces at a time.', true); return; }
  if (run(selectedFurnitureIds.map(id => ({type:'delete', id})), selectedFurnitureIds.length > 1 ? 'Delete selected furniture' : 'Delete object')) select(null);
}
function newFurniture(asset: CatalogAsset, original?: SceneObject): SceneObject {
  const object: SceneObject = original ? structuredClone(original) : { id: '', name: asset.name, assetId: asset.id, position: [0, 0, 0], rotation: 0, scale: [1, 1, 1] };
  object.id = uid(); delete object.groupId;
  if (original) object.name = `${original.name.slice(0, 115)} copy`;
  return object;
}
function commitFurnitureAddition(asset: CatalogAsset, object: SceneObject, position: Vec3, label: string, revision = store.revision): boolean {
  if (interacting || previewMode || proposalView) return false;
  if (store.scene.objects.length >= 400) { notify('This editor supports up to 400 furnishings.', true); return false; }
  object.position = [...position];
  try { object = placeFurniture(store.scene, catalog, object, undefined, viewport.furnitureSurface, position[1] > floorHeight(store.scene, object) ? position[1] + .02 : undefined); }
  catch (error) { notify(error instanceof Error ? error.message : 'No wall available.', true); return false; }
  const validation = validateScene({ ...store.scene, objects: [...store.scene.objects, object] }, catalog);
  if (!validation.ok) { notify(validation.errors[0] ?? 'Furniture cannot be placed here.', true); return false; }
  if (!object.host && !object.restsOn && !object.hangsFrom && !floorSupported(object, asset, store.scene)) { notify('Place the whole piece on the apartment floor.', true); return false; }
  if (!run([{ type: 'add', object }], label, revision)) return false;
  select(object.id); setTool('move'); viewport.animatePlacement(object.id);
  notify(`${object.name} added. Drag the piece or its arrows to move it.${validation.warnings.length ? ` ${validation.warnings[0]}` : ''}`);
  return true;
}
function addAsset(asset: CatalogAsset, original?: SceneObject) {
  if (interacting || previewMode || proposalView) return;
  if (store.scene.objects.length >= 400) { notify('This editor supports up to 400 furnishings.', true); return; }
  const object = newFurniture(asset, original);
  const selected = original ?? store.scene.objects.find(item => item.id === selectedId);
  const room = store.scene.rooms.find(item => item.id === selectedId)
    ?? (selected && store.scene.rooms.find(item => inRoom(selected.position[0], selected.position[2], item.polygon)));
  const position = suggestFurniturePosition(store.scene, catalog, object, room?.id,
    original ? [original.position[0] + .5, original.position[2] + .5] : undefined);
  if (!position) { notify('No supported floor position found. Drag the piece onto a clear floor area, or choose a smaller piece.', true); return; }
  commitFurnitureAddition(asset, object, position, original ? 'Duplicate object' : `Add ${asset.name}`);
}
function duplicateSelected(){if(selectedFurnitureIds.length>1){notify('Ungroup to duplicate an individual piece.');return;}const o=store.scene.objects.find(o=>o.id===selectedId);const a=catalog.find(a=>a.id===o?.assetId);if(o&&a)addAsset(a,o);}

async function refreshBuiltPieces() {
  if (!architectLive || builtLoading) return;
  builtLoading = true; builtError = ''; renderAssets();
  try {
    const result = await loadBuiltProducts(builtOptions);
    registerProducts(result.products);
    builtProducts = result.products.map(product => catalogProducts.get(product.asset.id)!);
    renderInspector();
  } catch (error) {
    builtError = error instanceof Error ? error.message : 'Built furniture unavailable.';
  } finally { builtLoading = false; renderAssets(); }
}
async function searchDatabase(more = false) {
  clearTimeout(catalogSearchTimer);
  catalogRequest?.abort();
  const request = new AbortController(); catalogRequest = request;
  const offset = more ? catalogNextOffset ?? 0 : 0;
  catalogLoading = true; catalogError = ''; catalogNextOffset = null;
  if (!offset) { catalogResults = []; catalogExcluded = 0; }
  renderAssets();
  try {
    const result = assetCategory === BUILT_CATEGORY ? { products: [], excluded: 0, nextOffset: null } : await databaseCatalog.search($<HTMLInputElement>('#asset-search').value.trim(), assetCategory, request.signal, offset);
    if (request.signal.aborted) return;
    const page = result.products.filter(product => !catalogResults.some(shown => shown.asset.id === product.asset.id));
    registerProducts(page);
    catalogResults = [...catalogResults, ...page]; catalogExcluded += result.excluded;
    catalogNextOffset = catalogResults.length < CATALOG_BROWSE_LIMIT ? result.nextOffset : null;
    renderInspector();
  } catch (error) {
    if (request.signal.aborted) return;
    catalogError = error instanceof Error ? error.message : 'Furniture database unavailable. Please retry.';
  } finally {
    if (!request.signal.aborted) { catalogLoading = false; renderAssets(); }
  }
}
function renderAssets(){
  const query = $<HTMLInputElement>('#asset-search').value.trim().toLowerCase();
  const built = builtProducts.filter(({asset}) => (!assetCategory || assetCategory === BUILT_CATEGORY || asset.kind === assetCategory)
    && `${asset.name} ${asset.category} ${asset.kind}`.toLowerCase().includes(query));
  const results = [...built, ...catalogResults];
  const loading = catalogLoading || builtLoading;
  const errors = [catalogError, builtError].filter(Boolean).join(' ');
  $('#asset-count').textContent = String(results.length);
  $('#catalog-status').textContent = [loading ? 'Loading furniture…' : `${catalogResults.length} database options · ${built.length} built pieces${catalogExcluded ? ` · ${catalogExcluded} unavailable or unsupported models omitted` : ''}`, errors].filter(Boolean).join(' ');
  $('#catalog-retry').hidden = !errors;
  $('#asset-list').setAttribute('aria-busy', String(loading));
  $('#asset-list').innerHTML = results.length ? results.map(({asset:a,sizeStatus})=>`<button class="asset-card" data-asset="${escape(a.id)}" aria-label="Add ${escape(a.name)}"><div class="asset-preview" data-preview="${escape(a.id)}">${icon('box')}</div><span class="asset-add" aria-hidden="true">+</span><strong class="asset-title">${escape(a.name)}</strong><span class="asset-meta"><span>${a.dimensions[0].toFixed(2)} × ${a.dimensions[2].toFixed(2)} m · ${escape(sizeStatus)}</span></span><span class="asset-price">${escape(priceLabel(a))}</span></button>`).join('') : `<p class="empty-message">${loading ? 'Loading furniture…' : errors ? 'Check the furniture connections, then retry.' : 'No matching 3D furniture. Try a different search or category.'}</p>`;
  if(results.length&&catalogNextOffset!==null&&!loading)$('#asset-list').insertAdjacentHTML('beforeend','<button id="catalog-more" class="button full">Show more furniture</button>');
  $('#asset-list').querySelectorAll<HTMLButtonElement>('[data-asset]').forEach(card => {
    const asset = catalog.find(item => item.id === card.dataset.asset);
    if (!asset) return;
    bindFurnitureDragCard(card, asset, {
      enabled: () => !interacting && !previewMode && !proposalView,
      add: () => addAsset(asset),
      start: item => {
        if (activeFinish) chooseFinish(null);
        if (view === 'plan' || view === 'inside') { setView('top'); notify('Drop furniture onto the floor in Top view.'); }
        viewport.setFurnitureDrag(item);
      },
      end: () => viewport.setFurnitureDrag(null),
    });
  });
  document.querySelector<HTMLButtonElement>('#catalog-more')?.addEventListener('click',()=>void searchDatabase(true));
  catalogPreviews.setAssets(results.map(product => product.asset));
}
function switchPanel(panel:Panel, toggle=false){
  if (panel !== 'materials' && activeFinish) chooseFinish(null);
  panelOpen=toggle && activePanel===panel ? !panelOpen : true;
  if (!panelOpen && activeFinish) chooseFinish(null);
  activePanel=panel;
  const leftOpen = panelOpen && panel !== 'assets';
  $('.workspace').classList.toggle('left-collapsed', !leftOpen);
  $('.left-panel').hidden = !leftOpen;
  $('#furniture-library').hidden = !furniturePanelOpen();
  $('.workspace').classList.toggle('renovation-active', panel === 'renovation' && panelOpen);
  for(const name of ['scene','assets','assistant','renovation','materials','ceilings']){
    $(`#${name}-panel`).hidden=panel!==name;
    $(`#${name}-tab`).classList.toggle('active',panel===name && panelOpen);
    $(`#${name}-tab`).setAttribute('aria-expanded',String(panel===name && panelOpen));
  }
  $('#panel-title').textContent={scene:'Scene',assets:'Furniture',assistant:'Assistant',renovation:'Renovation studio',materials:'Materials',ceilings:'Ceilings & lights'}[panel];
  renderInspector();
  if (furniturePanelOpen()) {
    renderAssets();
    $('#asset-search').focus({ preventScroll: true });
    if (selectedId) scheduleSelectionReveal();
  }
  if(panel==='renovation' && panelOpen)renovationUI?.render();
  if(panel==='ceilings' && panelOpen)ceilingUI.render();
  if(pending)renderProposal();
  folioShell?.update();
}
function renderViewportHints() {
  if (view === 'inside') {
    $('#view-hint').innerHTML = 'Drag to look <b>·</b> WASD / arrows to walk <b>·</b> Esc to leave';
    return;
  }
  if (activeFinish && !previewMode) {
    $('#view-hint').textContent = `${activeFinish.name} · Click ${activeFinish.category === 'floor' ? 'a floor' : 'a wall face'} to apply · Esc to cancel`;
    return;
  }
  if (view === 'plan') {
    $('#view-hint').textContent = 'Shift-click or Select several · Drag selection to move · Space + drag to pan · Esc to cancel';
    return;
  }
  const openingWall = store.scene.walls.find(w => w.openings.some(o => o.id === selectedId));
  const opening = openingWall?.openings.find(o => o.id === selectedId);
  const wall = store.scene.walls.find(w => w.id === selectedId);
  const fineSnap = opening?.kind === 'window' || tool === 'move' && !!(opening || wall);
  const snapStep = fineSnap ? OPENING_MOVE_SNAP : 0.25;
  $('#snap').classList.toggle('active', snap);
  $('#snap').setAttribute('aria-pressed', String(snap));
  const wallSnap = !!wall && tool === 'move';
  $('#snap').innerHTML = `${icon('grid')}<strong>${snap ? wallSnap ? 'Snap · 90°' : `Snap · ${snapStep.toFixed(2)} m` : 'Smooth'}</strong>`;
  $('#snap').title = wallSnap ? 'Toggle wall snapping: 90° alignments and 0.05 m steps · Off for smooth movement' : `Toggle ${snapStep.toFixed(2)} m snapping${opening && tool === 'move' ? ' along wall' : ''} · Off for smooth movement`;
  $('#snap').setAttribute('aria-label', `${snap ? 'Disable' : 'Enable'} ${wallSnap ? 'wall angle and grid' : `${snapStep.toFixed(2)} m`} snapping`);

  const navigation = view === 'top' ? 'WASD / arrows to move <b>·</b> Drag or Space + drag to pan <b>·</b> Scroll to zoom' : 'WASD / arrows to move <b>·</b> Drag to orbit <b>·</b> Space + drag to pan <b>·</b> Scroll to zoom';
  let hint = navigation;
  if (previewMode) hint = `${navigation} <b>·</b> P or Esc to exit preview`;
  else if (multiSelection) { hint = 'Click walls or models to add or remove them <b>·</b> Choose Move when ready'; }
  else if (selectedWallIds.length > 1) { hint = 'Choose Move (G), then drag selected walls together <b>·</b> Shift-click to change selection <b>·</b> Esc cancels'; }
  else if (selectedFurnitureIds.length > 1) {
    hint = selectedGroupId() ? 'Move or rotate the group <b>·</b> Shift-click to change selection <b>·</b> Ungroup to edit a piece' : 'Choose Move (G) to move all selected models <b>·</b> Shift-click to change selection';
  } else if (selectedFurnitureIds.length === 1) {
    hint = `${navigation} <b>·</b> Shift-click models to select several`;
  } else if (opening && openingWall) {
    if (store.scene.project?.metadata[opening.id]?.locked || store.scene.project?.metadata[openingWall.id]?.locked) {
      hint = 'Opening or wall is locked <b>·</b> Unlock model editing in Renovate to move it';
    } else if (opening.kind === 'window') {
      hint = view === 'top' ? 'Drag the center to move or side handles to resize <b>·</b> Use 3D for height <b>·</b> Esc cancels'
        : 'Drag the window or center to move <b>·</b> Drag edges or corners to resize <b>·</b> Esc cancels';
    } else if (tool === 'move') {
      hint = `Drag the ${opening.kind} or purple arrows along its wall <b>·</b> Esc cancels`;
    } else {
      hint = `Choose Move or press G to move this ${opening.kind} along its wall`;
    }
  } else if (wall && tool === 'move') {
    hint = store.scene.project?.metadata[wall.id]?.locked
      ? 'Wall is locked <b>·</b> Unlock model editing in Renovate to move it'
      : `Drag the wall or purple arrows; drag endpoint spheres to adjust corners <b>·</b> ${snap ? '90° snapping on' : 'Smooth movement'} <b>·</b> Esc cancels`;
  }
  $('#view-hint').innerHTML = hint;
}
function setMultiSelection(enabled: boolean) {
  multiSelection = enabled;
  viewport.setAdditiveSelection(enabled); floorPlan.setAdditiveSelection(enabled);
  $('#multi-select').classList.toggle('active', enabled);
  $('#multi-select').setAttribute('aria-pressed', String(enabled));
  renderViewportHints();
}
function setTool(next:ToolMode){if(next!=='select')setMultiSelection(false);if(view==='inside')setView('perspective');if(next==='scale'&&selectedFurnitureIds.length>1){notify('Select one ungrouped model to resize.');return;}if(activeFinish)chooseFinish(null);tool=next;viewport.setTool(tool);document.querySelectorAll<HTMLElement>('[data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));});renderViewportHints();}
function renderTopLightingControls(): void {
  const button = $<HTMLButtonElement>('#top-lighting');
  button.hidden = true;
  button.setAttribute('aria-pressed', String(topLightingEnabled));
  button.classList.toggle('active', topLightingEnabled);
  button.querySelector('span')!.textContent = topLightingEnabled ? 'Lighting on' : 'Lighting off';
  button.title = topLightingEnabled ? 'Turn off lighting and shadows for an even floor plan' : 'Show scene lighting and shadows in Top view';
  sunControls?.setVisible(view !== 'plan');
}
function setView(next:ApartmentView){
  cancelAnimationFrame(selectionRevealFrame);
  if ((next === 'plan' || next === 'inside') && activeFinish) chooseFinish(null);
  if (next === 'plan' && previewMode) setPreview(false);
  viewport.cancelInteraction();
  if (viewport.setView(next === 'plan' ? 'perspective' : next) === false) return;
  if (next === 'inside' && view !== 'inside') insideReturnView = view;
  view=next;
  $<HTMLSelectElement>('#skybox').disabled = view === 'plan';
  $('.viewport-shell').classList.toggle('skybox-active', selectedSkybox !== 'studio' && (view === 'perspective' || view === 'inside'));
  app.classList.toggle('inside-mode', view === 'inside');
  if (view === 'inside') select(null);
  const isPlan = view === 'plan';
  renderTopLightingControls();
  $('.viewport-shell').classList.toggle('plan-mode', isPlan);
  $('#viewport').hidden = isPlan;
  $('#floor-plan').hidden = !isPlan;
  floorPlan.setVisible(isPlan);
  if (view === 'inside') $('#viewport canvas')?.focus({ preventScroll: true });
  for (const [id, mode] of [['perspective','perspective'],['top-view','top'],['inside-view','inside'],['plan-view','plan']]) {
    $(`#${id}`).classList.toggle('active',view===mode);
    $(`#${id}`).setAttribute('aria-pressed',String(view===mode));
  }
  renderWallControls();
  renderViewportHints();
  folioShell?.update();
}
/** `frame`: frame the flat on entering (a designer proposal frames its own room instead). */
function setPreview(enabled:boolean, frame = true, retainSceneOnExit = false){
  if (activeFinish) chooseFinish(null);
  viewport.cancelInteraction();
  if (enabled) {
    previewReturnView = view;
    if (view === 'plan') setView('perspective');
  }
  if (!enabled) endReview();
  if (!enabled && proposalView) {
    proposalView = false; designConstruction.clear();
    // Approving an already visible design commits that same picture without retiring/reloading its models.
    if (!retainSceneOnExit) viewport.setScene(store.scene, catalog);
    $<HTMLButtonElement>('#save').disabled = false;
  }
  previewMode=enabled;
  select(null);
  app.classList.toggle('preview-mode',enabled);
  $('#preview').setAttribute('aria-pressed',String(enabled));
  $('#preview').setAttribute('aria-label', enabled ? 'Exit preview' : 'Preview apartment');
  $('#preview').title = enabled ? 'Exit preview · P' : 'Preview apartment · P';
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
  if (view !== 'inside' && frame && !guidedDesign) requestAnimationFrame(()=>focusView());
  folioShell?.update();
}

function applyPendingProposal(){
  if(!pending||interacting||previewMode)return {ok:false,message:'Finish your current edit or preview before applying.'};
  const proposal=pending;const result=store.execute(proposal.command,true);
  if(result.ok){pending=null;renderProposal();select(null);focusView();notify(`${proposal.title} applied`);}else notify(result.errors.join(' '),true);
  return {ok:result.ok,message:result.errors.join(' ')};
}
function renderProposal(){
  $('#proposal-badge').hidden=!pending;
  const el=$('#proposal');if(!pending){el.innerHTML='';return;}
  if(designerLive && pending.command.source==='designer'){el.innerHTML='';return;}
  // Recorded replies keep their existing review controls beside the conversation.
  // Explicit Assistant and reconstruction workflows retain their own review home.
  const reviewHost = !designerLive && pending.command.source === 'designer' && !(panelOpen && activePanel === 'assistant')
    ? designerHost.querySelector('.designer-chat-scroll') : $('#assistant-panel .assistant-card');
  if (reviewHost && el.parentElement !== reviewHost) reviewHost.append(el);
  const stale=pending.command.baseRevision!==store.revision;
  const canInspect = pending.command.operations.some(o => o.type === 'replace-scene' || o.type === 'replace-structure');
  el.innerHTML=`<div class="proposal"><span class="eyebrow">${pending.command.source==='architect'?'Reconstruction review':'Proposed change'}</span><strong>${escape(pending.title)}</strong><p>${escape(pending.description)}</p>${stale?'<p class="proposal-warning">The scene has changed. Request a fresh proposal.</p>':interacting?'<p class="proposal-warning">Finish your current edit before applying.</p>':''}${canInspect?`<button id="inspect-proposal" class="button full" ${stale||interacting?'disabled':''}>Inspect proposed 3D apartment</button>`:''}<div><button id="apply-proposal" class="button primary" ${stale||interacting||previewMode?'disabled':''}>Apply change</button><button id="reject-proposal" class="button quiet">Dismiss</button></div></div>`;
  $('#apply-proposal').onclick=()=>{ applyPendingProposal(); };
  if(canInspect)$('#inspect-proposal').onclick=()=>{
    if(!pending||pending.command.baseRevision!==store.revision||interacting)return;
    try {
      const proposed = previewReconstructionProposal(store.scene, store.revision, pending, catalog);
      setPreview(true);proposalView=true;$<HTMLButtonElement>('#save').disabled=true;viewport.setScene(proposed,catalog);focusView();notify('Proposed apartment preview. Exit Preview to apply or dismiss it.');
    } catch (error) { notify(error instanceof Error ? error.message : String(error), true); }
  };
  $('#reject-proposal').onclick=()=>{pending=null;renderProposal();notify('Proposal dismissed');};
}
async function requestProposal(kind:'designer'|'architect'){
  if(kind==='designer' && designerLive){if(panelOpen)switchPanel(activePanel,true);designerPanel.open();await designerPanel.controller.suggest();return;}
  if(busy)return;switchPanel('assistant');busy=true;$<HTMLButtonElement>('#suggest').disabled=true;$('#suggest').innerHTML=`${icon('sparkles')} Considering your space…`;
  const revision=store.revision;const scene=store.scene;
  try{
    if(kind==='designer')pending=await createDesignerAdapter(catalog).propose(scene,revision);
    else{const result=await structureAdapter.reconstruct();pending=createReconstructionProposal(scene,revision,result,architectLive,uid());}
    renderProposal();notify('Proposal ready in Assistant. Review before applying.');
  }catch(error){notify(error instanceof Error?error.message:String(error),true);}
  finally{busy=false;$<HTMLButtonElement>('#suggest').disabled=false;$('#suggest').innerHTML=`${icon('sparkles')} Suggest an edit ${icon('arrow')}`;}
}

function renderWallControls() {
  const inside = view === 'inside';
  const mode = inside ? 'full' : wallMode;
  const checkbox = $<HTMLInputElement>('#show-outer-walls');
  checkbox.checked = mode === 'full';
  checkbox.disabled = inside || view === 'plan';
  const walls = $<HTMLButtonElement>('#walls');
  walls.disabled = checkbox.disabled;
  walls.title = inside ? 'Inside view always shows full walls' : view === 'plan' ? 'Change wall visibility in 3D or Top view' : 'Cycle wall visibility';
  $('#walls span').textContent = { cutaway: 'Cutaway', full: 'Full walls', hidden: 'Walls hidden' }[mode];
  $('#wall-visibility-note').textContent = inside ? 'Inside view always shows full walls.'
    : view === 'plan' ? 'Switch to 3D or Top to change wall visibility.'
    : mode === 'full' ? 'All walls, doors and windows are shown at full height.'
    : mode === 'hidden' ? 'All walls are hidden. Check to show them at full height.'
    : 'Cutaway lowers nearby outer walls to reveal the rooms.';
}

function setWallMode(next: WallMode) {
  wallMode = next;
  viewport.setWalls(wallMode);
  renderWallControls();
}

function showFullHeight() {
  if (view === 'plan' || view === 'top') setView('perspective');
  setWallMode('full');
}

function refresh(){
  designerCatalog.prune(store.revision);
  const scene=store.scene;
  if (shareSession && !shareSession.matchesProject(scene.id, shareOwnerId())) {
    shareSession = null; if (!editorSession) savedRevision = -1;
    history.replaceState(null, '', location.pathname + location.search);
  }
  selectedFurnitureIds = expandFurnitureSelection(scene, selectedFurnitureIds);
  selectedWallIds = selectedWallIds.filter(id => scene.walls.some(wall => wall.id === id));
  if(selectedId&&!entityName(selectedId))selectedId=selectionIds().at(-1)??null;
  // The architect temporarily owns this renderer; background catalog/save refreshes
  // must not replace the streamed shell with the checked editor document mid-build.
  // Keep a checked proposal visible through background catalog and save refreshes.
  if (review && review.proposal.command.baseRevision !== store.revision) setPreview(false);
  if (!stage && !review) { viewport.setScene(scene,catalog);viewport.setSelection(selectedId, selectionIds()); }
  // A whole design arriving at once (import, designer apply) paints the 3D view in this frame;
  // the plan, panels and inspectors follow after it, so no single frame carries all of it.
  const heavy = heavyChange(scene);
  clearTimeout(panelsTimer); panelsTimer = undefined;
  if (heavy) { requestAnimationFrame(() => { panelsTimer = setTimeout(() => { panelsTimer = undefined; refreshPanels(); }, 0); }); refreshHeader(scene); }
  else refreshPanels();
}
let panelsTimer: ReturnType<typeof setTimeout> | undefined;
let lastRefreshObjects: readonly SceneObject[] | undefined;
function heavyChange(scene: SceneDocument): boolean {
  const previous = lastRefreshObjects; lastRefreshObjects = scene.objects;
  if (!previous || previous === scene.objects) return false;
  let changed = Math.abs(previous.length - scene.objects.length);
  const ids = new Set(previous.map(object => object.id));
  for (const object of scene.objects) if (!ids.has(object.id)) changed++;
  return changed > 12;
}
function refreshPanels(){
  const scene=store.scene;
  floorPlan.setScene(scene,catalog);floorPlan.setSelection(selectedId, selectionIds());
  refreshHeader(scene);
  $('#apartment-height').innerHTML = heightControlMarkup(scene);
  bindHeightControl($('#apartment-height'), { getScene: () => store.scene, execute: (operations, label, onDeferredApply) => run(operations, label, store.revision, onDeferredApply), notice: notify, showFullHeight });
  renderWallControls();
  renderHierarchy();renderInspector();renderProposal();
  renovationUI?.render();
  ceilingUI.render();
  $('#selection-status').textContent=selectionLabel();
  renderViewportHints();
  folioShell?.update();
}
function refreshHeader(scene: SceneDocument){
  $('#project-name').textContent=scene.name;
  const area=scene.rooms.reduce((sum,r)=>sum+Math.abs(r.polygon.reduce((a,p,i)=>{const q=r.polygon[(i+1)%r.polygon.length]!;return a+p[0]*q[1]-q[0]*p[1];},0))/2,0);
  $('#scene-area').textContent=`${area.toFixed(0)} m² · approximate — check with a tape measure`;
  $('#room-count').textContent=`${scene.rooms.length} rooms`;
  $('#revision').textContent=`Revision ${store.revision}`;
  $<HTMLButtonElement>('#undo').disabled=previewMode||!store.canUndo;$<HTMLButtonElement>('#redo').disabled=previewMode||!store.canRedo;
  const activeSavedRevision = editorSession ? savedRevision : shareSession?.savedRevision ?? savedRevision;
  const saving = accountSaving || (!editorSession && Boolean(shareSession?.saving));
  $('#save-state').textContent = saving ? 'Saving…' : store.revision === activeSavedRevision
    ? editorSession ? 'Saved to My apartments' : shareSession ? 'Saved to shared project' : 'Saved on this device'
    : store.revision === 0 ? editorSession ? 'Not saved yet' : 'Empty apartment' : 'Unsaved changes';
  $<HTMLButtonElement>('#save').disabled = proposalView || saving;
  $('#save').title = editorSession ? 'Save to My apartments · ⌘S' : shareSession ? 'Save shared progress · ⌘S' : 'Save on this device · ⌘S';
  $('.project-name > span').textContent = editorSession ? editorSession.apartment ? 'My apartment' : 'Plan copy' : shareSession ? 'Shared project · Can edit' : 'Sandbox · local project';
  if (shareSession && !editorSession && $('#status-text').textContent === 'All changes stay on this device') $('#status-text').textContent = 'Save publishes progress to this shared project';
  teamSaves?.render();
  const publish = document.querySelector<HTMLButtonElement>('#publish-progress');
  if (publish) {
    publish.hidden = !shareSession;
    publish.disabled = proposalView || !shareSession || shareSession.saving || shareSession.savedRevision === store.revision;
    publish.textContent = shareSession?.saving ? 'Publishing…' : shareSession?.savedRevision === store.revision ? 'Progress published' : 'Publish progress';
  }
}
store.subscribe(refresh);
const designerHost = document.createElement('section');
// Designer and general tools share the left workspace.
$('.workspace').classList.add('designer-workspace');$('.left-panel').before(designerHost);
const designerPanel = mountDesignerPanel(designerHost, {
  ask: designerLive ? async (request, options) => {
    // The request carries the products this scene already uses; the designer searches the catalog itself,
    // and purchases it proposes are fetched by id through the same lookup as saved projects.
    const products = structuredClone([...catalogProducts.values()]);
    const reply = await askDesigner({ ...request, catalog: products.map(product => product.asset), catalogCurrency: CATALOG_CURRENCY }, { ...options,
      // Rooms finished so far are previewed like a proposal, so their products must be known to the editor too.
      onPartial: partial => { if (request.revision === store.revision) designerCatalog.remember(partial.proposal, [...products]); options?.onPartial?.(partial); },
      onEvent: event => { if (options?.signal?.aborted) return; options?.onEvent?.(event); designConstruction.event(event); },
      resolveAssets: async (ids, signal) => {
        const found = await databaseCatalog.resolve(ids, signal);
        products.push(...found);
        return found.map(product => product.asset);
      } });
    if (reply.type === 'proposal' && !options?.signal?.aborted && request.revision === store.revision) {
      const customProducts = (reply.assets ?? []).map(asset => ({ asset, attribution: 'Custom piece for this flat', priceSource: 'sample custom estimate; workshop confirms', sizeStatus: 'reserved layout size' }));
      designerCatalog.remember(reply.proposal, [...products, ...customProducts]);
    }
    return reply;
  } : undefined,
  live: designerLive, snapshot: () => ({ scene: store.scene, revision: store.revision, catalog, catalogCurrency: CATALOG_CURRENCY }),
  health: designerLive ? () => designerHealth() : undefined,
  isPreviewing: () => previewMode && proposalView,
  // Talking to the designer stays open while its proposal is previewed.
  subscribe: listener => store.subscribe(listener), canRequest: () => !busy && (!previewMode || review !== null),
  autoPreview: true,
  onBusyChange: waiting => {
    busy = waiting; $<HTMLButtonElement>('#suggest').disabled = waiting; proposalBar.setBusy(waiting);
    if (waiting) designConstruction.clear();
    else queueMicrotask(() => {
      if (!guidedDesign || !pending || busy || pending.id === guidedPreviewId) return;
      const proposal = pending; guidedPreviewId = proposal.id;
      if (review?.proposal.id === proposal.id || designerPanel.controller.act(proposal.id, 'preview')) designOnboarding?.review(proposal);
      else { designConstruction.clear(); designOnboarding?.error(designerPanel.controller.state.messages.at(-1)?.text ?? 'This design could not be previewed. Please ask for a fresh proposal.'); }
    });
  },
  onStateChange: state => {
    designOnboarding?.update(state);
    if (!state.busy && state.messages.at(-1)?.status === 'stale') designOnboarding?.error('Your apartment changed while the designer was working. Ask for a fresh design.');
    if (!state.busy && !state.messages.at(-1)?.proposal) designConstruction.clear();
  },
  onProposal: proposal => { pending = proposal; renderProposal(); },
  onResetReview: () => { designConstruction.clear(); if(pending?.command.source==='designer'){if(proposalView)setPreview(false);pending=null;renderProposal();} },
  onProposalAction: (proposal, action) => {
    if(interacting)return {ok:false,message:'Finish your current edit before reviewing a proposal.'};
    if(action!=='dismiss') {
      if(proposal.command.baseRevision!==store.revision)return {ok:false,message:'This proposal is stale. Request a fresh proposal.'};
      const products = designerCatalog.products(proposal, store.revision);
      if(products.length)registerProducts(products);
    }
    // A newer preview replaces the one on screen in place; approval retains its models.
    const continuing = action === 'preview' && previewMode && proposalView && review !== null;
    const alreadyPreviewed = action === 'apply' && proposalView && review?.proposal.id === proposal.id;
    if(previewMode && !continuing)setPreview(false, !alreadyPreviewed, alreadyPreviewed);
    pending=proposal;
    if(action==='dismiss'){designConstruction.clear();designerCatalog.forget(proposal);pending=null;renderProposal();if(!guidedDesign)notify('Proposal dismissed');return {ok:true};}
    const originalObjects = new Map(store.scene.objects.map(object => [object.id, JSON.stringify(object)]));
    const changedIds = (scene: SceneDocument) => scene.objects.filter(object => originalObjects.get(object.id) !== JSON.stringify(object)).map(object => object.id);
    if(action==='apply') {
      const result = applyPendingProposal();
      if (!result.ok && alreadyPreviewed) viewport.setScene(store.scene, catalog);
      if(result.ok && !guidedDesign && !alreadyPreviewed) designConstruction.preview(store.scene, catalog, changedIds(store.scene));
      return result;
    }
    const proposed=previewDesignerProposal(store.scene,store.revision,proposal,catalog);
    if(!previewMode)setPreview(true, false);
    proposalView=true;$<HTMLButtonElement>('#save').disabled=true;viewport.setScene(proposed,catalog);
    const shown = continuing && review ? review.shown : new Set<string>();
    const arrival = proposalArrival(store.scene, proposed, shown);
    review = { proposal, scene: proposed, shown: new Set([...shown, ...arrival.added]) };
    if (guidedDesign) {
      designConstruction.preview(proposed, catalog, changedIds(proposed));
    } else {
      designConstruction.clear();
      viewport.presentArrival({ roomId: arrival.roomId, ids: arrival.ids, elsewhere: arrival.elsewhere, available: arrivalArea() });
      // Partial room previews belong to the turn in flight and cannot be accepted.
      proposalBar.show(proposal, { partial: designerPanel.controller.state.partial?.proposal.id === proposal.id, busy });
    }
    return {ok:true};
  },
});
folioShell = mountFolioShell({
  viewport, currency: CATALOG_CURRENCY === 'AMD' ? 'AMD' : null,
  getScene: () => store.scene, getCatalog: () => catalog, getSelectedId: () => selectedId, getView: () => view,
  setTool, openPanel: panel => switchPanel(panel), closePanel: () => { if (panelOpen) switchPanel(activePanel, true); }, isPanelOpen: panel => panelOpen && (!panel || activePanel === panel),
  remove: deleteSelected, undo: () => $<HTMLButtonElement>('#undo').click(),
  toggleInspector: () => setInspectorOpen(!inspectorVisible()), isInspectorOpen: inspectorVisible,
  askAbout: id => { attachToDesigner(id, store.scene); },
});
window.addEventListener('pagehide', event => { if (!event.persisted) { designOnboarding?.dispose(); designConstruction.dispose(); designerPanel.dispose(); folioShell?.dispose(); } });
/** Pitch tour of the finished flat. Other lanes start it with document.dispatchEvent(new CustomEvent('varpet:tour')). */
const tourButton = document.createElement('button');
tourButton.type = 'button'; tourButton.className = 'folio-action'; tourButton.dataset.folio = 'tour';
tourButton.setAttribute('aria-label', 'Play a guided tour of the flat; any input stops it');
tourButton.innerHTML = `${icon('sparkles')}<span>Tour</span>`;
document.querySelector('.folio-dock [data-slot=actions]')?.prepend(tourButton);
async function startTour(): Promise<boolean> {
  if (stage || modal.open) return false;
  tourButton.setAttribute('aria-pressed', 'true');
  if (view !== 'perspective') setView('perspective');
  try { return await viewport.playTour(); }
  finally { tourButton.removeAttribute('aria-pressed'); setView(viewport.cameraPose() ? 'perspective' : 'inside'); }
}
tourButton.onclick = () => { void startTour(); };
document.addEventListener('varpet:tour', () => { void startTour(); });
/** Lane pitch's shopping list on the proposal card selects and frames a listed piece. */
document.addEventListener('varpet:select', event => {
  const ids = ((event as CustomEvent).detail?.ids ?? []) as string[];
  if (review) {
    const shown = review.scene, id = ids.find(entry => shown.objects.some(object => object.id === entry));
    if (id) viewport.focus(id);
    return;
  }
  const id = ids.find(entry => store.scene.objects.some(object => object.id === entry));
  if (id && !previewMode) { select(id); focusView(id); }
});

const modal=$<HTMLDialogElement>('#modal');
if (architectLive && new URLSearchParams(location.search).has('architect')) queueMicrotask(replayMode ? () => void replayArchitect() : openArchitect);
void designerPanel.playSession(async scene => { const doc = await parseDatabaseScene(JSON.stringify(scene)); const ok = run([{ type: 'replace-scene', scene: doc }], 'Open recorded session'); if (ok) { select(null); focusView(); refresh(); } return ok; });
/** ?open=/demo-flats/<name>.json loads a saved design shipped with the editor (designer demo exports); same origin only. */
const openDocument = new URLSearchParams(location.search).get('open');
if (openDocument && /^\/demo-flats\/[\w-]+\.json$/.test(openDocument)) queueMicrotask(async () => {
  try {
    const scene = await parseDatabaseScene(await (await fetch(openDocument, { cache: 'no-store' })).text());
    if (run([{ type: 'replace-scene', scene }], 'Open saved design')) { select(null); focusView(); refresh(); }
  } catch (error) { notify(error instanceof Error ? error.message : String(error), true); }
});
const sharingUI = mountSharing($<HTMLButtonElement>('#share'), {
  async revokeLink() {
    if (accountSaving) throw new Error('Wait for your apartment to finish saving, then try again.');
    const session = shareSession, apartment = editorSession?.apartment;
    if (!session && !apartment?.sharing) throw new Error('There is no active sharing link.');
    accountSaving = true;
    try {
      if (session) {
        await session.revoke();
        // Drop the revoked capability even if account cleanup needs a retry.
        if (shareSession === session) shareSession = null;
        if (editorSession) editorSession.sharingSession = null;
        else savedRevision = -1;
        if (location.hash.startsWith('#share=')) history.replaceState(null, '', location.pathname + location.search);
      }
      if (apartment?.sharing && editorSession) {
        // The account API's typed helper only accepts new references; this endpoint
        // also accepts null to remove an association and tolerates an already revoked link.
        const response = await fetch(`/api/apartments/${encodeURIComponent(apartment.id)}/sharing`, {
          method: 'PUT', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: apartment.version, reference: null }),
          signal: AbortSignal.timeout(30000),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Could not clear sharing from My apartments. Try again.');
        editorSession.apartment = result.apartment;
        editorSession.sharingSession = null;
      }
      if (editorSession) editorSession.sharingError = undefined;
      if (location.hash.startsWith('#share=')) history.replaceState(null, '', location.pathname + location.search);
    } finally {
      accountSaving = false;
      refresh();
    }
  },
  async createLink(access) {
    if (accountSaving) throw new Error('Wait for your apartment to finish saving, then try again.');
    if (editorSession && (!editorSession.apartment || editorSession.apartment.scene.id !== store.scene.id)) {
      await saveToAccount();
      if (!editorSession.apartment || editorSession.apartment.scene.id !== store.scene.id)
        throw new Error('Save this apartment to My apartments before creating its shared link.');
    }
    if (!shareSession && editorSession?.apartment?.sharing) {
      shareSession = await restoreApartmentSharing(editorSession.apartment, store.scene, [...catalogProducts.values()]);
      if (shareSession) {
        // Reconnection after local edits has no matching revision until explicitly published.
        shareSession.savedRevision = -1;
        editorSession.sharingError = undefined;
        refresh();
      }
    }
    if (!shareSession) {
      const revision = store.revision, sceneId = store.scene.id, ownerId = shareOwnerId(), apartment = editorSession?.apartment;
      {
        const snapshot = createShareSnapshot(store.scene, catalog);
        const connected = apartment
          ? await shareAttachment.create(snapshot, revision, apartment, fetch, api.setApartmentShare)
          : null;
        const created = connected?.session ?? await shareCreation.create(snapshot, revision, fetch, ownerId);
        if (store.scene.id !== sceneId || shareOwnerId() !== ownerId)
          throw new Error('The apartment changed while connecting the link. Reopen it to recover that link.');
        if (connected && editorSession) editorSession.apartment = connected.apartment;
        shareSession = created;
        if (!editorSession) history.replaceState(null, '', created.link('edit', location.href));
        refresh();
      }
    }
    return shareSession.link(access, location.href);
  },
  saveDescription: editorSession ? 'Links show the latest published progress. Use Publish progress to update your links. Save updates My apartments.' : undefined,
  notice: message => notify(message),
  warning() {
    const messages: string[] = [];
    if (shareSession && shareSession.savedRevision !== store.revision) messages.push(editorSession ? 'This apartment differs from the shared progress. Publish progress replaces the shared version with this apartment.' : 'There are unsaved changes. Save before sending the link to include your latest progress.');
    if (catalog.some(asset => asset.source.type === 'gltf' && /localhost|127\.0\.0\.1|\/built\//.test(asset.source.url))) messages.push('Some custom models need the original model server to stay available.');
    return messages.join(' ');
  },
});
function showModal(title:string,body:string){$('#modal-content').innerHTML=`<div class="modal-heading"><h2>${title}</h2><button id="close-modal" class="icon-button" aria-label="Close dialog">${icon('close')}</button></div>${body}`;$('#close-modal').onclick=()=>modal.close();modal.showModal();}
modal.onclick=e=>{if(e.target===modal)modal.close();};
$('#integrations').onclick=()=>{
  showModal('Sources & connections',`<p class="modal-intro">Local reconstruction tools are ready. Furniture comes from the shared database. ${architectLive?'Architect reconstruction is connected.':'Architect reconstruction is a local demo.'} ${designerLive?'The designer is connected.':'Designer proposals are local demos.'}</p><div class="file-actions"><button id="local-sources" class="button">${icon('upload')} Attach photos and plans</button><button id="local-reconstruct" class="button primary">${icon('walls')} Build the apartment shell</button></div><div class="integration-row"><span>${icon('walls')}</span><div><h3>Architect <span class="mock-label">${architectLive?'Live':'Demo'}</span></h3><p>${architectLive?'Read a floor plan and up to four photos into an empty apartment shell. Review before replacing your current apartment.':'Exercise the proposal workflow with the original demo structure.'}</p><button id="mock-structure" class="button">${architectLive?'Choose plan and photos':'Preview demo structural import'}</button></div></div><div class="integration-row"><span>${icon('sparkles')}</span><div><h3>Designer <span class="mock-label">${designerLive?'Live':'Demo'}</span></h3><p>Propose validated edits against a scene revision. You approve each batch.</p><button id="mock-designer" class="button">${designerLive?'Ask the live designer':'Request demo design proposal'}</button></div></div><div class="integration-row"><span>${icon('box')}</span><div><h3>Furniture database</h3><p>Real ABO 3D models, catalog dimensions and sample prices in AMD. Requires a connection to the team catalog service.</p><button id="database-catalog" class="button">Browse database</button></div></div><p class="modal-footnote">Database browsing uses the configured catalog service. A proposal becomes stale if the scene changes before approval.</p>`);
  $('#local-sources').onclick=()=>{modal.close();intake.sources();};$('#local-reconstruct').onclick=()=>{modal.close();intake.reconstruction();};
  $('#mock-structure').onclick=()=>{modal.close();void requestProposal('architect');};$('#mock-designer').onclick=()=>{modal.close();void requestProposal('designer');};
  $('#database-catalog').onclick=()=>{modal.close();switchPanel('assets');void searchDatabase();};
};
$('#file-menu').onclick=()=>{
  showModal('Your apartment project',`<p class="modal-intro">Save locally or carry your apartment, assumptions and source evidence as versioned JSON. Loading and reconstruction can be undone.</p><div class="file-actions"><button id="new-shell" class="button primary">${icon('walls')} Build an empty apartment</button><button id="open-local" class="button">${icon('folder')} Load saved scene</button><button id="import-json" class="button">${icon('upload')} Import project JSON</button><button id="export-json" class="button">${icon('download')} Export project with evidence</button><button id="export-report" class="button">${icon('download')} Export review report</button><button id="export-schedule" class="button">${icon('download')} Export schedule CSV</button><button id="reset-apartment" class="button">${icon('home')} Restore empty apartment</button></div><p class="modal-footnote">Original source attachments are embedded in the project export. Catalog models remain references. Browser storage has a limited capacity; keep an exported copy.</p>`);
  if (editorSession) {
    const copy = document.createElement('button'); copy.className = 'button'; copy.textContent = 'Save a copy to My apartments';
    copy.onclick = () => { modal.close(); void saveToAccount(true); }; $('.file-actions').append(copy);
    const local = document.createElement('button'); local.className = 'button'; local.textContent = 'Save on this device';
    local.onclick = () => { try { saveLocal(store.scene); notify('Local backup saved. Use Save to update My apartments.'); } catch(error) { notify(String(error), true); } };
    $('.file-actions').append(local);
  }
  $('#new-shell').onclick=()=>{modal.close();intake.reconstruction();};
  $('#open-local').onclick=async()=>{const baseRevision=store.revision;try{const text=localStorage.getItem(STORAGE_KEY);if(!text){notify('No saved scene yet. Use Save first.',true);return;}const scene=await parseDatabaseScene(text);if(run([{type:'replace-scene',scene}],'Load saved scene',baseRevision)){if(!shareSession&&!editorSession)savedRevision=store.revision;select(null);focusView();refresh();modal.close();}}catch(error){notify(error instanceof Error?error.message:String(error),true);}};
  $('#import-json').onclick=()=>{modal.close();$<HTMLInputElement>('#file-input').click();};
  $('#export-json').onclick=()=>{exportProject('project');modal.close();};$('#export-report').onclick=()=>{exportProject('report');modal.close();};$('#export-schedule').onclick=()=>{exportProject('schedule');modal.close();};
  $('#reset-apartment').onclick=()=>{if(run([{type:'replace-scene',scene:createInitialScene()}],'Restore empty apartment')){select(null);focusView();modal.close();}};
};
$('#file-input').onchange=async event=>{const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;const baseRevision=store.revision;try{if(file.size>24_000_000)throw new Error('Project file exceeds the 24 MB limit.');const scene=await parseDatabaseScene(await file.text());await new Promise<void>(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));if(run([{type:'replace-scene',scene}],'Import scene',baseRevision)){select(null);focusView();}}catch(error){notify(error instanceof Error?error.message:String(error),true);}finally{input.value='';}};
async function publishProgress() {
  const session = shareSession, revision = store.revision;
  if (!session || session.saving || proposalView) return;
  try {
    const saving = session.save(createShareSnapshot(store.scene, catalog), revision, shareOwnerId());
    refresh(); await saving;
    notify('Shared progress saved. Anyone with the link can open this version.');
  } catch(error) { notify(error instanceof Error ? error.message : 'Could not save your progress. Try again.', true); }
  finally { refresh(); }
}
$('#save').onclick=async()=>{
  if (editorSession) { await saveToAccount(); return; }
  if (shareSession) { await publishProgress(); return; }
  if (teamSaves) { await teamSaves.save(); return; }
  try { saveLocal(store.scene); savedRevision=store.revision; notify('Scene saved on this device'); }
  catch(error) { notify(error instanceof Error ? error.message : 'Could not save your progress. Try again.', true); }
  finally { refresh(); }
};
$('#undo').onclick=()=>{if(!interacting&&!previewMode){const r=store.undo();notify(r.ok?'Undo complete':r.errors.join(' '),!r.ok);}};$('#redo').onclick=()=>{if(!interacting&&!previewMode){const r=store.redo();notify(r.ok?'Redo complete':r.errors.join(' '),!r.ok);}};
$('#scene-tab').onclick=()=>switchPanel('scene',true);$('#assets-tab').onclick=()=>switchPanel('assets',true);$('#assistant-tab').onclick=()=>switchPanel('assistant',true);
$('#materials-tab').onclick=()=>switchPanel('materials',true);
$('#ceilings-tab').onclick=()=>switchPanel('ceilings',true);
$('#renovation-tab').onclick=()=>switchPanel('renovation',true);$('#edit-shell').onclick=()=>switchPanel('renovation');
$('#collapse-panel').onclick=()=>{switchPanel(activePanel,true);$(`[data-folio=${activePanel==='assets'?'add':'more'}]`).focus();};
$('#browse-assets').onclick=()=>switchPanel('assets');
$('#close-furniture').onclick=()=>{if(furniturePanelOpen())switchPanel('assets',true);$('[data-folio=add]').focus();};
$('#furniture-library').addEventListener('keydown', event => {
  if (event.key === 'Escape' && !interacting) {
    event.preventDefault(); event.stopPropagation(); $('#close-furniture').click();
  }
});
$<HTMLSelectElement>('#asset-category').innerHTML += Object.entries({ Furniture: catalogKinds.filter(kind => !Object.values(catalogCategories).some(kinds => kinds.includes(kind))), ...catalogCategories }).map(([label, kinds]) => `<optgroup label="${label}">${kinds.map(kind => `<option value="${kind}">${kind.charAt(0).toUpperCase()+kind.slice(1).replaceAll('_', ' ')}</option>`).join('')}</optgroup>`).join('');
if(architectLive)$<HTMLSelectElement>('#asset-category').add(new Option(BUILT_CATEGORY, BUILT_CATEGORY));
$('#asset-category').onchange=()=>{assetCategory=$<HTMLSelectElement>('#asset-category').value;$('#catalog-scroll').scrollTop=0;void searchDatabase();};
$('#catalog-retry').onclick=()=>{void searchDatabase();void refreshBuiltPieces();};
$('#asset-search').oninput=()=>{catalogRequest?.abort();clearTimeout(catalogSearchTimer);catalogResults=[];catalogLoading=true;catalogError='';$('#catalog-scroll').scrollTop=0;renderAssets();catalogSearchTimer=setTimeout(()=>void searchDatabase(),300);};
$('#scene-search').oninput=renderHierarchy;
$('#close-inspector').onclick=()=>{setInspectorOpen(false);$('[data-folio=inspect]').focus();};
// Walls, rooms and openings have no floating toolbar: their properties carry the designer's ask.
$('#ask-designer').onclick=()=>{ if (selectedId) attachToDesigner(selectedId, store.scene); };
$('#focus-selected').onclick=()=>focusView(selectedId??undefined);
$('#preview').onclick=()=>setPreview(!previewMode);
$('#inside-view').onclick=()=>setView('inside');$('#perspective').onclick=()=>setView('perspective');$('#top-view').onclick=()=>setView('top');$('#plan-view').onclick=()=>setView('plan');
$('#top-lighting').onclick=()=>{topLightingEnabled=!topLightingEnabled;viewport.setTopLighting(topLightingEnabled);renderTopLightingControls();};
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool as ToolMode));
$('#multi-select').onclick=()=>{const enabled=!multiSelection;if(enabled)setTool('select');setMultiSelection(enabled);};
$('#focus').onclick=()=>focusView(selectedId??undefined);
$('#snap').onclick=()=>{snap=!snap;viewport.setSnap(snap);floorPlan.setSnap(snap);renderViewportHints();renderInspector();};
$('#walls').onclick=()=>setWallMode(wallMode==='cutaway'?'full':wallMode==='full'?'hidden':'cutaway');
$<HTMLInputElement>('#show-outer-walls').onchange = event => setWallMode((event.currentTarget as HTMLInputElement).checked ? 'full' : 'cutaway');
$<HTMLSelectElement>('#skybox').onchange = event => {
  const select = event.currentTarget as HTMLSelectElement;
  if (isSkyboxPreset(select.value) && viewport.setSkybox(select.value)) selectedSkybox = select.value;
  else select.value = selectedSkybox;
  $('.viewport-shell').classList.toggle('skybox-active', selectedSkybox !== 'studio' && (view === 'perspective' || view === 'inside'));
};
let highQuality=false;$('#quality').onclick=()=>{highQuality=!highQuality;viewport.setQuality(highQuality?'high':'balanced');$('#quality span').textContent=highQuality?'High quality':'Balanced';$('#quality').setAttribute('aria-pressed',String(highQuality));};
// Demos (recorded sessions, ?quality=high) render at full resolution with 4x MSAA and sharper shadows.
{ const params = new URLSearchParams(location.search); if (params.get('quality') === 'high' || (params.has('session') && params.get('quality') !== 'balanced')) $('#quality').click(); }
$('#suggest').onclick=()=>void requestProposal('designer');
$('#help').onclick=()=>showModal('Keyboard & navigation',`<p class="modal-intro">Select walls, openings, rooms, furniture and systems in the canvas or Renovate panel. In Select mode, click a selected door or switch again to test it.</p><div class="shortcut-list">${[['1 / 2 / 3 / 4 / 5 / 6','Scene / Furniture / Assistant / Renovate / Materials / Ceilings'],['[','Toggle sidebar'],['P','Enter / exit preview'],['W A S D / arrows','Move around the scene (click canvas first)'],['Space + drag','Pan in 3D, Top or Plan'],['Drag / Esc','Look around / leave Inside'],['V / G / R / E','Select / Move / Rotate / Resize'],['F','Frame selection / apartment'],['⌘ / Ctrl + S',editorSession?'Save to My apartments':shareSession?'Save shared progress':'Save to team'],['Shift + click','Add / remove walls or furniture from selection'],['⌘ / Ctrl + G','Group selected furniture'],['⌘ / Ctrl + Shift + G','Ungroup furniture'],['⌘ / Ctrl + D','Duplicate furniture'],['Delete / Backspace','Delete selected furniture'],['⌘ / Ctrl + Z','Undo'],['⌘ / Ctrl + Shift + Z','Redo'],['Esc','Cancel drag / clear selection / exit preview']].map(([key,label])=>`<div><span>${label}</span><kbd>${key}</kbd></div>`).join('')}</div><p class="modal-footnote">Plan: drag furniture, fixtures, walls, doors or windows to move them. Hold Space and drag, drag empty floor, Alt-drag, or right/middle drag to pan. Hold Shift for finer placement. Inside: standing eye height is 1.65 m above the current floor. Click the canvas, then use WASD or arrows to walk; drag to look around. Move freely through walls and furniture; doors keep their current open or closed state. Click the canvas, then use WASD or arrows to move in 3D, Top or Plan. 3D: drag empty space to orbit, hold Space and drag or right drag to pan, scroll to zoom. Top: drag to pan. Hold Space to show the hand cursor and pan over selected items without moving them. Select a window to show handles: drag its center or the window to move along the wall and up/down; drag an edge or corner to resize. The vertical arrow raises or lowers it without changing its size. Top view offers sideways movement and width handles; use 3D for height. Select a door, choose Move (G), then drag it or its purple arrows along the wall. Openings stay inside their wall section and stop at neighbouring openings. Move snaps to 0.05 m for openings and walls. Wall corners also catch nearby straight and 90° alignments, including connected corners. Click Snap / Smooth in the toolbar to turn snapping on or off. Release to apply, Esc to cancel, or Undo to restore the previous position. Shift-click walls or models, or turn on Select multiple items, to build a selection. Choose Move to move the selection together; one Undo restores every selected item. Select a single wall and choose Move to drag it back or forth with its purple center arrows; connected walls and room boundaries follow. The endpoint spheres adjust individual corners; use Renovate for precise dimensions, evidence and service editing.</p>`);
window.addEventListener('keydown',event=>{
  if(guidedDesign)return;
  if(stage)return; // The construction viewport owns navigation while the architect works.
  if(document.querySelector('dialog[open]') || (event.target instanceof HTMLElement && (event.target.closest('input,textarea,select') || event.target.isContentEditable)))return;
  const key=event.key.toLowerCase();const mod=event.metaKey||event.ctrlKey;
  if(key==='escape'){event.preventDefault();if(view==='inside'){const destination=insideReturnView;if(previewMode)setPreview(false);setView(destination);return;}if(activeFinish){chooseFinish(null);return;}if(previewMode){setPreview(false);return;}if(floorPlan.cancelInteraction())return;viewport.cancelInteraction();interacting=false;select(null);renderProposal();return;}
  if(!mod&&key==='p'){event.preventDefault();setPreview(!previewMode);return;}
  if(view==='inside'){
    if(mod&&key==='s'){event.preventDefault();$('#save').click();}
    else if(!mod&&key==='f'){event.preventDefault();focusView(selectedId??undefined);}
    return;
  }
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
  else if(!mod){if(['delete','backspace'].includes(key)){event.preventDefault();deleteSelected();}else if(key==='f')focusView(selectedId??undefined);else if(key==='v')setTool('select');else if(key==='g'&&view!=='plan')setTool('move');else if(key==='r'&&view!=='plan')setTool('rotate');else if(key==='e'&&view!=='plan')setTool('scale');else if(key==='1')switchPanel('scene');else if(key==='2')switchPanel('assets');else if(key==='3')switchPanel('assistant');else if(key==='4')switchPanel('renovation');else if(key==='5')switchPanel('materials');else if(key==='6')switchPanel('ceilings');else if(key==='[')switchPanel(activePanel,true);}
});
window.addEventListener('pagehide',event=>{if(event.persisted)return;sharingUI.destroy();catalogRequest?.abort();clearTimeout(catalogSearchTimer);cancelAnimationFrame(selectionRevealFrame);materialsUI.dispose();ceilingUI.dispose();sunControls?.dispose();viewport.dispose();floorPlan.dispose();catalogPreviews.dispose();renovationUI?.destroy();intake.destroy();});
function chooseApartmentName(initial: string): Promise<string | null> {
  return new Promise(resolve => {
    showModal('Save your apartment', `<p class="modal-intro">Give this apartment a name. You can return to it from My apartments.</p><form id="apartment-name-form"><label class="text-field">Apartment name<input id="apartment-name-input" required maxlength="120" value="${escape(initial)}" autocomplete="off" /></label><div class="file-actions"><button type="button" id="cancel-apartment-name" class="button">Cancel</button><button type="submit" class="button primary">Save apartment</button></div></form>`);
    let settled = false;
    const finish = (name: string | null) => { if(settled)return;settled=true;modal.removeEventListener('close',cancel);modal.close();resolve(name); };
    const cancel = () => finish(null);
    modal.addEventListener('close',cancel,{once:true});
    $('#cancel-apartment-name').onclick=cancel;
    $('#apartment-name-form').onsubmit=event=>{event.preventDefault();const input=$<HTMLInputElement>('#apartment-name-input');const name=input.value.trim();if(!name){input.setCustomValidity('Enter an apartment name.');input.reportValidity();input.oninput=()=>input.setCustomValidity('');return;}finish(name);};
    $<HTMLInputElement>('#apartment-name-input').select();
  });
}

async function saveToAccount(copy = false) {
  if (!editorSession || accountSaving || proposalView) return;
  if (previewMode) setPreview(false);
  accountSaving=true;refresh();
  try {
    editorSession.user = await api.session();
    if (!editorSession.user) editorSession.user = await showAuth('login');
    if (!editorSession.user) return;
    let name = editorSession.apartment?.name ?? store.scene.name;
    if (!editorSession.apartment || copy) {
      const chosen = await chooseApartmentName(copy ? `${name} copy`.slice(0,120) : name);
      if (!chosen) return;
      name=chosen;
    }
    if (name !== store.scene.name && !run([{type:'replace-scene',scene:{...store.scene,name}}], 'Name apartment')) return;
    const revision = store.revision;
    const payload = apartmentPayload(store.scene, [...catalogProducts.values()], editorSession.templateId, name);
    const saved = editorSession.apartment && !copy
      ? await api.updateApartment(editorSession.apartment.id, editorSession.apartment.version, payload)
      : await api.createApartment(payload);
    editorSession.apartment=saved;
    // A response only marks the snapshot it actually saved. Edits made during I/O stay dirty.
    savedRevision=revision;
    history.replaceState(null, '', `/?apartment=${encodeURIComponent(saved.id)}`);
    $('#project-name').textContent=name;
    $('.project-name > span').textContent='My apartment';
    notify(store.revision===revision?'Apartment saved to My apartments.':'Snapshot saved. Save again to keep your latest changes.');
  } catch(error) {
    notify(error instanceof AccountError && error.status===409
      ? 'This apartment was updated in another tab. Use File → Save a copy to keep these edits, or reopen the saved apartment.'
      : error instanceof Error ? error.message : 'Could not save your apartment. Please try again.', true);
  } finally {accountSaving=false;refresh();}
}

if (editorSession) {
  const publish=document.createElement('button');publish.id='publish-progress';publish.className='button';publish.hidden=true;publish.onclick=()=>void publishProgress();$('#share').before(publish);
  const profile=document.createElement('a');profile.id='my-apartments';profile.href='/?view=apartments';profile.className='button quiet';profile.textContent='My apartments';
  $('.header-actions').prepend(profile);
  $('.project-name > span').textContent=editorSession.apartment?'My apartment':'Plan copy';
  $('#save').title='Save to My apartments · ⌘S';
  $('#status-text').textContent=editorSession.sharingError ? 'Apartment loaded. Open Share to retry reconnecting your existing link.' : 'Make this apartment yours. Save to keep it in My apartments.';
  const reloading=teamReloadGuard(import.meta.hot);
  window.addEventListener('beforeunload',event=>guardTeamUnload(event,accountSaving || (store.revision>0 && store.revision!==savedRevision),reloading()));
}
const sandboxLink = document.createElement('a');
sandboxLink.href = '/?editor=sandbox'; sandboxLink.target = '_blank'; sandboxLink.rel = 'noopener';
sandboxLink.className = 'button quiet folio-sandbox'; sandboxLink.textContent = 'Sandbox';
sandboxLink.title = 'Open a separate sandbox to experiment'; sandboxLink.setAttribute('aria-label', 'Open sandbox in a new tab');
$('.header-actions').prepend(sandboxLink);
// Opened from a developer's studio: Publish to profile (lane portal-profile, `portal/developer-publish.ts`).
if (startupSession?.developer) void import('./portal/developer-publish').then(({installDeveloperPublish}) => {
  if (document.querySelector('#developer-publish')) return; // Installed already (QA probes inject it too).
  const dispose = installDeveloperPublish({ scene: () => store.scene, products: () => [...catalogProducts.values()], revision: () => store.revision, notify });
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
}).catch(() => notify('Publish to profile could not load. Reload the editor to try again.', true));
if (!editorSession && !sharedStartup) teamSaves = mountTeamSaves({store, products: () => [...catalogProducts.values()], startup: teamStartup, draft: startupSession, initialKind: 'template', active: () => !shareSession, proposal: () => proposalView, notify, saved: revision => { savedRevision = revision; }});
refresh();renderAssets();setTool('select');switchPanel(editorSession?'scene':'renovation');if(designerLive)switchPanel('renovation',true);void searchDatabase();void refreshBuiltPieces();
// Folio: tool panels open only when the buyer asks for them (Add, More, or a piece's toolbar).
if (panelOpen) switchPanel(activePanel, true);

if (arrivalPose) viewport.setCameraPose(arrivalPose, 0);
/** Measured, so the tools wait exactly off-screen whatever their width. */
function measureArrival() {
  const body = document.body;
  body.style.setProperty('--arrival-header', `${$('.app-header').offsetHeight}px`);
  const designerWidth = document.querySelector<HTMLElement>('.designer-column')?.offsetWidth ?? 0;
  // The mobile row is removed during arrival; retain a responsive desktop offset if the window grows.
  body.style.setProperty('--arrival-designer', designerWidth ? `${designerWidth}px` : 'var(--designer-width, 340px)');
  body.style.setProperty('--arrival-panel', `${$('.left-panel').offsetWidth}px`);
}
if (presentation?.arriving) measureArrival();
const arrivalInert = new Map<HTMLElement, boolean>();
function holdEditorChrome(hold: boolean) {
  if (hold) {
    const elements = document.querySelectorAll<HTMLElement>('.app-header, .workspace-nav, .designer-column, .workspace > .left-panel, .status-bar, .viewport-shell > :not(#viewport, #architect-stage, .design-onboarding, .design-construction)');
    for (const element of elements) { if (!arrivalInert.has(element)) arrivalInert.set(element, element.inert); element.inert = true; }
  } else {
    for (const [element, inert] of arrivalInert) element.inert = inert;
    arrivalInert.clear();
  }
}
if (presentation?.arriving) holdEditorChrome(true);

function revealEditorTools() {
  const body = document.body;
  if (!body.classList.contains('editor-arriving')) return;
  measureArrival(); body.classList.add('editor-arrival');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    body.classList.remove('editor-arriving');
    arrivalPose = undefined; viewport.setLocked(false); holdEditorChrome(false);
    setTimeout(() => body.classList.remove('editor-arrival'), 1800);
  }));
}

function discardGuidedReview() {
  if (proposalView) setPreview(false);
  designConstruction.clear();
  if (pending?.command.source === 'designer') {
    const proposal = pending;
    if (!designerPanel.controller.act(proposal.id, 'dismiss')) { designerCatalog.forget(proposal); pending = null; renderProposal(); }
  }
  guidedPreviewId = undefined;
}

function enterCustomize() {
  designOnboarding?.dispose(); designOnboarding = undefined;
  designConstruction.clear(); guidedDesign = false;
  const phase = document.createElement('span'); phase.className = 'design-customize-phase';
  phase.textContent = '03 Customize'; phase.setAttribute('aria-label', 'Phase 3: Customize'); $('.project-name').append(phase);
  revealEditorTools();
  notify(presentation?.bundle ? `Customize · ${presentation.bundle.developerName}’s design is yours to change. Click a piece, or ask your designer on the left.` : 'Customize · Click a piece to edit it, or ask your designer on the left.');
}

function startGuidedDesign() {
  if (designOnboarding) return;
  // The camera and renderer are the construction world's; only the brief arrives here.
  const arrangements = presentation?.bundle ? store.scene.project?.options ?? [] : [];
  designOnboarding = mountDesignOnboarding($('.viewport-shell'), {
    live: designerLive, bundle: presentation?.bundle,
    arrangements: arrangements.map(({ id, name }) => ({ id, name })), activeArrangement: store.scene.project?.activeOptionId,
    // Choosing an arrangement is the person's own edit, allowed while the guided brief holds other edits back.
    arrange: id => {
      discardGuidedReview();
      const result = store.execute({ id: uid(), label: 'Show arrangement', source: 'human', baseRevision: store.revision, operations: [{ type: 'switch-option', id }] }, true);
      if (!result.ok) notify(result.errors.join(' '), true);
      return result.ok;
    },
    submit: request => {
      if (!designerLive || busy) return;
      discardGuidedReview();
      void designerPanel.controller.send(request);
    },
    cancel: () => { designerPanel.controller.cancel(); discardGuidedReview(); },
    edit: discardGuidedReview,
    apply: () => {
      if (!pending || busy) return;
      if (designerPanel.controller.act(pending.id, 'apply')) enterCustomize();
      else designOnboarding?.error(designerPanel.controller.state.messages.at(-1)?.text ?? 'This design could not be applied. Ask for a fresh proposal.');
    },
    skip: () => { designerPanel.controller.cancel(); discardGuidedReview(); enterCustomize(); },
  });
  designOnboarding.update(designerPanel.controller.state);
}
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
/** Lets the blueprint construction view hand over to this editor's first 3D frame. */
export const editorView = {
  cameraPose: () => viewport.cameraPose(), element: () => $('#viewport'), onFrame: (listener: () => void) => viewport.onFrame(listener),
  /** Resolves once the first frames are drawn and the furniture models have landed (bounded). */
  async ready() {
    await nextFrame(); await nextFrame();
    const until = performance.now() + 3000;
    while (viewport.loading() && performance.now() < until) await new Promise(resolve => setTimeout(resolve, 60));
    await nextFrame(); await nextFrame();
  },
  /** Bring the tools in around the finished apartment and hand the canvas to the person. */
  arrive() {
    if (guidedDesign) startGuidedDesign();
    else revealEditorTools();
  },
};
