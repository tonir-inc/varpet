import type { CatalogAsset, SceneDocument, Vec2 } from '../contracts';
import { measurePlanOpening, type PlanMeasurementSegment } from '../core/plan-measurements';
import { objectFootprint } from '../core/validation';
import '../ui/plan-measurements.css';

const NS = 'http://www.w3.org/2000/svg';
const metres = (value: number) => `${value.toFixed(2)} m`;
const add = (point: Vec2, vector: Vec2, amount: number): Vec2 => [point[0] + vector[0] * amount, point[1] + vector[1] * amount];
const midpoint = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const segment = (start: Vec2, end: Vec2): PlanMeasurementSegment => ({ start, end, length: Math.hypot(end[0] - start[0], end[1] - start[1]) });
function element<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/** Guides use checked/preview geometry immediately; they never interpolate or intercept input. */
export function drawPlanSelectionMeasurements(parent: SVGGElement, scene: SceneDocument, catalog: CatalogAsset[], id: string | null, scale: number, modelsVisible = true): void {
  if (!id || !Number.isFinite(scale) || scale <= 0) return;
  const group = element('g', { class: 'fp-selection-measurements', 'pointer-events': 'none', 'aria-hidden': 'true' });
  function line(target: SVGElement, a: Vec2, b: Vec2, className: string): void {
    target.append(element('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: className, 'vector-effect': 'non-scaling-stroke' }));
  }
  function dimension(value: PlanMeasurementSegment, normal: Vec2, offset: number, name: string, emphasis = false, labelLane = 0): void {
    const rail = element('g', { class: `fp-selection-dimension${emphasis ? ' is-primary' : ''}`, 'data-measurement': name, 'data-metres': value.length });
    const a = add(value.start, normal, offset), b = add(value.end, normal, offset);
    for (const [point, end] of [[value.start, a], [value.end, b]] as [Vec2, Vec2][]) {
      line(rail, add(point, normal, 4 / scale), add(end, normal, 5 / scale), 'fp-measure-extension');
      const tick: Vec2 = [(normal[0] - normal[1]) * 3 / scale, (normal[1] + normal[0]) * 3 / scale];
      line(rail, add(end, tick, -1), add(end, tick, 1), 'fp-measure-line');
    }
    line(rail, a, b, 'fp-measure-line');
    const center = midpoint(a, b);
    const textPoint = add(center, normal, (10 + labelLane) / scale);
    if (labelLane) line(rail, center, add(textPoint, normal, -6 / scale), 'fp-measure-extension');
    let angle = Math.atan2(-normal[0], normal[1]) * 180 / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle <= -90) angle += 180;
    const text = element('text', { x: textPoint[0], y: textPoint[1], class: 'fp-measure-text', 'font-size': 11 / scale, 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: `rotate(${angle} ${textPoint[0]} ${textPoint[1]})` });
    text.textContent = metres(value.length); rail.append(text); group.append(rail);
  }
  // Prefer the outside of the apartment for perimeter guides; interior guides use
  // the same stable side of their host, independent of stored endpoint ordering.
  function outward(start: Vec2, end: Vec2, normal: Vec2): Vec2 {
    const points = scene.walls.flatMap(wall => [wall.start, wall.end]);
    const center: Vec2 = points.length ? [
      (Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2,
      (Math.min(...points.map(p => p[1])) + Math.max(...points.map(p => p[1]))) / 2,
    ] : [0, 0];
    const mid = midpoint(start, end);
    return (mid[0] - center[0]) * normal[0] + (mid[1] - center[1]) * normal[1] < 0 ? [-normal[0], -normal[1]] : normal;
  }
  const host = scene.walls.find(wall => wall.openings.some(opening => opening.id === id));
  const opening = host?.openings.find(item => item.id === id);
  const wall = scene.walls.find(item => item.id === id);
  const object = modelsVisible ? scene.objects.find(item => item.id === id) : undefined;
  if (host && opening) {
    const measure = measurePlanOpening(scene, host, opening);
    if (!measure) return;
    const normal = outward(host.start, host.end, measure.normal);
    const offset = measure.wallThickness / 2 + 27 / scale;
    const crowded = [measure.before, measure.opening, measure.after].some(part => part.length * scale < 48);
    dimension(measure.before, normal, offset, 'gap-before', false, crowded ? 16 : 0);
    dimension(measure.opening, normal, offset, 'opening-width', true);
    dimension(measure.after, normal, offset, 'gap-after', false, crowded ? 32 : 0);
  } else if (wall) {
    const value = segment(wall.start, wall.end);
    if (value.length < 0.00001) return;
    const normal = outward(wall.start, wall.end, [-(wall.end[1] - wall.start[1]) / value.length, (wall.end[0] - wall.start[0]) / value.length]);
    dimension(value, normal, wall.thickness / 2 + 27 / scale, 'wall-length', true);
  } else if (object) {
    const asset = catalog.find(item => item.id === object.assetId);
    if (!asset) return;
    const points = objectFootprint(object, asset);
    for (const [a, b, name] of [[0, 1, 'furniture-width'], [1, 2, 'furniture-depth']] as const) {
      const value = segment(points[a]!, points[b]!);
      if (value.length < 0.00001) continue;
      const normal: Vec2 = [(value.end[1] - value.start[1]) / value.length, -(value.end[0] - value.start[0]) / value.length];
      dimension(value, normal, 22 / scale, name, true);
    }
  }
  if (group.childElementCount) parent.append(group);
}

/** The persistent-size card also carries all values when a short/zoomed-out guide is crowded. */
export function updatePlanMeasurementDetails(card: HTMLElement, metrics: HTMLElement, scene: SceneDocument, catalog: CatalogAsset[], id: string | null): void {
  card.querySelector('.fp-measurement-note')?.remove();
  card.classList.remove('fp-detail-measured');
  const host = scene.walls.find(wall => wall.openings.some(opening => opening.id === id));
  const opening = host?.openings.find(item => item.id === id);
  const object = scene.objects.find(item => item.id === id);
  function metric(value: number, name: string, title?: string): void {
    const item = document.createElement('div'); item.className = 'fp-metric';
    const strong = document.createElement('strong'); strong.textContent = metres(value);
    const label = document.createElement('span'); label.textContent = name;
    if (title) item.title = title;
    item.append(strong, label); metrics.append(item);
  }
  let note = '';
  if (host && opening) {
    const measure = measurePlanOpening(scene, host, opening);
    if (!measure) return;
    metrics.replaceChildren();
    metric(measure.width, 'Opening width'); metric(measure.height, 'Height');
    metric(measure.sill, opening.kind === 'window' ? 'Sill height' : 'Base height');
    metric(measure.before.length, `${measure.before.label} gap`, `To ${measure.before.boundaryLabel}`);
    metric(measure.after.length, `${measure.after.label} gap`, `To ${measure.after.boundaryLabel}`);
    metric(measure.headroom, 'Above opening', 'Opening top to modeled wall top');
    note = `${measure.before.label}: ${measure.before.boundaryLabel} · ${measure.after.label}: ${measure.after.boundaryLabel}. Gaps follow the wall to the nearest wall faces, opening edges or wall ends. Model dimensions, excluding finishes.`;
  } else if (object) {
    const asset = catalog.find(item => item.id === object.assetId);
    if (!asset) return;
    metrics.replaceChildren();
    metric(asset.dimensions[0] * object.scale[0], 'Width');
    metric(asset.dimensions[2] * object.scale[2], 'Depth');
    metric(asset.dimensions[1] * object.scale[1], 'Height');
    note = `Position X ${metres(object.position[0])} · Z ${metres(object.position[2])}. Dimensions follow the piece’s rotation and scale.`;
  } else return;
  card.classList.add('fp-detail-measured');
  const description = document.createElement('p'); description.className = 'fp-measurement-note'; description.textContent = note;
  card.append(description);
}
