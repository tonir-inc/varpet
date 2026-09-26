import type { CatalogAsset, SceneDocument, SceneObject, Vec3 } from '../../../editor/src/contracts';
import type { FinishViewport } from '../../../editor/src/render/viewport';

/** A numbered bubble on a piece in the room, the same number as in the picture and the legend. */
export interface RoomMark { key: number; objectId: string; pending: boolean }
export interface MarksInput { scene: SceneDocument; catalog: CatalogAsset[]; marks: RoomMark[]; changed: string[]; slots: string[] }

type P = [number, number];
const NS = 'http://www.w3.org/2000/svg';

function corners(object: SceneObject, asset: CatalogAsset): Vec3[] {
  const [w, h, d] = asset.dimensions.map((v, i) => v * object.scale[i]!) as Vec3;
  const c = Math.cos(object.rotation), s = Math.sin(object.rotation);
  const out: Vec3[] = [];
  for (const y of [0, h]) for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as P[]) {
    out.push([object.position[0] + dx * c + dz * s, y, object.position[2] - dx * s + dz * c]);
  }
  return out;
}

function hull(points: P[]): P[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P[] = [], upper: P[] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop(); lower.push(p); }
  for (const p of pts.reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A revision cloud: scallops along a polygon, bulging outwards (points clockwise on screen). */
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

/** Draws the designer's marks over the 3D view and keeps them on their pieces as the camera moves. */
export function createRoomMarks(svg: SVGSVGElement, viewport: FinishViewport) {
  let input: MarksInput | null = null, visible = true;
  const draw = () => {
    svg.replaceChildren();
    if (!input || !visible) return;
    const assets = new Map(input.catalog.map(asset => [asset.id, asset]));
    const objects = new Map(input.scene.objects.map(object => [object.id, object]));
    const project = (p: Vec3): P | null => { const r = viewport.project(p); return r && r.visible ? [r.x, r.y] : null; };
    const outline = (object: SceneObject): P[] => { const asset = assets.get(object.assetId); return asset ? corners(object, asset).map(project).filter((p): p is P => Boolean(p)) : []; };
    const el = (name: string, attrs: Record<string, string | number>, parent: Element = svg) => {
      const node = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v)); parent.append(node); return node;
    };
    // The cloud goes round everything the proposal changed.
    const changedPoints = input.changed.flatMap(id => { const object = objects.get(id); return object ? outline(object) : []; });
    const ring = hull(changedPoints);
    if (ring.length >= 3) {
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const grown = ring.map(([x, y]): P => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * 18, y + dy / l * 18]; });
      el('path', { class: 'mark-cloud', d: cloudPath(grown) });
    }
    // Slots still being built get a marching outline on their top face.
    for (const id of input.slots) {
      const object = objects.get(id), top = object ? outline(object).slice(4) : [];
      if (top.length === 4) el('polygon', { class: 'mark-slot', points: top.map(p => p.join(',')).join(' ') });
    }
    for (const mark of input.marks) {
      const object = objects.get(mark.objectId), asset = object && assets.get(object.assetId);
      if (!object || !asset) continue;
      const tip = project([object.position[0], asset.dimensions[1] * object.scale[1], object.position[2]]);
      if (!tip) continue;
      const at: P = [tip[0] + 26, tip[1] - 30];
      el('line', { class: 'mark-lead', x1: tip[0], y1: tip[1], x2: at[0], y2: at[1] });
      const bubble = el('g', { class: `mark-bubble${mark.pending ? ' pending' : ''}` });
      el('circle', { cx: at[0], cy: at[1], r: 14 }, bubble);
      el('text', { x: at[0], y: at[1] }, bubble).textContent = String(mark.key);
    }
  };
  const stop = viewport.onFrame(draw);
  return {
    set(next: MarksInput | null) { input = next; draw(); },
    show(on: boolean) { visible = on; draw(); },
    dispose: stop,
  };
}
