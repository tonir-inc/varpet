import { registerDesignerRenderer } from '../adapters/designer-vision';
import type { CatalogAsset, EntityMetadata, Opening, Operation, Room, SceneDocument, Vec2, Wall } from '../contracts';
import { measureFloorPlanRoom, type FloorPlanRoomMeasurement } from '../core/floor-plan';
import { componentPosition, componentRotation } from '../core/geometry';
import { objectFootprint } from '../core/validation';
import { selectionTransformOperations, wallSelectionOperations, previewSelectionOperations } from '../core/multi-selection';
import { createPlanMove, previewPlanMove, type PlanMove } from '../core/plan-move';
import type { SceneNormalizer } from '../core/store';
import { defaultPlanLayers, planConnectionPoints, planRouteBands, routeEndpointLabel, routeLength, serviceColors, serviceLabels, visiblePlanRoutes, type PlanLayers } from '../core/plan-layers';
import '../ui/floor-plan.css';
import { drawPlanSelectionMeasurements, updatePlanMeasurementDetails } from './plan-measurements';
import { HandPanControls } from './hand-pan';

export interface FloorPlan {
  setScene(scene: SceneDocument, catalog?: CatalogAsset[]): void;
  setSelection(id: string | null, ids?: string[]): void;
  setSnap(enabled: boolean): void;
  setAdditiveSelection(enabled: boolean): void;
  setVisible(visible: boolean): void;
  cancelInteraction(): boolean;
  focus(id?: string): void;
  dispose(): void;
}

interface FloorPlanCallbacks {
  onInteraction(active: boolean): void;
  onCommit(operation: Operation, label: string): void;
  onCommitMany?(operations: Operation[], label: string): void;
  onAdditiveSelectionChange?(enabled: boolean): void;
  onError?(message: string): void;
  onSnapChange?(enabled: boolean): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
let planSequence = 0;
const metres = (value: number) => `${value.toFixed(2)} m`;
const area = (value: number) => `${value.toFixed(1)} m²`;
const pointString = (points: Vec2[]) => points.map(point => point.join(',')).join(' ');
const add = (point: Vec2, vector: Vec2, amount: number): Vec2 => [point[0] + vector[0] * amount, point[1] + vector[1] * amount];
const middle = (start: Vec2, end: Vec2): Vec2 => [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
function svg<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}
function html<K extends keyof HTMLElementTagNameMap>(name: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(name);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function bounds(points: Vec2[]) {
  const valid = points.filter(point => point.every(Number.isFinite));
  if (!valid.length) return { minX: -3, maxX: 3, minY: -3, maxY: 3 };
  return {
    minX: Math.min(...valid.map(point => point[0])), maxX: Math.max(...valid.map(point => point[0])),
    minY: Math.min(...valid.map(point => point[1])), maxY: Math.max(...valid.map(point => point[1])),
  };
}
function wallRole(metadata: EntityMetadata): string {
  return metadata.structuralRole === 'structural' ? 'Structural wall' : metadata.structuralRole === 'partition' ? 'Partition wall' : 'Wall type unknown';
}
function doorRole(metadata: EntityMetadata): string {
  return metadata.role === 'entrance' ? 'Main entrance' : metadata.role === 'interior' ? 'Interior door' : metadata.role === 'balcony' ? 'Balcony door' : metadata.role === 'access' ? 'Access door' : 'Door · role unknown';
}
function shortName(name: string, characters: number): string[] {
  if (name.length <= characters) return [name];
  const breakAt = name.lastIndexOf(' ', characters);
  const firstEnd = breakAt > characters / 3 ? breakAt : characters;
  const rest = name.slice(firstEnd).trim();
  return [name.slice(0, firstEnd), rest.length > characters ? `${rest.slice(0, Math.max(1, characters - 1))}…` : rest];
}

/** Disposable SVG projection; gestures propose checked operations to the document owner. */
export function createFloorPlan(container: HTMLElement, onSelect: (id: string | null, additive?: boolean) => void, callbacks?: FloorPlanCallbacks, normalizeScene?: SceneNormalizer): FloorPlan {
  const hatchId = `plan-wall-hatch-${++planSequence}`;
  const root = html('div', 'floor-plan');
  root.hidden = true;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Apartment floor plan');
  const drawing = svg('svg', { class: 'fp-drawing', tabindex: '0', 'aria-label': 'Floor plan. Drag items to move. Hold Space and drag to pan. Click the plan, then use W A S D or arrow keys to pan. Drag empty floor or Alt-drag to pan. Scroll to zoom. Escape cancels a move. Select a room to show dimensions.' });
  const header = html('div', 'fp-heading');
  const eyebrow = html('div', 'fp-eyebrow', 'APARTMENT PLAN');
  const headline = html('h2', 'fp-title', 'Floor plan');
  const summary = html('p', 'fp-summary');
  header.append(eyebrow, headline, summary);
  const legend = html('details', 'fp-legend');
  legend.open = true;
  const legendHeading = html('summary', 'fp-legend-heading', 'Plan key');
  const legendItems = html('div', 'fp-legend-items');
  for (const [kind, label] of [
    ['structural', 'Structural wall'], ['partition', 'Partition wall'], ['unknown', 'Type unknown'],
    ['window', 'Window'], ['entrance', 'Main entrance'], ['door', 'Other door'], ['locked', 'Locked in model'],
  ]) {
    const item = html('span', 'fp-legend-item');
    const swatch = html('span', `fp-swatch fp-swatch-${kind}`);
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, document.createTextNode(label!));
    legendItems.append(item);
  }
  const legendNote = html('p', 'fp-legend-note', 'Dashed door swing = not recorded · Faded outline = removal');
  legend.append(legendHeading, legendItems, legendNote);
  for (const system of ['electrical', 'water-hot', 'water-cold', 'waste'] as const) {
    const item = html('span', `fp-legend-item fp-service-key fp-key-${system}`);
    const swatch = html('span', `fp-swatch fp-swatch-service fp-swatch-${system}`);
    swatch.style.color = serviceColors[system]; swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, document.createTextNode(serviceLabels[system])); legendItems.append(item);
  }
  const layers: PlanLayers = { ...defaultPlanLayers };
  const layerControls = html('div', 'fp-layers');
  layerControls.setAttribute('role', 'group'); layerControls.setAttribute('aria-label', 'Plan layers');
  const planOnly = html('button', 'fp-plan-only', 'Plan only');
  planOnly.type = 'button'; planOnly.dataset.planOnly = ''; planOnly.title = 'Show walls, rooms and openings without models or services';
  planOnly.addEventListener('click', () => changeLayers({ models: false, electrical: false, water: false }));
  layerControls.append(planOnly);
  const layerInputs = new Map<keyof PlanLayers, HTMLInputElement>();
  for (const [key, name] of [['models', 'Models'], ['electrical', 'Lighting cables'], ['water', 'Water pipes']] as const) {
    const wrapper = html('label', `fp-layer fp-layer-${key}`);
    const input = html('input', ''); input.type = 'checkbox'; input.checked = layers[key]; input.dataset.planLayer = key;
    input.addEventListener('change', () => changeLayers({ ...layers, [key]: input.checked }));
    wrapper.append(input, document.createTextNode(name)); layerInputs.set(key, input); layerControls.append(wrapper);
  }
  const layerStatus = html('p', 'fp-layer-status'); layerStatus.setAttribute('role', 'status');
  layerControls.append(layerStatus);
  const detail = html('div', 'fp-detail');
  detail.setAttribute('aria-live', 'polite');
  const detailHeading = html('strong', 'fp-detail-heading');
  const detailMetrics = html('div', 'fp-detail-metrics');
  const detailNote = html('p', 'fp-detail-note');
  detail.append(detailHeading, detailMetrics, detailNote);
  const controls = html('div', 'fp-controls');
  const scaleLabel = html('span', 'fp-scale');
  function control(label: string, text: string, action: () => void): HTMLButtonElement {
    const button = html('button', 'fp-control', text);
    button.type = 'button'; button.title = label; button.setAttribute('aria-label', label);
    button.addEventListener('click', action);
    return button;
  }
  const zoomOut = control('Zoom out', '−', () => zoom(1 / 1.2));
  const zoomIn = control('Zoom in', '+', () => zoom(1.2));
  const fitButton = control('Fit apartment (F)', 'Fit plan', () => focus());
  fitButton.classList.add('fp-fit');
  const snapButton = control('Toggle plan snapping', 'Snap on', () => {
    setSnap(!snapEnabled); callbacks?.onSnapChange?.(snapEnabled);
  });
  snapButton.classList.add('fp-snap'); snapButton.setAttribute('aria-pressed', 'true');
  const multiButton = control('Select multiple walls or models', 'Select several', () => {
    setAdditiveSelection(!additiveSelection); callbacks?.onAdditiveSelectionChange?.(additiveSelection);
  });
  multiButton.setAttribute('aria-pressed', 'false');
  controls.append(multiButton, snapButton, zoomOut, scaleLabel, zoomIn, fitButton);
  const hint = html('div', 'fp-hint', 'Shift-click to select several · Drag selection to move · Space + drag to pan · Esc to cancel');
  const status = html('div', 'fp-drag-status');
  status.setAttribute('role', 'status'); status.hidden = true;
  const empty = html('div', 'fp-empty');
  empty.append(html('strong', '', 'Your apartment plan starts here'), html('p', '', 'Add rooms and walls in Renovate to see the layout and dimensions.'));
  empty.hidden = true;
  root.append(drawing, header, legend, layerControls, detail, controls, hint, empty, status);
  container.append(root);

  let scene: SceneDocument | null = null;
  let documentScene: SceneDocument | null = null;
  let catalog: CatalogAsset[] = [];
  let snapEnabled = true;
  let additiveSelection = false;
  let measurements = new Map<string, FloorPlanRoomMeasurement>();
  let selection: string | null = null;
  let selectedIds: string[] = [];
  const isSelected = (id: string) => selection === id || selectedIds.includes(id);
  let visible = false;
  let disposed = false;
  let width = 1, height = 1;
  let scale = 60, fitScale = 60, panX = 0, panY = 0;
  let fitted = false;
  let viewAdjusted = false;
  let legendInitialized = false;
  let frame = 0;
  let pointer: {
    id: number; x: number; y: number; panX: number; panY: number; scale: number;
    entityId: string | null; moved: boolean; pan: boolean; move?: PlanMove;
    delta: Vec2; snap: boolean; started: boolean; dirty: boolean;
    operation: Operation | null; operations?: Operation[]; movingIds?: string[]; error?: string;
  } | null = null;
  let world = svg('g');
  const handPan = new HandPanControls(drawing, {
    enabled: () => visible && !disposed && !!documentScene && !pointer,
    start() { drawing.classList.add('is-panning'); callbacks?.onInteraction(true); },
    move(dx, dy) {
      viewAdjusted = true; panX += dx; panY += dy;
      world.setAttribute('transform', `translate(${panX} ${panY}) scale(${scale})`);
    },
    stop() { drawing.classList.remove('is-panning'); callbacks?.onInteraction(false); },
  });
  function meta(id: string): EntityMetadata { return scene?.project?.metadata[id] ?? {}; }
  function phase(id: string): EntityMetadata['phase'] {
    const component = scene?.project?.components.find(item => item.id === id);
    const host = component?.host ? scene?.walls.find(wall => wall.id === component.host?.wallId) : scene?.walls.find(wall => wall.openings.some(opening => opening.id === id));
    if (host && meta(host.id).phase === 'remove') return 'remove';
    return component?.phase ?? scene?.project?.routes.find(route => route.id === id)?.phase ?? meta(id).phase;
  }
  function phaseNote(id: string): string {
    const value = phase(id);
    return value ? `Phase: ${{ existing: 'existing', retain: 'retained', remove: 'marked for removal', new: 'new', replace: 'replacement' }[value]}.` : '';
  }
  function getAllPoints(): Vec2[] {
    return scene ? [...scene.rooms.flatMap(room => room.polygon), ...scene.walls.flatMap(wall => [wall.start, wall.end]), ...(layers.models ? scene.objects.flatMap(object => {
      const asset = catalog.find(item => item.id === object.assetId);
      return asset ? objectFootprint(object, asset) : [[object.position[0], object.position[2]] as Vec2];
    }) : []), ...(layers.models ? scene.project?.components.flatMap(component => {
      const radius = Math.hypot(component.dimensions[0], component.dimensions[2]) / 2;
      const position = componentPosition(scene!, component);
      return [[position[0] - radius, position[2] - radius], [position[0] + radius, position[2] + radius]] as Vec2[];
    }) ?? [] : []), ...visiblePlanRoutes(scene, layers).flatMap(route => route.points.map(point => [point[0], point[2]] as Vec2)),
    ...planConnectionPoints(scene, layers).map(({ position }) => [position[0], position[2]] as Vec2)] : [];
  }
  function entityVisible(id: string): boolean {
    if (!scene) return false;
    if (scene.objects.some(object => object.id === id)) return layers.models;
    if (scene.project?.routes.some(route => route.id === id)) return visiblePlanRoutes(scene, layers).some(route => route.id === id);
    if (scene.project?.components.some(component => component.id === id)) return layers.models || planConnectionPoints(scene, layers).some(point => point.component.id === id);
    return true;
  }
  function changeLayers(next: PlanLayers): void {
    cancelInteraction();
    Object.assign(layers, next);
    for (const [key, input] of layerInputs) input.checked = layers[key];
    if (selection && !entityVisible(selection)) { selection = null; onSelect(null); }
    schedule();
  }
  function schedule(): void {
    if (!visible || disposed || frame) return;
    frame = requestAnimationFrame(() => { frame = 0; resolvePreview(); render(); });
  }
  function resize(): void {
    if (!visible || disposed) return;
    cancelInteraction();
    const nextWidth = Math.max(1, root.clientWidth), nextHeight = Math.max(1, root.clientHeight);
    panX += (nextWidth - width) / 2; panY += (nextHeight - height) / 2;
    width = nextWidth; height = nextHeight;
    drawing.setAttribute('viewBox', `0 0 ${width} ${height}`);
    root.classList.toggle('fp-compact', width < 760);
    if (!legendInitialized) { legend.open = width > 1100; legendInitialized = true; }
    if (!fitted || !viewAdjusted) focus(); else schedule();
  }
  function focus(id?: string): void {
    cancelInteraction();
    if (!visible) { fitted = false; return; }
    let points = getAllPoints();
    if (id && !entityVisible(id)) id = undefined;
    const room = scene?.rooms.find(item => item.id === id);
    const wall = scene?.walls.find(item => item.id === id || item.openings.some(opening => opening.id === id));
    const component = scene?.project?.components.find(item => item.id === id);
    const object = scene?.objects.find(item => item.id === id);
    const route = scene?.project?.routes.find(item => item.id === id);
    if (object) {
      const asset = catalog.find(item => item.id === object.assetId);
      if (asset) points = objectFootprint(object, asset);
    } else if (room) points = room.polygon;
    else if (wall) points = [wall.start, wall.end];
    else if (component) {
      const radius = Math.max(1, Math.hypot(component.dimensions[0], component.dimensions[2]));
      const position = componentPosition(scene!, component);
      points = [[position[0] - radius, position[2] - radius], [position[0] + radius, position[2] + radius]];
    } else if (route) points = route.points.map(point => [point[0], point[2]]);
    const box = bounds(points);
    const top = width < 600 ? 224 : 202;
    const bottom = 152;
    const horizontal = width < 600 ? 30 : 62;
    const availableWidth = Math.max(100, width - horizontal * 2);
    const availableHeight = Math.max(100, height - top - bottom);
    scale = Math.min(240, availableWidth / Math.max(1.5, box.maxX - box.minX + 0.6), availableHeight / Math.max(1.5, box.maxY - box.minY + 0.6));
    if (!id) fitScale = scale;
    panX = width / 2 - (box.minX + box.maxX) / 2 * scale;
    panY = top + availableHeight / 2 - (box.minY + box.maxY) / 2 * scale;
    fitted = true;
    viewAdjusted = !!id;
    schedule();
  }
  function zoom(factor: number, x = width / 2, y = height / 2): void {
    if (pointer) return;
    viewAdjusted = true;
    const nextScale = Math.max(Math.max(3, fitScale / 5), Math.min(Math.max(360, fitScale * 8), scale * factor));
    panX = x - (x - panX) * nextScale / scale;
    panY = y - (y - panY) * nextScale / scale;
    scale = nextScale;
    schedule();
  }
  function line(parent: SVGElement, start: Vec2, end: Vec2, attributes: Record<string, string | number> = {}): SVGLineElement {
    const element = svg('line', { x1: start[0], y1: start[1], x2: end[0], y2: end[1], 'vector-effect': 'non-scaling-stroke', ...attributes });
    parent.append(element); return element;
  }
  function label(parent: SVGElement, point: Vec2, value: string, className: string, size = 12): SVGTextElement {
    const element = svg('text', { x: point[0], y: point[1], class: className, 'font-size': size / scale, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    element.textContent = value; parent.append(element); return element;
  }
  function selectable(id: string, accessibleName: string, className: string): SVGGElement {
    const group = svg('g', { class: `fp-entity ${className}${isSelected(id) ? ' is-selected' : ''}${phase(id) === 'remove' ? ' is-removed' : ''}`, 'data-entity-id': id, tabindex: '0', role: 'button', 'aria-label': [accessibleName, phaseNote(id)].filter(Boolean).join('. '), 'aria-pressed': isSelected(id) ? 'true' : 'false' });
    if (callbacks && documentScene && createPlanMove(documentScene, id)) group.classList.add('is-movable');
    const title = svg('title'); title.textContent = accessibleName; group.append(title);
    return group;
  }
  function drawLock(point: Vec2): void {
    const lock = svg('g', { transform: `translate(${point.join(' ')}) scale(${1 / scale})`, class: 'fp-lock', 'aria-hidden': 'true' });
    lock.append(svg('rect', { x: -7, y: -7, width: 14, height: 15, rx: 3, fill: '#faf8f2' }), svg('path', { d: 'M-3 -1V-4a3 3 0 0 1 6 0V-1M-4 -1h8v7h-8z', fill: 'none', stroke: '#6b607d', 'stroke-width': 1.3 }));
    world.append(lock);
  }
  function drawRoom(room: Room): void {
    const measurement = measurements.get(room.id);
    if (!measurement || room.polygon.length < 3) return;
    const group = selectable(room.id, `${room.name}, ${area(measurement.area)} ${measurement.basis === 'interior' ? 'internal area' : 'modeled area'}`, 'fp-room');
    group.append(svg('polygon', { points: pointString(room.polygon), 'vector-effect': 'non-scaling-stroke', class: 'fp-room-shape' }));
    world.append(group);
  }
  function drawRoomLabel(room: Room): void {
    const measurement = measurements.get(room.id);
    if (!measurement || !measurement.polygon.length || (phase(room.id) === 'remove' && selection !== room.id)) return;
    const group = svg('g', { class: `fp-room-label${selection === room.id ? ' is-selected' : ''}${phase(room.id) === 'remove' ? ' is-removed' : ''}`, 'pointer-events': 'none' });
    const point = measurement.labelPoint;
    const name = meta(room.id).name || room.name;
    const box = bounds(measurement.polygon);
    const roomPixels = Math.min((box.maxX - box.minX) * scale - 16, 220);
    const characters = Math.max(9, Math.min(27, Math.floor(roomPixels / 6.7)));
    const nameFontSize = Math.max(10, Math.min(13, roomPixels / (Math.min(name.length, characters) * 0.56)));
    const lines = shortName(name, characters);
    const showDimensions = measurement.rectangular && roomPixels > 105;
    const totalHeight = lines.length * 16 + 21 + (showDimensions ? 17 : 0);
    let y = point[1] - totalHeight / 2 / scale;
    for (const nameLine of lines) { label(group, [point[0], y + 8 / scale], nameLine, 'fp-room-name', nameFontSize); y += 16 / scale; }
    label(group, [point[0], y + 12 / scale], area(measurement.area), 'fp-room-area', 16);
    if (showDimensions) label(group, [point[0], y + 32 / scale], `${measurement.width.toFixed(2)} × ${measurement.depth.toFixed(2)} m`, 'fp-room-size', 10);
    world.append(group);
  }
  function drawWall(wall: Wall): void {
    const dx = wall.end[0] - wall.start[0], dy = wall.end[1] - wall.start[1];
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return;
    const direction: Vec2 = [dx / length, dy / length], normal: Vec2 = [-dy / length, dx / length];
    const metadata = meta(wall.id);
    const role = metadata.structuralRole ?? 'unknown';
    const wallIndex = (scene?.walls.indexOf(wall) ?? 0) + 1;
    const name = metadata.name || `Wall ${wallIndex}`;
    const group = selectable(wall.id, `${name}, ${wallRole(metadata)}, ${metres(length)}${metadata.locked ? ', locked in model' : ''}`, `fp-wall fp-wall-${role}`);
    // This wider transparent line makes thin partitions easy to select.
    line(group, wall.start, wall.end, { stroke: 'transparent', 'stroke-width': Math.max(12, wall.thickness * scale + 6), class: 'fp-wall-hit' });
    const openings = [...wall.openings].sort((a, b) => a.offset - b.offset);
    let cursor = 0;
    function segment(start: number, end: number): void {
      if (end <= start) return;
      const a = add(wall.start, direction, start), b = add(wall.start, direction, end);
      const points = [add(a, normal, wall.thickness / 2), add(b, normal, wall.thickness / 2), add(b, normal, -wall.thickness / 2), add(a, normal, -wall.thickness / 2)];
      if (isSelected(wall.id)) group.append(svg('polygon', { points: pointString(points), fill: 'none', stroke: '#8c71c9', 'stroke-width': 7, 'stroke-opacity': 0.28, 'vector-effect': 'non-scaling-stroke' }));
      group.append(svg('polygon', { points: pointString(points), fill: role === 'structural' ? '#37363e' : role === 'partition' ? '#dfd8c9' : `url(#${hatchId})`, stroke: role === 'structural' ? '#37363e' : role === 'partition' ? '#797061' : '#82818a', 'stroke-width': isSelected(wall.id) ? 2 : 1.15, 'vector-effect': 'non-scaling-stroke', class: 'fp-wall-body' }));
    }
    for (const opening of openings) {
      const start = Math.max(0, Math.min(length, opening.offset));
      const end = Math.max(start, Math.min(length, opening.offset + opening.width));
      segment(cursor, start); cursor = Math.max(cursor, end);
    }
    segment(cursor, length);
    world.append(group);
    if (metadata.locked) drawLock(add(middle(wall.start, wall.end), normal, wall.thickness / 2 + 12 / scale));
  }
  function drawOpening(wall: Wall, opening: Opening): void {
    const dx = wall.end[0] - wall.start[0], dy = wall.end[1] - wall.start[1], length = Math.hypot(dx, dy);
    if (length < 0.001 || opening.width <= 0) return;
    const direction: Vec2 = [dx / length, dy / length], normal: Vec2 = [-dy / length, dx / length];
    const metadata = meta(opening.id), isWindow = opening.kind === 'window', entrance = !isWindow && metadata.role === 'entrance';
    const color = isWindow ? '#438cb0' : entrance ? '#82613c' : '#726984';
    const startOffset = Math.max(0, Math.min(length, opening.offset));
    const endOffset = Math.max(startOffset, Math.min(length, opening.offset + opening.width));
    const openingWidth = endOffset - startOffset;
    if (openingWidth < 0.001) return;
    const start = add(wall.start, direction, startOffset), end = add(wall.start, direction, endOffset);
    const name = metadata.name || (isWindow ? 'Window' : doorRole(metadata));
    const group = selectable(opening.id, `${name}, ${metres(opening.width)} wide`, `fp-opening ${isWindow ? 'fp-window' : entrance ? 'fp-entrance' : 'fp-door'}`);
    line(group, start, end, { stroke: 'transparent', 'stroke-width': Math.max(18, wall.thickness * scale + 8) });
    if (selection === opening.id) line(group, start, end, { stroke: '#ad90e5', 'stroke-width': wall.thickness * scale + 10, 'stroke-opacity': 0.35 });
    for (const point of [start, end]) line(group, add(point, normal, -wall.thickness / 2), add(point, normal, wall.thickness / 2), { stroke: color, 'stroke-width': 2 });
    if (isWindow) {
      for (const offset of [-wall.thickness * 0.3, wall.thickness * 0.3]) line(group, add(start, normal, offset), add(end, normal, offset), { stroke: color, 'stroke-width': 1.5 });
      line(group, middle(start, end), add(middle(start, end), normal, 0.01), { stroke: color, 'stroke-width': 3 });
    } else if (metadata.mechanism === 'sliding' || metadata.mechanism === 'pocket' || metadata.mechanism === 'fixed' || metadata.mechanism === 'tilt') {
      line(group, add(start, normal, wall.thickness * 0.22), add(end, normal, wall.thickness * 0.22), { stroke: color, 'stroke-width': entrance ? 3 : 2 });
      if (metadata.mechanism === 'sliding' || metadata.mechanism === 'pocket') {
        const a = add(start, direction, openingWidth * 0.2), b = add(start, direction, openingWidth * 0.8);
        line(group, add(a, normal, 0.12), add(b, normal, 0.12), { stroke: color, 'stroke-width': 1 });
        line(group, add(b, normal, 0.12), add(add(b, direction, -0.1), normal, 0.2), { stroke: color, 'stroke-width': 1 });
        line(group, add(b, normal, 0.12), add(add(b, direction, -0.1), normal, 0.04), { stroke: color, 'stroke-width': 1 });
      }
    } else {
      const double = metadata.mechanism === 'double';
      const known = metadata.mechanism !== undefined && metadata.swing !== undefined && (double || metadata.hinge !== undefined);
      const swing = metadata.swing ?? 1;
      for (let index = 0; index < (double ? 2 : 1); index++) {
        const right = double ? index === 1 : metadata.hinge === 'right';
        const hinge = right ? end : start;
        const radius = openingWidth / (double ? 2 : 1);
        const closed = add(hinge, direction, right ? -radius : radius);
        const opened = add(hinge, normal, swing * radius);
        const attrs = { stroke: color, 'stroke-width': entrance ? 2.1 : 1.3, 'stroke-dasharray': known ? 'none' : '4 3' };
        line(group, hinge, opened, attrs);
        group.append(svg('path', { d: `M ${closed.join(' ')} A ${radius} ${radius} 0 0 ${(right ? -1 : 1) * swing > 0 ? 1 : 0} ${opened.join(' ')}`, fill: 'none', ...attrs, 'vector-effect': 'non-scaling-stroke', class: 'fp-door-swing' }));
      }
    }
    if (entrance) {
      const point = add(middle(start, end), normal, -Math.max(0.34, 19 / scale));
      label(group, point, 'ENTRANCE', 'fp-entrance-label', 9);
    }
    world.append(group);
    if (metadata.locked) drawLock(add(middle(start, end), normal, -Math.max(0.15, 11 / scale)));
  }
  function drawDimensions(measurement: FloorPlanRoomMeasurement): void {
    const group = svg('g', { class: 'fp-dimensions', 'pointer-events': 'none', 'aria-hidden': 'true' });
    for (const edge of measurement.edges) {
      if (edge.length * scale < 47) continue;
      const inset = Math.min(0.32, Math.min(measurement.width, measurement.depth) * 0.19);
      const a = add(edge.start, edge.inwardNormal, inset), b = add(edge.end, edge.inwardNormal, inset);
      const tick = 4 / scale;
      line(group, a, b, { stroke: '#9178bb', 'stroke-width': 1, 'stroke-opacity': 0.7 });
      for (const point of [a, b]) line(group, add(point, edge.inwardNormal, -tick), add(point, edge.inwardNormal, tick), { stroke: '#9178bb', 'stroke-width': 1.3 });
      const textPoint = middle(a, b);
      const text = label(group, textPoint, metres(edge.length), 'fp-dimension-label', 10);
      let degrees = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      if (degrees > 90 || degrees < -90) degrees += 180;
      text.setAttribute('transform', `rotate(${degrees} ${textPoint.join(' ')})`);
    }
    world.append(group);
  }
  function drawComponents(): void {
    for (const component of scene?.project?.components ?? []) {
      const group = selectable(component.id, `${component.name}, ${component.kind}, ${metres(component.dimensions[0])} by ${metres(component.dimensions[2])}`, 'fp-component');
      const position = componentPosition(scene!, component);
      const cx = position[0], cy = position[2], w = component.dimensions[0], h = component.dimensions[2];
      group.append(svg('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, transform: `rotate(${-componentRotation(scene!, component) * 180 / Math.PI} ${cx} ${cy})`, fill: component.kind === 'shaft' ? `url(#${hatchId})` : component.color, stroke: selection === component.id ? '#8c71c9' : '#49454f', 'stroke-width': selection === component.id ? 3 : 1.5, 'vector-effect': 'non-scaling-stroke' }));
      world.append(group);
    }
  }
  function drawFurniture(): void {
    for (const object of [...(scene?.objects ?? [])].sort((a, b) => Number(catalog.find(item => item.id === b.assetId)?.kind === 'rug') - Number(catalog.find(item => item.id === a.assetId)?.kind === 'rug'))) {
      const asset = catalog.find(item => item.id === object.assetId);
      if (!asset) continue;
      const group = selectable(object.id, `${object.name}, drag to move`, 'fp-furniture');
      group.append(svg('polygon', { points: pointString(objectFootprint(object, asset)), fill: object.color ?? asset.color, 'vector-effect': 'non-scaling-stroke' }));
      if (isSelected(object.id)) label(group, [object.position[0], object.position[2]], object.name, 'fp-furniture-label', 11);
      world.append(group);
    }
  }
  function drawServices(): void {
    if (!scene) return;
    const bands = planRouteBands(visiblePlanRoutes(scene, layers));
    const casings = svg('g', { 'pointer-events': 'none', 'aria-hidden': 'true' });
    world.append(casings);
    const rises = new Map<string, number>();
    for (const { route, width: strokeWidth, overlapping } of bands) {
      if (!route.points.length) continue;
      const color = serviceColors[route.system];
      const points = route.points.map(point => [point[0], point[2]] as Vec2);
      const from = routeEndpointLabel(scene, route.from), to = routeEndpointLabel(scene, route.to);
      const group = selectable(route.id, `${route.name}, ${serviceLabels[route.system]}, ${from} to ${to}, ${metres(routeLength(route))}`, 'fp-service-route');
      group.dataset.system = route.system;
      const attrs = { points: pointString(points), fill: 'none', 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
      // All white casings sit behind every colored route. Shared runs use nested
      // bands so one pipe cannot erase another pipe on the same projected path.
      casings.append(svg('polyline', { ...attrs, stroke: selection === route.id ? '#b59bd8' : '#fffdfa', 'stroke-width': strokeWidth + (selection === route.id ? 6 : 3) }));
      group.append(svg('polyline', { ...attrs, stroke: 'transparent', 'stroke-width': overlapping ? strokeWidth : 14, class: 'fp-route-hit' }));
      group.append(svg('polyline', { ...attrs, stroke: color, 'stroke-width': strokeWidth, 'stroke-dasharray': route.system === 'waste' ? '7 4' : route.system === 'water-hot' ? '10 3' : 'none', class: 'fp-route-line', 'pointer-events': 'none' }));
      const vertical = points.every(point => Math.hypot(point[0] - points[0]![0], point[1] - points[0]![1]) < 1e-7);
      let risePoint: Vec2 | undefined;
      if (vertical) {
        const key = points[0]!.join(','); const index = rises.get(key) ?? 0; rises.set(key, index + 1);
        risePoint = add(points[0]!, [1, 0], (24 + index * 28) / scale);
        line(group, points[0]!, risePoint, { stroke: color, 'stroke-width': 1, 'stroke-dasharray': '2 2' });
        const badge = svg('g', { class: 'fp-route-rise' });
        badge.append(svg('circle', { cx: risePoint[0], cy: risePoint[1], r: 10 / scale, fill: '#fffdfa', stroke: color, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
        const symbol = label(badge, risePoint, '↕', 'fp-service-symbol', 13); symbol.setAttribute('fill', color);
        const title = svg('title'); title.textContent = `Vertical route: ${route.name}`; badge.append(title); group.append(badge);
      }
      for (const [index, id] of [[0, route.from], [points.length - 1, route.to]] as const) {
        let point = points[index]!;
        const connected = !!id && !!scene.project?.components.some(component => component.id === id);
        if (risePoint) point = add(risePoint, [0, index === 0 ? -1 : 1], 15 / scale);
        else if (connected) {
          const neighbor = (index === 0 ? points : [...points].reverse()).find(other => Math.hypot(other[0] - point[0], other[1] - point[1]) > 1e-7)!;
          const length = Math.hypot(neighbor[0] - point[0], neighbor[1] - point[1]);
          point = add(point, [(neighbor[0] - point[0]) / length, (neighbor[1] - point[1]) / length], 16 / scale);
        }
        const terminal = svg('circle', { cx: point[0], cy: point[1], r: (connected ? 4 : 5) / scale, fill: connected ? color : '#fffdfa', stroke: color, 'stroke-width': 1.7, 'vector-effect': 'non-scaling-stroke', class: `fp-route-terminal ${connected ? 'is-connected' : 'is-unconnected'}` });
        const title = svg('title'); title.textContent = routeEndpointLabel(scene, id); terminal.append(title); group.append(terminal);
      }
      if (selection === route.id) label(group, add(risePoint ?? middle(points[0]!, points.at(-1)!), [0, -1], risePoint ? 28 / scale : 17 / scale), route.name, 'fp-service-label', 11);
      world.append(group);
    }
    const symbols: Record<string, string> = { switch: 'S', outlet: 'O', panel: 'E', junction: 'J', sink: 'W', toilet: 'WC', shower: 'SH', bath: 'B', drain: 'D', valve: 'V', riser: 'R' };
    for (const { component, position, systems } of planConnectionPoints(scene, layers)) {
      const point: Vec2 = [position[0], position[2]];
      const color = systems[0] ? serviceColors[systems[0]] : '#397c94';
      const group = selectable(component.id, `${component.name}, ${component.kind}`, 'fp-service-point');
      group.append(svg('circle', { cx: point[0], cy: point[1], r: 9 / scale, fill: '#fffdfa', stroke: selection === component.id ? '#8c71c9' : color, 'stroke-width': selection === component.id ? 3 : 1.7, 'vector-effect': 'non-scaling-stroke' }));
      if (component.kind === 'light') {
        for (const direction of [-1, 1]) line(group, add(point, [-1, -direction], 5 / scale), add(point, [1, direction], 5 / scale), { stroke: color, 'stroke-width': 1.5 });
      } else {
        const symbol = label(group, point, symbols[component.kind] ?? component.kind[0]!.toUpperCase(), 'fp-service-symbol', 9);
        symbol.setAttribute('fill', color);
      }
      if (selection === component.id) label(group, add(point, [0, -1], 20 / scale), component.name, 'fp-service-label', 11);
      world.append(group);
    }
  }
  function drawWallHandles(): void {
    const wall = selectedIds.length > 1 ? undefined : scene?.walls.find(item => item.id === selection);
    if (!wall || !callbacks || !documentScene || !createPlanMove(documentScene, wall.id)) return;
    for (const endpoint of ['start', 'end'] as const) {
      const point = wall[endpoint];
      const group = svg('g', { class: 'fp-endpoint', 'data-entity-id': wall.id, 'data-endpoint': endpoint, 'aria-label': `Drag wall ${endpoint} corner` });
      group.append(svg('circle', { cx: point[0], cy: point[1], r: 7 / scale, fill: '#fffdfb', stroke: '#8c71c9', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }));
      world.append(group);
    }
  }
  function renderDetail(): void {
    detailMetrics.replaceChildren();
    function metric(value: string, description: string): void {
      const item = html('div', 'fp-metric'); item.append(html('strong', '', value), html('span', '', description)); detailMetrics.append(item);
    }
    const room = scene?.rooms.find(item => item.id === selection);
    const wall = scene?.walls.find(item => item.id === selection);
    const openingWall = scene?.walls.find(item => item.openings.some(opening => opening.id === selection));
    const opening = openingWall?.openings.find(item => item.id === selection);
    const component = scene?.project?.components.find(item => item.id === selection);
    const object = scene?.objects.find(item => item.id === selection);
    const route = scene?.project?.routes.find(item => item.id === selection);
    if (route && scene) {
      detailHeading.textContent = `${route.name} · ${serviceLabels[route.system]}`;
      metric(metres(routeLength(route)), 'Route length'); metric(`${Math.round(route.diameter * 1000)} mm`, 'Diameter');
      detailNote.textContent = `${routeEndpointLabel(scene, route.from)} → ${routeEndpointLabel(scene, route.to)}${route.circuit ? ` · Circuit: ${route.circuit}` : ''}. Recorded path, including elevation changes.`;
    } else if (object) {
      detailHeading.textContent = object.name;
      metric(metres(object.position[0]), 'Position X'); metric(metres(object.position[2]), 'Position Z');
      detailNote.textContent = 'Drag to move · Furniture snaps to 0.25 m · Shift-drag for finer placement';
    } else if (room) {
      const measurement = measurements.get(room.id)!;
      detailHeading.textContent = meta(room.id).name || room.name;
      metric(area(measurement.area), measurement.basis === 'interior' ? 'Internal area' : 'Modeled area');
      metric(`${measurement.width.toFixed(2)} × ${measurement.depth.toFixed(2)} m`, measurement.rectangular ? measurement.basis === 'interior' ? 'Inner dimensions' : 'Boundary dimensions' : 'Overall extents');
      metric(metres(measurement.perimeter), 'Perimeter');
      detailNote.textContent = measurement.note;
    } else if (wall) {
      const metadata = meta(wall.id);
      detailHeading.textContent = `${metadata.name || `Wall ${(scene?.walls.indexOf(wall) ?? 0) + 1}`} · ${wallRole(metadata)}`;
      metric(metres(Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])), 'Length');
      metric(metres(wall.thickness), 'Thickness'); metric(metres(wall.height), 'Height');
      detailNote.textContent = [metadata.structuralRole === 'partition' ? 'Partition classification; alteration suitability is not recorded here.' : metadata.structuralRole === 'structural' ? 'Recorded as structural.' : 'Structural role has not been recorded.', metadata.locked ? 'Locked in model.' : '', metadata.boundary ? `${metadata.boundary[0]!.toUpperCase()}${metadata.boundary.slice(1)} boundary.` : ''].filter(Boolean).join(' ');
    } else if (opening) {
      const metadata = meta(opening.id);
      detailHeading.textContent = metadata.name || (opening.kind === 'window' ? 'Window' : doorRole(metadata));
      metric(metres(opening.width), 'Opening width'); metric(metres(opening.height), 'Height');
      if (opening.kind === 'window') metric(metres(opening.sill), 'Sill height');
      const unknownSwing = opening.kind === 'door' && !['sliding', 'pocket', 'fixed', 'tilt'].includes(metadata.mechanism ?? '') && (metadata.mechanism === undefined || metadata.swing === undefined || (metadata.mechanism !== 'double' && metadata.hinge === undefined));
      detailNote.textContent = [opening.kind === 'door' && metadata.name ? doorRole(metadata) + '.' : '', metadata.mechanism ? `${metadata.mechanism[0]!.toUpperCase()}${metadata.mechanism.slice(1)} opening.` : '', unknownSwing ? 'Swing not recorded; dashed symbol is indicative.' : '', metadata.locked ? 'Locked in model.' : ''].filter(Boolean).join(' ') || 'Dimensions come from the current scene.';
    } else if (component) {
      detailHeading.textContent = component.name;
      metric(`${component.dimensions[0].toFixed(2)} × ${component.dimensions[2].toFixed(2)} m`, 'Footprint');
      metric(metres(component.dimensions[1]), 'Height'); detailNote.textContent = `${component.kind[0]!.toUpperCase()}${component.kind.slice(1)}.`;
    } else {
      detailHeading.textContent = 'Explore the apartment';
      detailNote.textContent = 'Select a room for its area and dimensions. Walls, doors and windows are selectable too.';
    }
    if (selection && (room || wall || opening || component || object || route)) detailNote.textContent = [phaseNote(selection), detailNote.textContent].filter(Boolean).join(' ');
    detail.classList.toggle('fp-detail-overview', !room && !wall && !opening && !component && !object && !route);
  }
  function render(): void {
    if (!visible || !scene || disposed) return;
    const activeId = drawing.contains(document.activeElement) ? document.activeElement?.getAttribute('data-entity-id') : null;
    const defs = svg('defs');
    const patternSize = 7 / scale;
    const pattern = svg('pattern', { id: hatchId, patternUnits: 'userSpaceOnUse', width: patternSize, height: patternSize, patternTransform: 'rotate(45)' });
    pattern.append(svg('rect', { width: patternSize, height: patternSize, fill: '#f2efe8' }), svg('line', { x1: 0, y1: 0, x2: 0, y2: patternSize, stroke: '#b9b4ba', 'stroke-width': 2 / scale }));
    defs.append(pattern);
    world = svg('g', { transform: `translate(${panX} ${panY}) scale(${scale})` });
    drawing.replaceChildren(defs, world);
    for (const room of scene.rooms) drawRoom(room);
    if (layers.models) drawFurniture();
    for (const wall of scene.walls) drawWall(wall);
    for (const wall of scene.walls) for (const opening of wall.openings) drawOpening(wall, opening);
    if (layers.models) drawComponents();
    const selectedRoom = selection ? measurements.get(selection) : undefined;
    if (selectedRoom) drawDimensions(selectedRoom);
    for (const room of scene.rooms) drawRoomLabel(room);
    drawServices();
    drawPlanSelectionMeasurements(world, scene, catalog, selection, scale, layers.models);
    drawWallHandles();
    if (activeId) [...drawing.querySelectorAll<SVGElement>('[data-entity-id]')].find(element => element.getAttribute('data-entity-id') === activeId)?.focus({ preventScroll: true });
    const hasGeometry = getAllPoints().length > 0;
    empty.hidden = hasGeometry;
    legend.hidden = !hasGeometry;
    detail.hidden = !hasGeometry;
    headline.textContent = scene.name || 'Floor plan';
    const activeRooms = scene.rooms.filter(room => phase(room.id) !== 'remove');
    summary.textContent = `${activeRooms.length} ${activeRooms.length === 1 ? 'room' : 'rooms'} · ${area(activeRooms.reduce((sum, room) => sum + (measurements.get(room.id)?.area ?? 0), 0))} modeled floor area`;
    scaleLabel.textContent = `${Math.round(scale / fitScale * 100)}%`;
    planOnly.setAttribute('aria-pressed', String(!layers.models && !layers.electrical && !layers.water));
    root.classList.toggle('fp-has-services', layers.electrical || layers.water);
    for (const item of legendItems.querySelectorAll<HTMLElement>('.fp-service-key')) item.hidden = item.classList.contains('fp-key-electrical') ? !layers.electrical : !layers.water;
    const routes = visiblePlanRoutes(scene, layers);
    const cableCount = routes.filter(route => route.system === 'electrical').length;
    const pipeCount = routes.length - cableCount;
    layerStatus.textContent = [
      layers.electrical ? cableCount ? `${cableCount} ${cableCount === 1 ? 'cable' : 'cables'}` : 'No lighting cables recorded' : '',
      layers.water ? pipeCount ? `${pipeCount} water ${pipeCount === 1 ? 'route' : 'routes'}` : 'No water pipes recorded' : '',
      (layers.electrical && !cableCount) || (layers.water && !pipeCount) ? 'Add routes in Renovate → Systems' : routes.length ? 'Filled end = connected · Open end = not connected' : '',
    ].filter(Boolean).join(' · ');
    layerStatus.hidden = !layerStatus.textContent;
    renderDetail();
    updatePlanMeasurementDetails(detail, detailMetrics, scene, catalog, selection);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  drawing.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = drawing.getBoundingClientRect();
    zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  function project(next: SceneDocument): void {
    scene = next;
    measurements = new Map(next.rooms.map(room => [room.id, measureFloorPlanRoom(next, room)]));
  }
  function setAdditiveSelection(enabled: boolean): void {
    cancelInteraction(); additiveSelection = enabled;
    multiButton.setAttribute('aria-pressed', String(enabled));
    multiButton.textContent = enabled ? 'Done selecting' : 'Select several';
  }
  function setSnap(enabled: boolean): void {
    snapEnabled = enabled;
    snapButton.textContent = enabled ? 'Snap on' : 'Smooth';
    snapButton.setAttribute('aria-pressed', String(enabled));
    snapButton.title = 'Furniture: 0.25 m · Walls: 90° alignments and 0.05 m · Openings and fixtures: 0.05 m · Hold Shift for smooth movement';
  }
  function resolvePreview(): void {
    if (!pointer?.move || !pointer.dirty) return;
    pointer.dirty = false;
    let result;
    if (pointer.movingIds && pointer.movingIds.length > 1) {
      const move = pointer.move;
      const quantize = (value: number, step: number) => pointer!.snap ? Math.round(value / step) * step : value;
      try {
        let operations: Operation[] = [];
        if (move.kind === 'wall') {
          const delta: Vec2 = [quantize(pointer.delta[0], 0.05), quantize(pointer.delta[1], 0.05)];
          if (delta.some(value => Math.abs(value) > 1e-9)) operations = wallSelectionOperations(move.source, pointer.movingIds, delta);
        } else if (move.kind === 'object') {
          const position = [...move.object.position] as typeof move.object.position;
          position[0] = quantize(position[0] + pointer.delta[0], 0.25);
          position[2] = quantize(position[2] + pointer.delta[1], 0.25);
          if (position.some((value, i) => Math.abs(value - move.object.position[i]!) > 1e-9)) operations = selectionTransformOperations(move.source, move.id, { position }, pointer.movingIds);
        }
        pointer.operations = operations;
        result = { scene: operations.length ? previewSelectionOperations(move.source, operations, catalog, normalizeScene) : move.source, operation: null, error: undefined as string | undefined };
      } catch (error) {
        pointer.operations = undefined;
        result = { scene: null, operation: null, error: error instanceof Error ? error.message : 'This selection cannot move here.' };
      }
    } else result = previewPlanMove(pointer.move, pointer.delta, pointer.snap, catalog, normalizeScene);
    pointer.operation = result.operation; pointer.error = result.error;
    project(result.scene ?? pointer.move.source);
    status.hidden = false;
    status.classList.toggle('is-invalid', !!result.error);
    drawing.classList.toggle('is-invalid', !!result.error);
    status.textContent = result.error ? `Cannot move: ${result.error}` : `${pointer.move.label} · Release to apply · Esc to cancel`;
  }
  function cancelInteraction(): boolean {
    const wasPanning = handPan.active;
    handPan.cancel();
    const previous = pointer;
    if (!previous) return wasPanning;
    pointer = null;
    if (drawing.hasPointerCapture(previous.id)) drawing.releasePointerCapture(previous.id);
    drawing.classList.remove('is-panning', 'is-moving', 'is-invalid'); status.hidden = true;
    if (documentScene) project(documentScene);
    if (previous.started) callbacks?.onInteraction(false);
    schedule();
    return true;
  }
  function movePointer(event: PointerEvent): void {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (Math.hypot(dx, dy) > 4) pointer.moved = true;
    if (!pointer.moved) return;
    if (pointer.move) {
      if (!pointer.started) { pointer.started = true; callbacks?.onInteraction(true); }
      pointer.delta = [dx / pointer.scale, dy / pointer.scale];
      pointer.snap = snapEnabled && !event.shiftKey;
      pointer.dirty = true;
      drawing.classList.add('is-moving'); schedule();
    } else if (pointer.pan) {
      viewAdjusted = true;
      panX = pointer.panX + dx; panY = pointer.panY + dy;
      world.setAttribute('transform', `translate(${panX} ${panY}) scale(${scale})`);
      drawing.classList.add('is-panning');
    }
  }
  drawing.addEventListener('contextmenu', event => event.preventDefault());
  drawing.addEventListener('pointerdown', event => {
    if (pointer || !visible || !documentScene || ![0, 1, 2].includes(event.button)) return;
    const entity = event.target instanceof Element ? event.target.closest('[data-entity-id]') : null;
    const id = entity?.getAttribute('data-entity-id') ?? null;
    const pan = event.button !== 0 || event.altKey || !id || documentScene.rooms.some(room => room.id === id);
    const endpoint = entity?.getAttribute('data-endpoint');
    event.preventDefault(); drawing.focus({ preventScroll: true });
    const additive = event.shiftKey || additiveSelection;
    if (event.button === 0 && !event.altKey && additive) { onSelect(id, true); return; }
    if (event.button === 0 && !event.altKey && id && !isSelected(id)) onSelect(id);
    const movingIds = callbacks?.onCommitMany && id && selectedIds.includes(id) && selectedIds.length > 1 ? [...selectedIds] : undefined;
    const move = !pan && callbacks && id ? createPlanMove(documentScene, id, !movingIds && (endpoint === 'start' || endpoint === 'end') ? endpoint : undefined) : undefined;
    if (!visible || (move && documentScene !== move.source)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY, scale,
      entityId: id, moved: false, pan, move, movingIds, delta: [0, 0], snap: snapEnabled, started: false, dirty: false, operation: null };
    drawing.setPointerCapture(event.pointerId);
  });
  drawing.addEventListener('pointermove', movePointer);
  drawing.addEventListener('pointerup', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    movePointer(event); resolvePreview();
    const current = pointer;
    cancelInteraction();
    if (current.started && current.operations?.length) callbacks?.onCommitMany?.(current.operations, current.move!.kind === 'wall' ? 'Move selected walls' : 'Move selected furniture');
    else if (current.started && current.operation) callbacks?.onCommit(current.operation, current.move!.label);
    else if (current.error) callbacks?.onError?.(current.error);
    else if (!current.moved && event.button === 0 && !event.altKey && !current.entityId) onSelect(null);
  });
  drawing.addEventListener('pointercancel', event => { if (pointer?.id === event.pointerId) cancelInteraction(); });
  drawing.addEventListener('lostpointercapture', event => { if (pointer?.id === event.pointerId) cancelInteraction(); });
  const onBlur = () => { cancelInteraction(); };
  window.addEventListener('blur', onBlur);
  drawing.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || document.querySelector('dialog[open]')) return;
    const key = event.key.toLowerCase();
    const entity = event.target instanceof Element ? event.target.closest('[data-entity-id]') : null;
    if (event.key === 'Escape' && cancelInteraction()) { event.preventDefault(); event.stopPropagation(); return; }
    if (pointer) return;
    if ((event.key === 'Enter' || event.key === ' ') && entity) onSelect(entity.getAttribute('data-entity-id'), event.shiftKey || additiveSelection);
    else if (event.key === 'Escape') onSelect(null);
    else if (event.key === '+' || event.key === '=') zoom(1.2);
    else if (event.key === '-') zoom(1 / 1.2);
    else if (event.key.toLowerCase() === 'f') focus(selection ?? undefined);
    else if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      viewAdjusted = true;
      panX += key === 'a' || key === 'arrowleft' ? 35 : key === 'd' || key === 'arrowright' ? -35 : 0;
      panY += key === 'w' || key === 'arrowup' ? 35 : key === 's' || key === 'arrowdown' ? -35 : 0;
      schedule();
    } else return;
    event.preventDefault(); event.stopPropagation();
  });
  const unregisterDesignerSnapshot = registerDesignerRenderer(drawing, render, () => pointer || handPan.active ? null : documentScene);
  return {
    setScene(nextScene, nextCatalog = catalog) {
      cancelInteraction();
      const first = scene === null;
      documentScene = nextScene; catalog = nextCatalog; project(nextScene);
      if (first && visible) focus();
      schedule();
    },
    setSelection(id, ids = id ? [id] : []) {
      if (selection !== id || JSON.stringify(selectedIds) !== JSON.stringify(ids)) {
        cancelInteraction(); selection = id; selectedIds = [...ids]; schedule();
      }
    },
    setSnap, setAdditiveSelection, cancelInteraction,
    setVisible(nextVisible) {
      visible = nextVisible; root.hidden = !visible;
      if (visible) resize();
      else { cancelInteraction(); if (frame) { cancelAnimationFrame(frame); frame = 0; } }
    },
    focus,
    dispose() { unregisterDesignerSnapshot(); cancelInteraction(); handPan.dispose(); disposed = true; window.removeEventListener('blur', onBlur); resizeObserver.disconnect(); if (frame) cancelAnimationFrame(frame); root.remove(); },
  };
}
