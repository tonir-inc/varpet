import { bindHeightControl, heightControlMarkup } from './height-controls';
import { hasRoomCeiling } from '../core/heights';
import './inspector.css';
import type { CatalogAsset, EntityMetadata, Operation, SceneDocument, SceneObject } from '../contracts';
import { buildAssetReplacementOperations, buildOpeningTypeOperations, OPENING_TYPES } from '../core/inspector-edits';
import { inspectorOpenings } from '../core/inspector-openings';
import { buildWindowDimensionOperations, windowDimensionTargets, type WindowDimensionMatch } from '../core/window-dimensions';
import { buildFinishOperations, FINISH_DRAG_TYPE, FINISH_PRESETS, getPresetForMaterial, isWallTile, type FinishPreset } from '../core/finish-presets';

/** Floors are one group; walls list paint, then tiles under their own label. */
const finishGroups = (category: FinishPreset['category']): [string, FinishPreset[]][] => {
  const presets = FINISH_PRESETS.filter(preset => preset.category === category);
  if (category === 'floor') return [['', presets]];
  const tiles = presets.filter(isWallTile);
  return [['', presets.filter(preset => !isWallTile(preset))], ...(tiles.length ? [['Tiles', tiles] as [string, FinishPreset[]]] : [])];
};
import { wallSurfaceSpans } from '../core/wall-surfaces';
import { resolveWallFinishTargets } from '../core/wall-finish-targets';
import { icon } from './icons';
import { fillFinishSwatches } from './finish-swatch';

interface InspectorOptions {
  /** Hide navigation and batch actions that target other scene elements. */
  selectionOnly?: boolean;
  getScene(): SceneDocument;
  getCatalog(): CatalogAsset[];
  execute(operations: Operation[], label: string, onDeferredApply?: () => void): boolean;
  notice(message: string, error?: boolean): void;
  refresh(): void;
  advanced(): void;
  select?(id: string): void;
  showFullHeight?(): void;
  getDoorAngle(id: string): number;
  testDoor(id: string, angle: number): void;
  onFinishDragStart?(preset: FinishPreset): void;
  onFinishDragEnd?(): void;
}

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const pretty = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replaceAll('-', ' ');
const heading = (name: string, kind: string) => `<div class="selected-asset-heading"><span class="asset-symbol">${icon(kind === 'room' ? 'room' : kind === 'wall' ? 'walls' : 'box')}</span><div><span class="eyebrow">${esc(pretty(kind))}</span><h2>${esc(name)}</h2></div></div>`;
const number = (name: string, label: string, value: number, min = 0) => `<label class="text-field">${label}<input name="${name}" aria-label="${label}" type="number" value="${value}" min="${min}" step="any" required></label>`;
const choices = (name: string, label: string, value: string, values: [string, string][]) => `<label class="text-field">${label}<select name="${name}" aria-label="${label}">${values.map(([key, title]) => `<option value="${esc(key)}" ${key === value ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></label>`;

function commit(config: InspectorOptions, build: () => Operation[], label: string) {
  try {
    const operations = build();
    if (operations.length && !config.execute(operations, label)) config.refresh();
  } catch (error) {
    config.notice(error instanceof Error ? error.message : 'This change could not be applied.', true);
    config.refresh();
  }
}
function projectOperations(scene: SceneDocument, operations: Operation[]): Operation[] {
  return scene.project ? operations : [{type:'migrate-project'}, ...operations];
}

function openingChoices(scene: SceneDocument, id: string): string {
  const openings = inspectorOpenings(scene, id);
  if (!openings.length) return '';
  return `<section class="property-section"><div class="property-label">Doors &amp; windows<span>${openings.length}</span></div><p class="field-note">Select an opening to change its type, dimensions or opening direction.</p><div class="inspector-openings">${openings.map(({ wall, opening }) => {
    const metadata = scene.project?.metadata[opening.id];
    const name = metadata?.name ?? `${pretty(opening.kind)} ${scene.walls.indexOf(wall) + 1}.${wall.openings.indexOf(opening) + 1}`;
    const type = OPENING_TYPES[opening.kind].find(option => option.value === metadata?.mechanism)?.label ?? (metadata?.mechanism ? pretty(metadata.mechanism) : 'Type unspecified');
    return `<button type="button" data-select-opening="${esc(opening.id)}"><span><strong>${esc(name)}</strong><small>${pretty(opening.kind)} · ${esc(type)}</small></span>${icon('arrow')}</button>`;
  }).join('')}</div></section>`;
}

function windowMatchMarkup(scene: SceneDocument, id: string, disabled: string): string {
  const others = scene.walls.flatMap(wall => scene.project?.metadata[wall.id]?.phase === 'remove' ? [] : wall.openings.filter(opening => opening.id !== id && opening.kind === 'window' && scene.project?.metadata[opening.id]?.phase !== 'remove'));
  if (!others.length) return '';
  return `<section class="property-section inspector-window-match"><div class="property-label">Apply to other windows</div><p class="field-note" id="window-match-note" aria-live="polite">Use this window’s applied dimensions. Sill heights, positions and types stay as they are.</p><div class="window-match-actions">${(['height', 'size'] as const).map(match => {
    const count = windowDimensionTargets(scene, id, match).length;
    const label = match === 'height' ? 'Match height' : 'Match width & height';
    return `<button type="button" class="button full" data-window-match="${match}" data-target-count="${count}" aria-describedby="window-match-note" ${disabled || !count ? 'disabled' : ''}>${esc(label)}${count ? ` · ${count} ${count === 1 ? 'window' : 'windows'}` : ' · Already matched'}</button>`;
  }).join('')}</div><p class="inspector-error" role="alert" hidden></p></section>`;
}

export function renderAssetChoices(container: HTMLElement, object: SceneObject, config: InspectorOptions) {
  const catalog = config.getCatalog();
  const asset = catalog.find(a => a.id === object.assetId)!;
  const alternatives = catalog.filter(a => a.category === asset.category);
  if (alternatives.length < 2) { container.innerHTML = ''; return; }
  const locked = config.getScene().project?.metadata[object.id]?.locked;
  const removed = config.getScene().project?.metadata[object.id]?.phase === 'remove';
  container.innerHTML = `<div class="property-section"><label class="text-field">Replace with<select aria-label="Replace selected item" ${locked || removed ? 'disabled' : ''}>${alternatives.map(a => `<option value="${esc(a.id)}" ${a.id === asset.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label><p class="field-note">Keeps its position. Uses the new piece’s original size and finish.</p>${locked || removed ? '<p class="field-note">Unlock or restore this item in Renovate to replace it.</p>' : ''}</div>`;
  container.querySelector('select')!.onchange = event => {
    const id = (event.target as HTMLSelectElement).value;
    commit(config, () => buildAssetReplacementOperations(config.getScene(), config.getCatalog(), object.id, id), `Replace ${object.name}`);
  };
}

/** Entity-specific controls project the same checked scene as the Renovate workspace. */
export function renderEntityInspector(container: HTMLElement, id: string, config: InspectorOptions): boolean {
  const scene = config.getScene();
  const wall = scene.walls.find(w => w.openings.some(o => o.id === id));
  const opening = wall?.openings.find(o => o.id === id);
  const room = scene.rooms.find(r => r.id === id);
  const selectedWall = scene.walls.find(w => w.id === id);
  const component = scene.project?.components.find(c => c.id === id);
  const route = scene.project?.routes.find(r => r.id === id);
  if (!opening && !room && !selectedWall && !component && !route) return false;
  const meta = scene.project?.metadata[id] ?? {};
  const kind = opening?.kind ?? (room ? 'room' : selectedWall ? 'wall' : component?.kind ?? 'route');
  const name = room?.name ?? component?.name ?? route?.name ?? meta.name ?? (selectedWall ? `Wall ${scene.walls.indexOf(selectedWall) + 1}` : `${pretty(kind)} ${scene.walls.indexOf(wall!) + 1}.${wall!.openings.indexOf(opening!) + 1}`);
  const locked = meta.locked || (wall && scene.project?.metadata[wall.id]?.locked);
  const removed = meta.phase === 'remove' || component?.phase === 'remove' || (wall && scene.project?.metadata[wall.id]?.phase === 'remove');
  const disabled = locked || removed ? 'disabled' : '';
  const assumptions = scene.project?.assumptions.filter(a => a.entityId === id) ?? [];
  let body = '';
  if (opening && wall) {
    const types = OPENING_TYPES[opening.kind];
    const mechanism = meta.mechanism ?? (opening.kind === 'window' ? 'casement' : 'hinged');
    const angle = config.getDoorAngle(id);
    const travel = mechanism === 'sliding' || mechanism === 'pocket';
    const currentType = types.find(t => t.value === meta.mechanism)?.label ?? (meta.mechanism ? pretty(meta.mechanism) : 'Unspecified');
    body = `<section class="property-section"><div class="property-label">${pretty(opening.kind)} type<span>${esc(currentType)}</span></div><div class="inspector-types" role="group" aria-label="${pretty(opening.kind)} type">${types.map(type => `<button type="button" data-opening-type="${type.value}" aria-pressed="${type.value === meta.mechanism}" ${disabled}>${esc(type.label)}</button>`).join('')}</div>${!meta.mechanism ? `<p class="field-note inspector-assumption">Type is unspecified. Preview uses ${mechanism}. Choose a type to record it.</p>` : ''}</section>`;
    if (mechanism !== 'fixed') body += `<section class="property-section inspector-preview"><div class="property-label">Test opening <output id="inspector-angle-output">${travel ? Math.round(angle / (Math.PI / 2) * 100) + '%' : Math.round(angle * 180 / Math.PI) + '°'}</output></div><input id="inspector-angle" aria-label="Test opening ${travel ? 'travel' : 'angle'}" type="range" min="0" max="90" step="1" value="${Math.round(angle * 180 / Math.PI)}"><div class="inspector-preview-actions"><button type="button" class="button" data-angle="0">Close</button><button type="button" class="button" data-angle="90">Open</button></div><p class="field-note">Preview only. Does not change the saved design.</p></section>`;
    body += `<form id="inspector-opening"><fieldset ${disabled}><div class="property-label">Opening dimensions <span>m</span></div><div class="field-grid two">${number('width','Opening width',opening.width,0.2)}${number('height','Opening height',opening.height,0.2)}${number('offset','Offset along wall',opening.offset)}${number('sill',opening.kind === 'window' ? 'Sill height' : 'Opening base',opening.sill)}</div><p class="field-note">Width and height resize the wall opening; sill height sets its distance above the wall base.</p><button class="button primary full" id="apply-opening-dimensions" type="submit" disabled>Apply to this ${opening.kind}</button><p class="field-note" id="opening-edit-state" aria-live="polite">Change dimensions, then apply.</p><details class="inspector-details"><summary>Frame &amp; orientation</summary><div class="field-grid two">${number('frameWidth','Frame width',meta.frameWidth ?? 0.05)}${number('leafThickness','Leaf thickness',meta.leafThickness ?? 0.04,0.001)}</div>${choices('hinge','Hinge side',meta.hinge ?? '',[['','Unspecified'],['left','Left at wall start'],['right','Right at wall end']])}${choices('swing','Opening direction',meta.swing === undefined ? '' : String(meta.swing),[['','Unspecified'],['1','Wall side A'],['-1','Wall side B']])}<p class="field-note">Frame dimensions reduce usable space. Unspecified values are provisional.</p></details></fieldset><p class="inspector-error" role="alert" hidden></p></form>`;
    if (opening.kind === 'window' && !config.selectionOnly) body += windowMatchMarkup(scene, id, disabled);
  } else if (room || selectedWall) {
    const surfaces = room ? [['floor','Floor finish']] as const : [['wall-front','Wall side A'],['wall-back','Wall side B']] as const;
    const spans = selectedWall ? wallSurfaceSpans(selectedWall, scene.rooms, scene.project?.metadata) : [];
    body = surfaces.map(([surface, label]) => {
      if (selectedWall && !spans.some(span => surface === 'wall-front' ? span.front : span.back)) {
        return `<section class="property-section"><div class="property-label">${label}<span>Exterior</span></div><p class="field-note">Fixed neutral gray outside the apartment.</p></section>`;
      }
      const finish = scene.project?.finishes.find(f => f.entityId === id && f.surface === surface);
      const material = scene.project?.materials.find(m => m.id === finish?.materialId);
      const targets = surface === 'floor' ? [{ entityId: id, surface }] : resolveWallFinishTargets(scene, id, surface);
      const mixed = targets.some(target => {
        const assigned = scene.project?.finishes.find(f => f.entityId === target.entityId && f.surface === target.surface);
        return assigned?.materialId !== finish?.materialId || (!assigned && selectedWall && scene.walls.find(w => w.id === target.entityId)?.color !== selectedWall.color);
      });
      const current = mixed ? undefined : getPresetForMaterial(material);
      return `<section class="property-section"><div class="property-label">${label}<span>${esc(mixed ? 'Mixed finishes' : material?.name ?? 'Original')}</span></div>${targets.length > 1 ? '<p class="field-note">Applies to the entire continuous wall face in this room.</p>' : ''}${finishGroups(room ? 'floor' : 'wall').map(([group, presets]) => `${group ? `<p class="field-note">${group}</p>` : ''}<div class="inspector-swatches" role="group" aria-label="${label}${group ? ` ${group.toLowerCase()}` : ''}">${presets.map(preset => `<button type="button" data-finish="${preset.id}" data-surface="${surface}" title="${esc(preset.description)}" aria-label="${label}: ${esc(preset.name)}. ${esc(preset.description)}" aria-pressed="${current?.id === preset.id && material?.color.toLowerCase() === preset.color.toLowerCase()}" ${disabled}><span data-finish-preview="${preset.id}"></span><span class="inspector-finish-caption">${esc(preset.name)}${preset.pattern !== 'solid' ? `<small>${esc(preset.description)}</small>` : ''}</span></button>`).join('')}</div>`).join('')}</section>`;
    }).join('');
    if (config.onFinishDragStart && config.onFinishDragEnd && !disabled) body = `<p class="field-note">Drag a finish onto ${room ? 'a floor' : 'a room-facing wall surface'}, or click to apply it here.</p>${body}`;
    if (selectedWall || (room && hasRoomCeiling(scene, room))) body = heightControlMarkup(scene, { kind: selectedWall ? 'wall' : 'room', id }, !!disabled) + body;
    if (config.select && !config.selectionOnly) body = openingChoices(scene, id) + body;
  } else if (component) {
    body = `<section class="property-section"><div class="property-label">Finish</div><div class="finish-row"><input id="component-color" type="color" aria-label="Component finish color" value="${esc(component.color)}" ${disabled}><span>${esc(component.color)}</span></div></section><div class="property-section"><div class="property-label">Dimensions <span>m</span></div><p class="field-note">${component.dimensions.map(d => Number(d.toFixed(3))).join(' × ')}</p></div>`;
  } else if (route) body = `<p class="field-note">${esc(pretty(route.system))} route · ${route.points.length} points</p>`;
  container.innerHTML = `${heading(name,kind)}${locked ? '<p class="inspector-assumption">Model editing is locked. Open Renovate to unlock.</p>' : removed ? '<p class="inspector-assumption">Marked for removal. Restore this item in Renovate to edit.</p>' : ''}${body}${assumptions.length ? `<section class="property-section"><div class="property-label">Property evidence</div>${assumptions.map(a => `<p class="field-note"><strong>${esc(a.property)}</strong> · ${esc(a.status)}<br>${esc(a.value || a.question || 'Unknown')}</p>`).join('')}</section>` : ''}<div class="inspector-advanced"><button id="inspector-advanced" type="button" class="button full">${icon('walls')} More in Renovate ${icon('arrow')}</button><p class="field-note">${scene.project?.mode === 'renovate' ? 'Editing a renovation proposal.' : 'Correcting the existing model.'} Changes can be undone.</p></div>`;
  if (room || selectedWall) bindHeightControl(container, config, { kind: selectedWall ? 'wall' : 'room', id });
  container.querySelector<HTMLButtonElement>('#inspector-advanced')!.onclick = config.advanced;
  container.querySelectorAll<HTMLButtonElement>('[data-select-opening]').forEach(button => button.onclick = () => config.select?.(button.dataset.selectOpening!));
  container.querySelectorAll<HTMLButtonElement>('[data-opening-type]').forEach(button => button.onclick = () => commit(config, () => buildOpeningTypeOperations(config.getScene(), id, button.dataset.openingType as NonNullable<EntityMetadata['mechanism']>), `Change ${kind} type to ${button.textContent}`));
  const range = container.querySelector<HTMLInputElement>('#inspector-angle');
  const previewAngle = (degrees: number) => {
    config.testDoor(id, degrees * Math.PI / 180);
    if (range) range.value = String(degrees);
    const output = container.querySelector<HTMLOutputElement>('#inspector-angle-output');
    if (output) output.value = (meta.mechanism === 'sliding' || meta.mechanism === 'pocket') ? `${Math.round(degrees / 90 * 100)}%` : `${degrees}°`;
  };
  if (range) range.oninput = () => previewAngle(range.valueAsNumber);
  container.querySelectorAll<HTMLButtonElement>('[data-angle]').forEach(button => button.onclick = () => previewAngle(Number(button.dataset.angle)));
  const form = container.querySelector<HTMLFormElement>('#inspector-opening');
  const fields = form ? [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')] : [];
  const fieldValue = (field: HTMLInputElement | HTMLSelectElement) => field instanceof HTMLInputElement && field.type === 'number' ? field.valueAsNumber : field.value;
  const originalValues = fields.map(fieldValue);
  const hasOpeningDraft = () => fields.some((field, index) => fieldValue(field) !== originalValues[index]);
  const matchButtons = container.querySelectorAll<HTMLButtonElement>('[data-window-match]');
  const updateOpeningDraft = () => {
    if (!form) return;
    const dirty = hasOpeningDraft();
    form.querySelector<HTMLButtonElement>('#apply-opening-dimensions')!.disabled = !!disabled || !dirty;
    form.querySelector<HTMLElement>('#opening-edit-state')!.textContent = dirty ? 'Unapplied changes. Apply to update this opening.' : 'Change dimensions, then apply.';
    const note = container.querySelector<HTMLElement>('#window-match-note');
    if (note) note.textContent = dirty ? 'Apply this window’s changes first, then match the others.' : 'Use this window’s applied dimensions. Sill heights, positions and types stay as they are.';
    matchButtons.forEach(button => button.disabled = !!disabled || dirty || Number(button.dataset.targetCount) === 0);
    form.querySelector<HTMLElement>('[role="alert"]')!.hidden = true;
  };
  if (form) { form.oninput = updateOpeningDraft; form.onchange = updateOpeningDraft; }
  if (form && opening) form.onsubmit = event => {
    event.preventDefault();
    if (disabled) return;
    const data = new FormData(form);
    const read = (key: string) => {
      const value = String(data.get(key) ?? '').trim();
      if (!value || !Number.isFinite(Number(value))) throw new Error('Enter a finite number for each dimension.');
      return Number(value);
    };
    // Omitted metadata stays unknown unless the person changes its preview default.
    const patch: EntityMetadata = {};
    try {
      for (const [key, fallback] of [['frameWidth',0.05],['leafThickness',0.04]] as const) {
        const value = read(key);
        if (value !== (meta[key] ?? fallback)) patch[key] = value;
      }
      const hinge = String(data.get('hinge') ?? '') as EntityMetadata['hinge'];
      const swing = data.get('swing') ? Number(data.get('swing')) as 1 | -1 : undefined;
      if ((hinge || undefined) !== meta.hinge) patch.hinge = hinge || undefined;
      if (swing !== meta.swing) patch.swing = swing;
      const dimensions: Partial<Pick<typeof opening, 'width' | 'height' | 'offset' | 'sill'>> = {};
      for (const key of ['width', 'height', 'offset', 'sill'] as const) {
        const value = read(key);
        if (value !== opening[key]) dimensions[key] = value;
      }
      if (!Object.keys(dimensions).length && !Object.keys(patch).length) return;
      // Even a frame-only edit follows the opening alteration path for locks,
      // review state and assumption invalidation.
      const operations: Operation[] = [{type:'update-opening',id,patch:Object.keys(dimensions).length ? dimensions : {kind:opening.kind}}];
      if (Object.keys(patch).length) operations.push({type:'set-metadata',id,patch});
      config.execute(projectOperations(config.getScene(), operations), `Resize ${kind}: ${read('width')} × ${read('height')} m`);
    } catch (error) {
      const message = form.querySelector<HTMLElement>('[role="alert"]')!;
      message.hidden = false; message.textContent = error instanceof Error ? error.message : 'Check the dimensions.';
    }
  };
  matchButtons.forEach(button => button.onclick = () => {
    if (disabled || hasOpeningDraft()) { updateOpeningDraft(); return; }
    const message = container.querySelector<HTMLElement>('.inspector-window-match [role="alert"]')!;
    message.hidden = true;
    try {
      const match = button.dataset.windowMatch as WindowDimensionMatch;
      const current = config.getScene();
      const operations = buildWindowDimensionOperations(current, id, match);
      const count = operations.filter(operation => operation.type === 'update-opening').length;
      if (!count) { config.refresh(); return; }
      config.execute(operations, `Match ${match === 'height' ? 'height' : 'width and height'} of ${count} other ${count === 1 ? 'window' : 'windows'}`);
    } catch (error) {
      message.hidden = false;
      message.textContent = error instanceof Error ? error.message : 'These window dimensions could not be matched.';
    }
  });
  fillFinishSwatches(container);
  container.querySelectorAll<HTMLButtonElement>('[data-finish]').forEach(button => {
    const preset = FINISH_PRESETS.find(p => p.id === button.dataset.finish)!;
    let dragging = false;
    button.onclick = () => {
      if (dragging || button.disabled) return;
      commit(config, () => buildFinishOperations(config.getScene(),preset,id,button.dataset.surface as 'floor'|'wall-front'|'wall-back'), `Apply ${preset.name}`);
    };
    button.draggable = !button.disabled && !!config.onFinishDragStart && !!config.onFinishDragEnd;
    button.ondragstart = event => {
      if (!button.draggable || button.disabled || !event.dataTransfer) { event.preventDefault(); return; }
      const abort = new AbortController();
      const options = { capture: true, signal: abort.signal };
      let dropTimer: ReturnType<typeof setTimeout> | undefined;
      dragging = true;
      const end = () => {
        if (!dragging) return;
        dragging = false;
        clearTimeout(dropTimer);
        abort.abort();
        button.classList.remove('is-dragging');
        config.onFinishDragEnd?.();
      };
      // A successful drop rebuilds Properties and detaches this button. Finish
      // after the canvas drop handler, even when it stops event propagation.
      window.addEventListener('drop', () => { dropTimer = setTimeout(end, 0); }, options);
      window.addEventListener('dragend', end, options);
      button.addEventListener('dragend', end, options);
      window.addEventListener('blur', end, options);
      window.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault(); event.stopPropagation(); end();
      }, options);
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData(FINISH_DRAG_TYPE, preset.id);
      event.dataTransfer.setData('text/plain', preset.id);
      const swatch = button.firstElementChild as HTMLElement;
      event.dataTransfer.setDragImage(swatch, swatch.clientWidth / 2, swatch.clientHeight / 2);
      button.classList.add('is-dragging');
      config.onFinishDragStart?.(preset);
    };
  });
  const color = container.querySelector<HTMLInputElement>('#component-color');
  if (color && component) color.onchange = () => commit(config, () => {
    const current = config.getScene().project?.components.find(c => c.id === id);
    if (!current) throw new Error('This component no longer exists.');
    if (current.phase === 'remove') throw new Error('Restore this component in Renovate before changing its finish.');
    return [{type:'upsert-component',component:{...current,color:color.value}}];
  }, 'Change component finish');
  return true;
}
