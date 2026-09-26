import './style.css';
import records from 'virtual:buyer-flats';
import type { AgentProposal, CatalogAsset, EditCommand, Operation, SceneDocument, SceneObject, ViewMode } from '../../editor/src/contracts';
import { EditorStore } from '../../editor/src/core/store';
import { createViewport } from '../../editor/src/render/viewport';
import type { DesignerState, Ownership, Piece, Recording, StreamLine } from './contracts';
import { exampleFlat, komitasFlats, money, type Flat } from './flats';
import { buildQuote, sizeOf, type QuoteGroupId } from './quote';
import { initialDesigner, reduce } from './stream/reducer';
import { play } from './stream/player';
import { createRoomMarks, type BuildMark, type BuildStage } from './ui/marks';
import { EXAMPLE_PICTURE, pictureBoxes } from './ui/picture';

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const uid = () => crypto.randomUUID();
const params = new URLSearchParams(location.search);

/* ---------- the flat and what the buyer has done to it ---------- */
const flats = [exampleFlat(), ...komitasFlats(records)];
const flat: Flat = flats.find(item => item.id === params.get('flat')) ?? flats[0]!;
const store = new EditorStore(flat.scene, flat.catalog);
let catalog: CatalogAsset[] = [...flat.catalog];
const original = new Set(flat.scene.objects.map(object => object.id));
const ownership = new Map<string, Ownership>();
const keep = new Set<string>();
interface Revision { letter: string; label: string; by: 'developer' | 'you' | 'designer'; scene: SceneDocument; edits: number }
const revisions: Revision[] = [{ letter: 'A', label: flat.example ? 'The example design' : "The developer's design", by: 'developer', scene: structuredClone(store.scene), edits: 0 }];
let viewing: number | null = null;
let selectedId: string | null = null;
let mode: 'designer' | 'hand' = 'designer';
let view: ViewMode = 'perspective';
let quoteOpen = false;

/* ---------- the designer ---------- */
let designer: DesignerState = initialDesigner();
let recordingAt = 0, recordingWall = performance.now();
const recordingNow = () => recordingAt + (performance.now() - recordingWall) / 1000 * speed;
let piecesSeenWall = 0;
const boxes = new Map<number, [number, number, number, number]>();
const drawnBoxes = new Set<number>();
const searched = new Set<number>();
const buildStarted = new Map<string, number>();
let applied = false;
let abort: AbortController | null = null;
const speed = Number(params.get('speed')) > 0 ? Number(params.get('speed')) : 1;

const viewport = createViewport($('#viewport'), {
  onSelect: id => { if (mode === 'hand' && viewing === null) select(id); },
  onTransform: (id, patch) => { run([{ type: 'update', id, patch }], `Move ${nameOf(id)}`); },
  onInteraction: () => {},
  onError: message => toast(message, true),
});
const marks = createRoomMarks($<SVGSVGElement>('#marks'), $('#cards'), viewport);
viewport.setWalls('cutaway');
if (params.get('sky')) viewport.setSkybox(params.get('sky') as Parameters<typeof viewport.setSkybox>[0]);
viewport.setView('perspective');
viewport.setTool('select');

function nameOf(id: string) { return store.scene.objects.find(object => object.id === id)?.name ?? 'piece'; }
function assetOf(object: SceneObject | undefined, list = viewCatalog()) { return object ? list.find(asset => asset.id === object.assetId) : undefined; }
function toast(message: string, bad = false) {
  const node = document.createElement('p'); node.className = `toast${bad ? ' bad' : ''}`; node.role = 'status'; node.textContent = message;
  document.body.append(node); setTimeout(() => node.remove(), 3600);
}

/* ---------- commands by hand go through the same store and checks ---------- */
function run(operations: Operation[], label: string): boolean {
  if (viewing !== null) { toast('You are looking at an earlier revision. Return to the latest one to edit.'); return false; }
  const command: EditCommand = { id: uid(), label, source: 'human', baseRevision: store.revision, operations };
  const result = store.execute(command, true);
  if (!result.ok) { toast(result.errors[0] ?? 'That change did not pass the checks.', true); render(); return false; }
  const last = revisions.at(-1)!;
  if (last.by === 'you') { last.edits++; last.label = `${last.edits} changes by you`; last.scene = structuredClone(store.scene); }
  else revisions.push({ letter: nextLetter(), label: 'Changed by you', by: 'you', scene: structuredClone(store.scene), edits: 1 });
  render();
  return true;
}
const nextLetter = () => String.fromCharCode(65 + revisions.length);

/* ---------- which scene is on screen ---------- */
function designerAssets(): CatalogAsset[] { return designer.assets; }
function viewCatalog(): CatalogAsset[] {
  const ids = new Set(catalog.map(asset => asset.id));
  return [...catalog, ...designerAssets().filter(asset => !ids.has(asset.id))];
}
function pendingProposal(): AgentProposal | undefined { return !applied && designer.phase === 'proposed' ? designer.proposal : undefined; }
function shownScene(): SceneDocument {
  if (viewing !== null) return revisions[viewing]!.scene;
  const proposal = pendingProposal();
  if (!proposal) return store.scene;
  const preview = new EditorStore(structuredClone(store.scene), viewCatalog());
  const result = preview.execute({ ...structuredClone(proposal.command), baseRevision: preview.revision }, true);
  return result.ok ? preview.scene : store.scene;
}
function objectForAsset(proposal: AgentProposal | undefined, assetId: string | undefined): string | undefined {
  if (!proposal || !assetId) return undefined;
  for (const op of proposal.command.operations) if (op.type === 'add' && op.object.assetId === assetId) return op.object.id;
  // A found product may already stand in the flat and only be moved.
  const moved = new Set(proposal.command.operations.flatMap(op => op.type === 'update' ? [op.id] : []));
  return store.scene.objects.find(object => moved.has(object.id) && object.assetId === assetId)?.id;
}
function changedIds(proposal: AgentProposal | undefined): string[] {
  return proposal ? proposal.command.operations.flatMap(op => op.type === 'add' ? [op.object.id] : op.type === 'update' ? [op.id] : []) : [];
}
function pieceObjects(): Map<string, number> {
  const map = new Map<string, number>();
  const proposal = designer.proposal;
  for (const piece of designer.pieces) { const id = objectForAsset(proposal, piece.asset?.id ?? piece.slotId); if (id) map.set(id, piece.key); }
  return map;
}
const BUILDING = new Set(['queued', 'writing', 'checking', 'fixing', 'reserved']);
function buildsSettled() { return designer.pieces.every(piece => piece.source !== 'custom' || piece.status === 'done' || piece.status === 'failed'); }

/* ---------- streaming ---------- */
async function startExample() {
  const response = await fetch(`/fixtures/inspiration-${flat.id}.json`).catch(() => null);
  if (!response?.ok) { toast('There is no recorded example for this flat yet.', true); return; }
  const recording = await response.json() as Recording;
  abort?.abort(); abort = new AbortController();
  designer = initialDesigner(); boxes.clear(); buildStarted.clear(); drawnBoxes.clear(); searched.clear(); applied = false; recordingAt = 0; recordingWall = performance.now(); piecesSeenWall = 0;
  $('#ref-pic').innerHTML = `${EXAMPLE_PICTURE}<svg class="boxes" aria-hidden="true"></svg><span class="scan" aria-hidden="true"></span>`;
  $('#reference').hidden = false;
  render();
  play(recording, { speed, signal: abort.signal, onLine: (line, at) => receive(line, at) });
}
function receive(line: StreamLine, at: number) {
  const before = new Map(designer.pieces.map(piece => [piece.key, piece.status]));
  recordingAt = at; recordingWall = performance.now();
  designer = reduce(designer, line, at);
  if (line.type === 'tool' && line.name === 'set_intent' && line.phase === 'end') for (const seen of line.refs?.pieces ?? []) if (seen.box) boxes.set(seen.key, seen.box);
  if (line.type === 'tool' && line.name === 'search_catalog' && line.phase === 'end' && line.refs?.key !== undefined) searched.add(line.refs.key);
  if (line.type === 'build' && line.state === 'writing' && !buildStarted.has(line.slotId)) buildStarted.set(line.slotId, at);
  if (!piecesSeenWall && designer.pieces.length) { piecesSeenWall = performance.now(); setTimeout(render, 2800); }
  render();
  // A built piece swaps in for its grey slot and assembles in place.
  for (const piece of designer.pieces) {
    if (piece.status === 'done' && before.get(piece.key) !== 'done') {
      const id = objectForAsset(designer.proposal, piece.slotId);
      if (id) viewport.animateAssembly(id);
    }
    if (piece.status === 'found' && before.get(piece.key) !== 'found' && pendingProposal()) {
      const id = objectForAsset(designer.proposal, piece.asset?.id);
      if (id) viewport.animatePlacement(id);
    }
  }
}
function minutesLeft(): string {
  const active = designer.pieces.filter(piece => piece.slotId && BUILDING.has(piece.status));
  if (!active.length) return '';
  const left = Math.max(...active.map(piece => 125 - (recordingNow() - (buildStarted.get(piece.slotId!) ?? recordingNow()))));
  return left > 90 ? 'About 2 minutes left' : left > 30 ? 'About a minute left' : 'Almost done';
}

function applyProposal() {
  const proposal = designer.proposal;
  if (!proposal || !buildsSettled()) return;
  const known = new Set(catalog.map(asset => asset.id));
  const fresh = designer.assets.filter(asset => !known.has(asset.id));
  if (fresh.length) { store.registerCatalogAssets(fresh); catalog = [...catalog, ...fresh]; }
  const result = store.execute({ ...structuredClone(proposal.command), baseRevision: store.revision, source: 'designer' }, true);
  if (!result.ok) { toast(result.errors[0] ?? 'The proposal no longer fits this flat.', true); return; }
  applied = true;
  revisions.push({ letter: nextLetter(), label: 'From your picture', by: 'designer', scene: structuredClone(store.scene), edits: 0 });
  toast('Applied. Undo is always there in By hand.');
  render();
}

/* ---------- rendering ---------- */
let lastScene: SceneDocument | null = null, lastCatalog: CatalogAsset[] | null = null;
function render() {
  document.body.dataset.mode = mode;
  document.body.dataset.phase = applied ? 'applied' : designer.phase;
  const scene = shownScene(), list = viewCatalog();
  if (scene !== lastScene || list.length !== lastCatalog?.length || list.some((asset, i) => asset !== lastCatalog![i])) {
    viewport.setScene(scene, list); lastScene = scene; lastCatalog = list;
  }
  viewport.setSelection(mode === 'hand' ? selectedId : null);
  renderMarks(scene, list);
  renderReference();
  renderSays();
  renderPanel(scene, list);
  renderTitle(scene, list);
  renderQuote(scene, list);
  $('#replay-tag').hidden = !designer.scripted;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.modes button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  for (const b of document.querySelectorAll<HTMLButtonElement>('.views button')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
}

function renderMarks(scene: SceneDocument, list: CatalogAsset[]) {
  const builds: BuildMark[] = designer.pieces.flatMap(piece => {
    const objectId = objectForAsset(designer.proposal, piece.slotId);
    if (!objectId || piece.status === 'failed') return [];
    const stage: BuildStage = piece.status === 'reserved' ? 'queued' : piece.status as BuildStage;
    return [{ key: piece.key, objectId, name: piece.name, stage, startedAt: buildStarted.get(piece.slotId!) ?? recordingNow() }];
  });
  // Slots still being built are not furniture yet: the view hides them and the drawing takes their place.
  viewport.setHidden(pendingProposal() && viewing === null ? builds.filter(b => b.stage !== 'done').map(b => b.objectId) : []);
  if (mode !== 'designer' || viewing !== null || applied || !designer.proposal) { marks.set(null); return; }
  const objects = pieceObjects();
  const pending = new Set(designer.pieces.filter(piece => piece.status !== 'found' && piece.status !== 'done').map(piece => piece.key));
  marks.set({ scene, catalog: list, changed: changedIds(designer.proposal), builds, now: recordingNow, marks: [...objects].map(([objectId, key]) => ({ key, objectId, pending: pending.has(key) })) });
}

function renderReference() {
  const figure = $('#reference');
  if (figure.hidden) return;
  const stage = !designer.pieces.length ? 'reading' : performance.now() - piecesSeenWall < 2600 ? 'found' : 'pinned';
  figure.dataset.stage = stage;
  document.body.toggleAttribute('data-reading', stage !== 'pinned');
  $('#ref-caption').textContent = stage === 'reading' ? 'Reading your picture' : stage === 'found' ? `${designer.pieces.length} pieces found` : 'Your picture. Read once, then deleted.';
  const svg = figure.querySelector('.boxes');
  if (!svg) return;
  const html = pictureBoxes(designer.pieces, boxes, drawnBoxes);
  if (svg.innerHTML !== html) svg.innerHTML = html;
  for (const piece of designer.pieces) if (boxes.has(piece.key)) drawnBoxes.add(piece.key);
}

function renderSays() {
  const says = $('#says'), decide = $('#decide');
  const eta = minutesLeft();
  if (viewing !== null) says.innerHTML = `You're looking at revision ${esc(revisions[viewing]!.letter)}. <button class="try" data-latest>Back to the latest</button>`;
  else if (designer.phase === 'idle') says.innerHTML = `This is ${flat.example ? 'the example flat' : 'your flat'} as the developer furnished it. Show me a room you like and I'll make yours look like it.<br><button class="try" data-example>Try the example picture</button>`;
  else if (applied) says.textContent = 'Done. Keep asking for changes, or switch to By hand to adjust anything yourself.';
  else says.innerHTML = `${esc(designer.says)}${eta ? `<span class="eta">${esc(eta)}</span>` : ''}`;
  decide.hidden = !(pendingProposal() && viewing === null);
  const apply = $<HTMLButtonElement>('#apply');
  apply.disabled = !buildsSettled();
  apply.textContent = buildsSettled() ? 'Apply these changes' : 'Apply when the pieces are built';
}

const statusLine: Record<string, (p: Piece, size: string) => string> = {
  seen: p => searched.has(p.key) ? 'No shop has one that fits. It will be built to fit.' : 'Looking for it.',
  searching: () => 'Searching Yerevan shops.',
  found: (_, size) => `Found in a Yerevan shop, <span class="num">${size}</span>.`,
  reserved: (_, size) => `No shop has one that fits. Building it to fit, <span class="num">${size}</span>.`,
  queued: () => 'Waiting for a builder.',
  writing: (_, size) => `Building it to fit, <span class="num">${size}</span>. Writing the design.`,
  checking: (_, size) => `Building it to fit, <span class="num">${size}</span>. Checking the size and parts.`,
  fixing: (_, size) => `Building it to fit, <span class="num">${size}</span>. Fixing one detail.`,
  done: (_, size) => `Built to fit, <span class="num">${size}</span>.`,
  failed: p => esc(p.reason ?? 'It could not be built. Try a product from a shop instead.'),
};

function renderPanel(scene: SceneDocument, list: CatalogAsset[]) {
  const panel = $('#panel');
  if (mode === 'hand') { panel.innerHTML = inspectorHtml(scene, list); return; }
  if (!designer.pieces.length && designer.phase !== 'idle') {
    panel.innerHTML = `<h2>Reading your picture</h2><p class="lead soft">The designer is finding each piece in it: what it is, its size, its colour and material. Then it looks for each one in Yerevan shops.</p>`;
    return;
  }
  if (!designer.pieces.length) {
    panel.innerHTML = `<h2>Make it yours</h2><p class="lead soft">Two ways to change this flat.</p>
      <div class="ways"><div class="way"><h3>Show the designer a picture</h3><p>Upload a room you like. It finds the pieces in Yerevan shops, or has them built to fit your walls, and checks every walkway and door.</p></div>
      <div class="way"><h3>Change it by hand</h3><p>Move, turn, swap or remove any piece, and mark what you already own.</p></div></div>`;
    return;
  }
  const found = designer.pieces.filter(p => p.status === 'found').length, built = designer.pieces.filter(p => p.status === 'done').length;
  const building = designer.pieces.filter(p => p.slotId && BUILDING.has(p.status)).length;
  const counts = [found && `${found} found`, building && `${building} being built`, built && `${built} built`].filter(Boolean).join(', ');
  panel.innerHTML = `<h2>From your picture</h2><p class="lead soft">${designer.pieces.length} pieces${counts ? `. ${counts}` : ''}.</p>
    <ol class="keys">${designer.pieces.map(piece => {
      const asset = piece.asset, size = asset ? sizeOf(asset) : '';
      const price = asset && asset.price > 0 ? `${money(asset.price, flat.currency)}<small>${piece.source === 'custom' ? 'custom estimate' : 'example shop'}</small>` : '…';
      const bar = piece.slotId && ['writing', 'checking', 'fixing'].includes(piece.status) ? '<span class="hatch-bar" aria-hidden="true"></span>' : '';
      return `<li class="key" data-status="${piece.status}"><span class="bubble">${piece.key}</span><span class="key-name">${esc(piece.name)}</span>
        <span class="key-price num">${price}</span><span class="key-how">${(statusLine[piece.status] ?? statusLine.seen!)(piece, size)}</span>${bar}</li>`;
    }).join('')}</ol>`;
}

function inspectorHtml(scene: SceneDocument, list: CatalogAsset[]): string {
  const object = scene.objects.find(item => item.id === selectedId), asset = assetOf(object, list);
  if (!object || !asset) {
    return `<h2>By hand</h2><p class="lead soft">Tap a piece to move, turn, swap or remove it. Every change is checked for walkways and doors, like the designer's.</p>
      <div class="ways"><div class="way"><h3>${scene.objects.length} pieces in this flat</h3><p>${original.size} came with the ${flat.example ? 'example' : "developer's"} design. Tap one and tell us if you already own it.</p></div></div>`;
  }
  const source = original.has(object.id) ? (ownership.get(object.id) === 'owned' ? 'Already yours' : `From the ${flat.example ? 'example' : "developer's"} design`) : designer.assets.some(a => a.id === asset.id) && designer.pieces.some(p => p.slotId === asset.id) ? 'Custom, made to measure' : 'Example shop';
  const swaps = list.filter(candidate => candidate.kind === asset.kind && candidate.id !== asset.id && candidate.source.type === 'procedural' && !candidate.id.startsWith('slot')).slice(0, 4).map(candidate => {
    const problem = swapProblem(object, candidate);
    return `<button class="swap" data-swap="${esc(candidate.id)}" ${problem ? 'disabled' : ''}><span class="swatch" style="background:${esc(candidate.color)}"></span>
      <span><span class="n">${esc(candidate.name)}</span><span class="s ${problem ? '' : 'num'}">${esc(problem ?? sizeOf(candidate))}</span></span><span class="p num">${candidate.price > 0 ? money(candidate.price, flat.currency) : ''}</span></button>`;
  }).join('');
  return `<section class="inspector"><h2>${esc(object.name)}</h2><p class="source soft">${esc(source)}${asset.price > 0 ? `, ${money(asset.price, flat.currency)}` : ''}</p>
    <p class="dims num">${sizeOf(asset, object)}</p>
    <div class="acts"><button class="primary" data-tool="move">Move</button><button data-tool="rotate">Rotate</button><button data-act="remove">Remove</button></div>
    ${original.has(object.id) ? `<label class="check"><input type="checkbox" data-own ${ownership.get(object.id) === 'owned' ? 'checked' : ''}><span>I already own this. It costs nothing in the quote.</span></label>` : ''}
    <label class="check"><input type="checkbox" data-keep ${keep.has(object.id) ? 'checked' : ''}><span>Keep it here. The designer won't move it.</span></label>
    ${swaps ? `<div class="swaps"><h3>Swap for one that fits here</h3>${swaps}</div>` : ''}
    <button class="ask" data-ask>Ask the designer about this ${esc(asset.kind)}</button></section>`;
}

function swapOperations(object: SceneObject, asset: CatalogAsset): Operation[] {
  return [{ type: 'delete', id: object.id }, { type: 'add', object: { ...structuredClone(object), id: `${object.id}-${asset.id}`, assetId: asset.id, name: asset.name, scale: [1, 1, 1] } }];
}
function swapProblem(object: SceneObject, asset: CatalogAsset): string | null {
  const scratch = new EditorStore(structuredClone(store.scene), viewCatalog());
  const result = scratch.execute({ id: uid(), label: 'Swap check', source: 'human', baseRevision: scratch.revision, operations: swapOperations(object, asset) }, true);
  return result.ok ? null : (result.errors[0] ?? 'Does not fit here').replace(/\.$/, '');
}

function renderTitle(scene: SceneDocument, list: CatalogAsset[]) {
  const quote = currentQuote(scene, list);
  $('#title').innerHTML = `<div class="firm"><span class="firm-mark">Developer logo</span></div>
    <div class="flatno"><strong>${esc(flat.number)}</strong><span>${esc(flat.subtitle)}</span></div>
    <div class="span revcell"><span class="lab">Revisions</span><ol class="revs">${revisions.map((rev, i) =>
      `<li><button data-rev="${i}" class="${rev.by === 'designer' ? 'designer' : ''}" ${(viewing ?? revisions.length - 1) === i ? 'aria-current="true"' : ''}><b>${rev.letter}</b><span>${esc(rev.label)}</span></button></li>`).join('')}
      ${pendingProposal() ? `<li><button class="designer" disabled><b>${nextLetter()}</b><span>From your picture, in progress</span></button></li>` : ''}</ol></div>
    <div class="span checked">Drawn by <em>the designer</em> and by you. Checked by code: paths, doors, sizes and your request.</div>
    <div class="span total"><div><span class="lab">To make it real</span><strong class="num">${money(quote.total, flat.currency)}</strong><span class="soft" style="font-size:12px">${flat.currency ? 'Sample prices' : 'Demo prices, no currency'}</span></div>
    <button class="costs" data-quote>What it costs</button></div>`;
}

function currentQuote(scene: SceneDocument, list: CatalogAsset[]) {
  const custom = new Set(designer.pieces.flatMap(piece => piece.slotId ? [piece.slotId] : []));
  return buildQuote({ scene, catalog: list, original, ownership, custom, keys: pieceObjects() });
}

const groupText: Record<QuoteGroupId, { title: string; who: string; action?: string; blue?: boolean }> = {
  shop: { title: 'A Yerevan furniture shop', who: 'Example shop, no agreement yet', action: 'Message the shop' },
  workshop: { title: 'A workshop, made to measure', who: 'Example workshop, no agreement yet', action: 'Send the drawing', blue: true },
  developer: { title: 'In the flat now, from the developer', who: 'Real products. Buy them, or tick the ones you already own.' },
  yours: { title: 'Already yours', who: 'Costs nothing' },
};
function renderQuote(scene: SceneDocument, list: CatalogAsset[]) {
  const aside = $('#quote');
  aside.hidden = !quoteOpen;
  if (!quoteOpen) return;
  const quote = currentQuote(scene, list);
  aside.innerHTML = `<header><div><h2>What it costs, and who makes it</h2><p class="sub soft">${esc(pendingProposal() ? 'The proposal on screen' : `Revision ${revisions.at(-1)!.letter}`)}</p></div>
    <button class="x" data-close aria-label="Close"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></header>
    ${quote.groups.map(group => { const text = groupText[group.id]; return `<section class="grp"><div class="grp-h"><h3>${esc(text.title)}<span class="who">${esc(text.who)}</span></h3>${text.action ? `<button class="${text.blue ? 'blue' : ''}" data-contact="${group.id}">${esc(text.action)}</button>` : ''}</div>
      ${group.lines.map(line => `<div class="line"><span class="t">${esc(line.tag)}</span><span class="d">${esc(line.name)}${line.count > 1 ? ` × ${line.count}` : ''}<small class="num">${esc(line.size)}</small></span>
        <span class="v num">${line.unit === null ? '–' : money(line.unit * line.count, flat.currency)}${line.note ? `<small>${esc(line.note)}</small>` : ''}</span></div>`).join('')}</section>`; }).join('')}
    <div class="qtotal"><span>To make this flat real</span><strong class="num">${money(quote.total, flat.currency)}</strong></div>
    <p class="qfoot soft">${flat.currency ? 'Sample prices.' : 'Demo prices with no currency.'} ${quote.real} of ${quote.pieces} pieces are products you can buy or already own; the rest are made-to-measure estimates.</p>
    <div class="qacts"><button class="primary" data-contact="advisor">Send to my advisor</button><button data-contact="share">Share with family</button></div>`;
}

/* ---------- events ---------- */
document.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button, [data-own], [data-keep]');
  if (!target) return;
  const d = target.dataset;
  if (d.mode) { mode = d.mode as typeof mode; view = mode === 'hand' ? 'top' : 'perspective'; viewport.setView(view); viewport.setTool('select'); selectedId = null; render(); }
  else if (d.view) { view = d.view as ViewMode; viewport.setView(view); render(); }
  else if (d.tool) { viewport.setTool(d.tool as 'select' | 'move' | 'rotate'); for (const b of document.querySelectorAll<HTMLButtonElement>('.tools [data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === d.tool)); }
  else if (d.act === 'undo') { if (store.undo().ok) { const last = revisions.at(-1)!; if (last.by === 'you' && --last.edits <= 0) revisions.pop(); render(); } }
  else if (d.act === 'remove' && selectedId) { const id = selectedId; selectedId = null; run([{ type: 'delete', id }], `Remove ${nameOf(id)}`); }
  else if (d.swap && selectedId) { const object = store.scene.objects.find(o => o.id === selectedId), asset = viewCatalog().find(a => a.id === d.swap); if (object && asset && run(swapOperations(object, asset), `Swap ${object.name}`)) { selectedId = `${object.id}-${asset.id}`; render(); } }
  else if (d.ask !== undefined) { mode = 'designer'; view = 'perspective'; viewport.setView(view); $<HTMLInputElement>('#request').value = `About the ${nameOf(selectedId ?? '')}: `; render(); $<HTMLInputElement>('#request').focus(); }
  else if (d.example !== undefined) void startExample();
  else if (d.latest !== undefined) { viewing = null; render(); }
  else if (d.rev) { const i = Number(d.rev); viewing = i === revisions.length - 1 ? null : i; render(); }
  else if (d.quote !== undefined) { quoteOpen = true; render(); }
  else if (d.close !== undefined) { quoteOpen = false; render(); }
  else if (d.contact) toast(d.contact === 'share' ? 'Sharing needs an account; this demo keeps everything on this device.' : 'Contacting shops, workshops and advisors is not connected in this demo.');
  else if (target.id === 'apply') applyProposal();
  else if (target.id === 'dismiss') { abort?.abort(); designer = initialDesigner(); $('#reference').hidden = true; document.body.removeAttribute('data-reading'); render(); }
});
document.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (input.dataset.own !== undefined && selectedId) { ownership.set(selectedId, input.checked ? 'owned' : 'placeholder'); render(); }
  if (input.dataset.keep !== undefined && selectedId) { if (input.checked) keep.add(selectedId); else keep.delete(selectedId); render(); }
});
function select(id: string | null) { selectedId = id; render(); }

$<HTMLFormElement>('#composer').onsubmit = event => {
  event.preventDefault();
  const text = $<HTMLInputElement>('#request').value.trim();
  if (designer.phase === 'idle') { void startExample(); return; }
  if (text) toast('Follow-up requests need the live designer service. This demo replays one recorded example.');
};
function takePicture(file: File | undefined) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { toast('Use a PNG, JPEG or WebP picture.', true); return; }
  toast('This demo replays one recorded example picture. Your own pictures need the live designer service.');
  void startExample();
}
$<HTMLInputElement>('#picture-input').onchange = event => takePicture((event.target as HTMLInputElement).files?.[0]);
const drop = $('#drop'), stageEl = $('#stage');
stageEl.addEventListener('dragover', event => { if (mode === 'designer' && event.dataTransfer?.types.includes('Files')) { event.preventDefault(); drop.hidden = false; } });
stageEl.addEventListener('dragleave', event => { if (event.target === drop) drop.hidden = true; });
stageEl.addEventListener('drop', event => { event.preventDefault(); drop.hidden = true; takePicture(event.dataTransfer?.files[0]); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && quoteOpen) { quoteOpen = false; render(); } });

render();
if (params.has('example')) void startExample();
