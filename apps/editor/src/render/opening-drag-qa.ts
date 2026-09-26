/** Native-pointer QA: independent documents, real viewport, real checked history. */
import type { Opening, Operation, SceneDocument, Vec2, ViewMode } from '../contracts';
import { emptyProject } from '../core/renovation';
import { EditorStore } from '../core/store';
import { createViewport, type FinishViewport } from './viewport';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing QA control ${selector}`);
  return element;
};
type Layout = 'straight' | 'diagonal' | 'reversed' | 'raised';
const windowId = 'qa-window';
let layout: Layout = 'straight';
let selected: string | null = windowId;
let view: ViewMode = 'perspective';
let interacting = false;
let interactionRevision = 0;
let interactionSource = '';
let dragCommands = 0;
let dragAttempts = 0;
let previewFrame = 0;
let error = '';
const runtimeErrors: string[] = [];
let viewport: FinishViewport | undefined;

function makeScene(): SceneDocument {
  const project = emptyProject();
  const rotate = ([x, z]: Vec2): Vec2 => layout === 'diagonal'
    ? [x * Math.cos(.55) - z * Math.sin(.55), x * Math.sin(.55) + z * Math.cos(.55)] : [x, z];
  const elevation = layout === 'raised' ? .6 : 0;
  const front: [Vec2, Vec2] = layout === 'reversed' ? [[4, 2], [-4, 2]] : [[-4, 2], [4, 2]];
  const walls = [
    { id: 'qa-front', start: rotate(front[0]), end: rotate(front[1]), height: 3, thickness: .18, color: '#c9c3b6', openings: [
      { id: windowId, kind: 'window' as const, offset: 2, width: 2, height: 1.4, sill: .8 },
      { id: 'qa-neighbour', kind: 'window' as const, offset: 6, width: 1, height: 1.2, sill: 1 },
    ] },
    { id: 'qa-back', start: rotate([-4, -2]), end: rotate([4, -2]), height: 3, thickness: .18, color: '#9daba5', openings: [] },
    { id: 'qa-left', start: rotate([-4, -2]), end: rotate([-4, 2]), height: 3, thickness: .18, color: '#c9c3b6', openings: [] },
    { id: 'qa-right', start: rotate([4, -2]), end: rotate([4, 2]), height: 3, thickness: .18, color: '#c9c3b6', openings: [] },
  ];
  for (const wall of walls) project.metadata[wall.id] = { structuralRole: 'partition', phase: 'existing', elevation };
  project.metadata[windowId] = { name: 'QA window', mechanism: 'fixed', phase: 'existing' };
  project.metadata['qa-neighbour'] = { name: 'Neighbour window', mechanism: 'casement', phase: 'existing' };
  project.metadata['qa-room'] = { name: 'QA room', elevation, ceilingHeight: 3, phase: 'existing' };
  return { format: 'varpet.editor', version: 2, id: `opening-drag-${layout}`, name: 'Isolated window drag QA', units: 'm', upAxis: 'Y', project,
    rooms: [{ id: 'qa-room', name: 'QA room', polygon: ([[-4, -2], [4, -2], [4, 2], [-4, 2]] as Vec2[]).map(rotate), color: '#bca98e' }], walls, objects: [] };
}

let store = new EditorStore(makeScene(), []);
const currentOpening = (): Opening => store.scene.walls.flatMap(wall => wall.openings).find(opening => opening.id === windowId)!;
function log(message: string): void {
  const item = document.createElement('li');
  item.textContent = message; $('#qa-log').prepend(item);
  while ($('#qa-log').children.length > 30) $('#qa-log').lastElementChild?.remove();
}
function refreshReadout(): void {
  const opening = currentOpening();
  for (const key of ['offset', 'sill', 'width', 'height'] as const) $<HTMLOutputElement>(`#qa-${key}`).value = opening[key].toFixed(4);
  $<HTMLOutputElement>('#qa-revision').value = String(store.revision);
  $<HTMLOutputElement>('#qa-commands').value = String(dragCommands);
  $<HTMLOutputElement>('#qa-attempts').value = String(dragAttempts);
  $<HTMLOutputElement>('#qa-interacting').value = String(interacting);
  $<HTMLOutputElement>('#qa-source-unchanged').value = String(!interacting || JSON.stringify(store.scene) === interactionSource);
  $<HTMLOutputElement>('#qa-selected').value = selected ?? 'none';
  $<HTMLButtonElement>('#qa-undo').disabled = !store.canUndo;
  $<HTMLButtonElement>('#qa-redo').disabled = !store.canRedo;
  const metadata = store.scene.project!.metadata[windowId]!;
  $('#qa-lock').textContent = metadata.locked ? 'Unlock window' : 'Lock window';
  $('#qa-lock').setAttribute('aria-pressed', String(!!metadata.locked));
  $('#qa-remove').textContent = metadata.phase === 'remove' ? 'Restore window' : 'Remove window';
  $('#qa-remove').setAttribute('aria-pressed', String(metadata.phase === 'remove'));
  $('#qa-error').textContent = error;
  $('#qa-3d').setAttribute('aria-pressed', String(view === 'perspective'));
  $('#qa-top').setAttribute('aria-pressed', String(view === 'top'));
  $('#qa-hint').textContent = view === 'top' ? 'Top: drag width handles or the sideways arrow. Switch to 3D to adjust height and sill.' : 'Drag an edge or corner to resize. Drag the center to move. Esc cancels.';
  const active = document.querySelector<HTMLOutputElement>('.opening-drag-readout:not([hidden])');
  $<HTMLOutputElement>('#qa-preview').value = interacting && active ? active.value : interacting ? 'Pointer gesture in progress; scene remains unchanged.' : 'No drag in progress.';
}
function refreshScene(): void {
  viewport?.setScene(store.scene, []);
  viewport?.setSelection(selected);
  refreshReadout();
}
let unsubscribe = store.subscribe(refreshScene);
function execute(operations: Operation[], label: string, revision = store.revision): boolean {
  const result = store.execute({ id: crypto.randomUUID(), label, source: 'human', baseRevision: revision, operations }, true);
  error = result.ok ? '' : result.errors.join(' ');
  log(`${result.ok ? 'APPLIED' : 'REJECTED'} r${store.revision} · ${label}${error ? ` · ${error}` : ''}`);
  refreshScene();
  return result.ok;
}
function watchPreview(): void {
  previewFrame = 0; refreshReadout();
  if (interacting) previewFrame = requestAnimationFrame(watchPreview);
}

viewport = createViewport($('#qa-view'), {
  onSelect(id) { selected = id; viewport?.setSelection(id); log(`Selected ${id ?? 'nothing'}`); refreshReadout(); },
  onTransform() {},
  onInteraction(active) {
    interacting = active;
    if (active) { interactionRevision = store.revision; interactionSource = JSON.stringify(store.scene); }
    if (previewFrame) { cancelAnimationFrame(previewFrame); previewFrame = 0; }
    if (active) previewFrame = requestAnimationFrame(watchPreview);
    refreshReadout();
  },
  onOpeningTransform(id, patch) {
    dragAttempts++;
    const reject = $<HTMLInputElement>('#qa-reject');
    const intended = { ...patch };
    const applied = execute([{ type: 'update-opening', id, patch: reject.checked ? { ...intended, width: 100 } : intended }],
      `Drag ${id}: offset ${patch.offset.toFixed(3)}, sill ${patch.sill.toFixed(3)}, size ${patch.width.toFixed(3)} × ${patch.height.toFixed(3)} m`, interactionRevision);
    reject.checked = false;
    if (applied) dragCommands++;
    refreshScene();
  },
  onError(message) { error = message; runtimeErrors.push(message); log(`ERROR ${message}`); refreshReadout(); },
});
viewport.setScene(store.scene, []); viewport.setWalls('full'); viewport.setSelection(windowId); viewport.setTool('select'); viewport.focus(windowId);

function cancel(): void { viewport?.cancelInteraction(); interacting = false; refreshReadout(); }
function selectWindow(focus = false): void { selected = windowId; viewport?.setSelection(windowId); if (focus) viewport?.focus(windowId); refreshReadout(); }
function reset(): void {
  cancel(); unsubscribe(); store = new EditorStore(makeScene(), []); unsubscribe = store.subscribe(refreshScene);
  selected = windowId; dragCommands = 0; dragAttempts = 0; error = ''; interactionRevision = 0; interactionSource = '';
  $<HTMLInputElement>('#qa-reject').checked = false; $('#qa-check-result').textContent = '';
  refreshScene(); viewport?.setView(view); viewport?.focus(windowId); log(`RESET ${layout} · independent scene r0`);
}
function changeView(next: ViewMode): void { cancel(); view = next; viewport?.setView(next); viewport?.focus(windowId); refreshReadout(); log(`View ${next}`); }
$('#qa-select').onclick = () => selectWindow();
$('#qa-focus').onclick = () => selectWindow(true);
$('#qa-3d').onclick = () => changeView('perspective');
$('#qa-top').onclick = () => changeView('top');
$('#qa-reset').onclick = reset;
$<HTMLSelectElement>('#qa-layout').onchange = event => { layout = (event.target as HTMLSelectElement).value as Layout; reset(); };
$('#qa-undo').onclick = () => { cancel(); const result = store.undo(); error = result.ok ? '' : result.errors.join(' '); log(`UNDO r${store.revision}`); refreshScene(); };
$('#qa-redo').onclick = () => { cancel(); const result = store.redo(); error = result.ok ? '' : result.errors.join(' '); log(`REDO r${store.revision}`); refreshScene(); };
$('#qa-lock').onclick = () => { cancel(); execute([{ type: 'set-metadata', id: windowId, patch: { locked: !store.scene.project!.metadata[windowId]?.locked } }], 'Toggle QA window lock'); };
$('#qa-remove').onclick = () => { cancel(); execute([{ type: 'set-metadata', id: windowId, patch: { phase: store.scene.project!.metadata[windowId]?.phase === 'remove' ? 'existing' : 'remove' } }], 'Toggle QA window removal'); };
$<HTMLInputElement>('#qa-snap').onchange = event => { viewport?.setSnap((event.target as HTMLInputElement).checked); log(`Snap ${(event.target as HTMLInputElement).checked ? 'on' : 'off'}`); };
$('#qa-check').onclick = () => {
  const metadata = store.scene.project!.metadata[windowId];
  const shouldShow = selected === windowId && !metadata?.locked && metadata?.phase !== 'remove';
  const handleGroup = document.querySelector<HTMLElement>('.opening-drag-controls');
  const visible = [...document.querySelectorAll<HTMLButtonElement>('[data-opening-handle]')].filter(button => !button.hidden && !!handleGroup && !handleGroup.hidden);
  const problems = [...runtimeErrors];
  if (!document.querySelector('#qa-view canvas')) problems.push('Canvas missing.');
  if (!Object.isFrozen(store.scene)) problems.push('Authoritative scene is not frozen.');
  if (shouldShow && !visible.some(button => button.dataset.openingHandle === 'right')) problems.push('Right resize handle missing.');
  if (!shouldShow && visible.length) problems.push('Handles remain visible on unselected/locked/removed window.');
  if (view === 'top' && visible.some(button => !['move-x', 'left', 'right'].includes(button.dataset.openingHandle!))) problems.push('Top exposes a vertical handle.');
  $('#qa-check-result').textContent = problems.length ? `FAIL: ${problems.join(' ')}` : `PASS: frozen scene, no runtime errors; ${visible.length} visible handles. Native pointer capture is unchanged.`;
  log($('#qa-check-result').textContent!);
};
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLElement && event.target.closest('input,select,textarea')) return;
  if (event.key === 'Escape') { event.preventDefault(); cancel(); log(`CANCEL r${store.revision} · original opening restored`); }
  else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $<HTMLButtonElement>(event.shiftKey ? '#qa-redo' : '#qa-undo').click(); }
});
window.addEventListener('error', event => { error = event.message; runtimeErrors.push(error); log(`RUNTIME ${error}`); refreshReadout(); });
window.addEventListener('unhandledrejection', event => { error = String(event.reason); runtimeErrors.push(error); log(`PROMISE ${error}`); refreshReadout(); });
window.addEventListener('pagehide', event => { if (event.persisted) return; unsubscribe(); if (previewFrame) cancelAnimationFrame(previewFrame); viewport?.dispose(); });
refreshReadout(); log('READY · offset 2, sill 0.8, width 2, height 1.4 m · no apartment data accessed');
