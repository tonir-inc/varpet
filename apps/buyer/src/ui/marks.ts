import type { CatalogAsset, SceneDocument, SceneObject, Vec3 } from '../../../editor/src/contracts';
import type { FinishViewport } from '../../../editor/src/render/viewport';

/** A numbered bubble on a piece in the room, the same number as in the picture and the legend. */
export interface RoomMark { key: number; objectId: string; pending: boolean }
export type BuildStage = 'queued' | 'writing' | 'checking' | 'fixing' | 'done';
/** A custom piece being built: drawn as a construction drawing that fills up, with a card pinned to it. */
export interface BuildMark { key: number; objectId: string; name: string; stage: BuildStage; startedAt: number }
export interface MarksInput {
  scene: SceneDocument; catalog: CatalogAsset[]; marks: RoomMark[]; changed: string[]; builds: BuildMark[];
  /** Seconds into the designer's run, read every frame so drawings keep moving between stream lines. */
  now(): number;
}

type P = [number, number];
const NS = 'http://www.w3.org/2000/svg';
/** Measured 26 Sept: one piece takes about two minutes from a free builder to a checked model. */
export const BUILD_SECONDS = 125;
const STAGE_TEXT: Record<BuildStage, string> = { queued: 'Waiting for a builder', writing: 'Drafting the design', checking: 'Checking every measurement', fixing: 'Fixing one detail', done: 'Built' };

function box(object: SceneObject, asset: CatalogAsset, top = 1): Vec3[] {
  const [w, h, d] = asset.dimensions.map((v, i) => v * object.scale[i]!) as Vec3;
  const c = Math.cos(object.rotation), s = Math.sin(object.rotation);
  const out: Vec3[] = [];
  for (const y of [0, h * top]) for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as P[]) {
    out.push([object.position[0] + dx * c + dz * s, y, object.position[2] - dx * s + dz * c]);
  }
  return out;
}
const EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

function hull(points: P[]): P[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P[] = [], upper: P[] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop(); lower.push(p); }
  for (const p of pts.reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A revision cloud: scallops along a polygon, bulging outwards. */
export function cloudPath(points: P[], scallop = 24): string {
  if (points.length < 3) return '';
  const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
  const pts = area < 0 ? [...points].reverse() : points;
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!, length = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(length / scallop));
    for (let k = 1; k <= n; k++) {
      const r = (length / n) * 0.62;
      d += ` A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(a[0] + (b[0] - a[0]) * k / n).toFixed(1)} ${(a[1] + (b[1] - a[1]) * k / n).toFixed(1)}`;
    }
  });
  return d;
}
const pts = (list: P[]) => list.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * The designer's layer over the 3D view: the revision cloud, numbered bubbles, and for each piece being built
 * a construction drawing (wireframe, hatching that rises with progress, a measuring plane) plus a build card.
 */
export function createRoomMarks(svg: SVGSVGElement, cards: HTMLElement, viewport: FinishViewport) {
  let input: MarksInput | null = null, visible = true, raf = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cloudShownAt = 0, cloudKey = '';
  const finished = new Map<string, number>();
  svg.innerHTML = `<defs><pattern id="bp-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#0C6A55" stroke-width="1.6"/></pattern></defs><g class="layer"></g>`;
  const layer = svg.querySelector('g.layer')!;

  const draw = () => {
    layer.replaceChildren();
    if (!input || !visible) { cards.replaceChildren(); return false; }
    const wall = performance.now(), t = wall / 1000, now = input.now();
    const assets = new Map(input.catalog.map(asset => [asset.id, asset]));
    const objects = new Map(input.scene.objects.map(object => [object.id, object]));
    const project = (p: Vec3): P | null => { const r = viewport.project(p); return r && r.visible ? [r.x, r.y] : null; };
    const el = (name: string, attrs: Record<string, string | number>, parent: Element = layer) => {
      const node = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v)); parent.append(node); return node;
    };
    let moving = false;

    // Revision cloud round everything the proposal changed; it draws itself in once.
    const changedPoints = input.changed.flatMap(id => { const o = objects.get(id), a = o && assets.get(o.assetId); return o && a ? box(o, a).map(project).filter((p): p is P => Boolean(p)) : []; });
    const ring = hull(changedPoints);
    const key = input.changed.join(',');
    if (key !== cloudKey) { cloudKey = key; cloudShownAt = wall; }
    if (ring.length >= 3) {
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const grown = ring.map(([x, y]): P => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * 18, y + dy / l * 18]; });
      // Folio marks a changed area with a thin dashed frame and four corner brackets, not a cloud.
      const xs = grown.map(p => p[0]), ys = grown.map(p => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], c = 18;
      el('rect', { class: 'mark-frame', x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
      const path = el('path', { class: 'mark-cloud', d: `M${x0} ${y0 + c}V${y0}H${x0 + c}M${x1 - c} ${y0}H${x1}V${y0 + c}M${x1} ${y1 - c}V${y1}H${x1 - c}M${x0 + c} ${y1}H${x0}V${y1 - c}` }) as SVGPathElement;
      const k = reduced ? 1 : Math.min(1, (wall - cloudShownAt) / 1400);
      if (k < 1) { const len = path.getTotalLength(); path.style.strokeDasharray = `${len}`; path.style.strokeDashoffset = `${len * (1 - (1 - (1 - k) ** 3))}`; moving = true; }
    }

    // Pieces being built.
    const cardNodes: HTMLElement[] = [];
    for (const build of input.builds) {
      const object = objects.get(build.objectId), asset = object && assets.get(object.assetId);
      if (!object || !asset) continue;
      if (build.stage === 'done' && !finished.has(build.objectId)) finished.set(build.objectId, wall);
      const fade = build.stage === 'done' ? 1 - Math.min(1, (wall - finished.get(build.objectId)!) / 900) : 1;
      if (fade <= 0) continue;
      moving = true;
      const g = el('g', { class: `build build-${build.stage}`, opacity: fade.toFixed(2) });
      const full = box(object, asset).map(project);
      if (full.some(p => !p)) continue;
      const corners = full as P[];
      const progress = build.stage === 'queued' ? 0 : build.stage === 'done' ? 1 : Math.min(0.97, Math.max(0.04, (now - build.startedAt) / BUILD_SECONDS));
      if (build.stage === 'queued') {
        el('polygon', { class: 'bp-footprint', points: pts(corners.slice(0, 4)) }, g);
      } else {
        // Hatching rises from the floor with progress, like layers being laid.
        const partial = box(object, asset, progress).map(project) as P[];
        el('polygon', { class: 'bp-fill', points: pts(hull(partial)), fill: 'url(#bp-hatch)' }, g);
        for (const [a, b] of EDGES) el('line', { class: 'bp-edge', x1: corners[a]![0], y1: corners[a]![1], x2: corners[b]![0], y2: corners[b]![1] }, g);
        el('polygon', { class: 'bp-layer', points: pts(partial.slice(4)) }, g);
        if (build.stage === 'checking' || build.stage === 'fixing') {
          const level = build.stage === 'fixing' ? 0.62 : reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 2.6);
          el('polygon', { class: 'bp-scan', points: pts(box(object, asset, level).map(project).slice(4) as P[]) }, g);
          const [w, h, d] = asset.dimensions.map((v, i) => Math.round(v * object.scale[i]! * 100));
          const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const cx = corners.reduce((sum, p) => sum + p[0], 0) / 8, cy = corners.reduce((sum, p) => sum + p[1], 0) / 8;
          for (const [label, at] of [[`${w} cm`, mid(corners[0]!, corners[1]!)], [`${d} cm`, mid(corners[1]!, corners[2]!)], [`${h} cm`, mid(corners[1]!, corners[5]!)]] as [string, P][]) {
            const dx = at[0] - cx, dy = at[1] - cy, l = Math.hypot(dx, dy) || 1;
            el('text', { class: 'bp-dim halo', x: at[0] + dx / l * 22, y: at[1] + dy / l * 22 + 5, 'text-anchor': 'middle' }, g).textContent = label;
          }
          if (build.stage === 'fixing') { const spot = partial[6]!; el('circle', { class: 'bp-fix', cx: spot[0], cy: spot[1], r: 6 + 4 * Math.abs(Math.sin(t * 4)) }, g); }
        }
      }
      // The build card sits above the piece.
      const top = hull(corners).reduce((best, p) => p[1] < best[1] ? p : best);
      const card = document.createElement('div');
      card.className = `build-card build-${build.stage}`;
      card.style.transform = `translate(${top[0].toFixed(0)}px, ${(top[1] - 18).toFixed(0)}px) translate(-50%, -100%)`;
      card.style.opacity = fade.toFixed(2);
      const left = Math.max(0, BUILD_SECONDS * (1 - progress));
      card.innerHTML = `<span class="bubble">${build.key}</span><span class="bc-text"><strong></strong><span>${STAGE_TEXT[build.stage]}</span></span>
        <span class="bc-bar"><i style="width:${(progress * 100).toFixed(1)}%"></i></span><span class="bc-time num">${build.stage === 'done' ? '' : build.stage === 'queued' ? 'next' : `${clock(left)} left`}</span>`;
      card.querySelector('strong')!.textContent = build.name;
      cardNodes.push(card);
    }
    cards.replaceChildren(...cardNodes);
    // Cards that would overlap stack upwards instead.
    const placed: DOMRect[] = [];
    for (const card of cardNodes) {
      let rect = card.getBoundingClientRect(), lift = 0;
      while (placed.some(other => rect.left < other.right + 6 && rect.right > other.left - 6 && rect.top - lift < other.bottom + 6 && rect.bottom - lift > other.top - 6) && lift < 400) lift += 8;
      if (lift) { card.style.transform += ` translateY(${-lift}px)`; rect = card.getBoundingClientRect(); }
      placed.push(rect);
    }

    for (const mark of input.marks) {
      const object = objects.get(mark.objectId), asset = object && assets.get(object.assetId);
      if (!object || !asset || input.builds.some(b => b.objectId === mark.objectId && b.stage !== 'done')) continue;
      const tip = project([object.position[0], asset.dimensions[1] * object.scale[1], object.position[2]]);
      if (!tip) continue;
      const at: P = [tip[0] + 26, tip[1] - 30];
      el('line', { class: 'mark-lead', x1: tip[0], y1: tip[1], x2: at[0], y2: at[1] });
      const bubble = el('g', { class: `mark-bubble${mark.pending ? ' pending' : ''}` });
      el('circle', { cx: at[0], cy: at[1], r: 14 }, bubble);
      el('text', { x: at[0], y: at[1] }, bubble).textContent = String(mark.key);
    }
    return moving && !reduced;
  };
  // Keep drawing while something moves; otherwise redraw only when the camera does.
  const loop = () => { raf = 0; if (draw()) raf = requestAnimationFrame(loop); };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  const stop = viewport.onFrame(() => { if (!raf) draw(); });
  return {
    set(next: MarksInput | null) { input = next; if (!next) finished.clear(); kick(); },
    show(on: boolean) { visible = on; kick(); },
    dispose() { stop(); cancelAnimationFrame(raf); },
  };
}
