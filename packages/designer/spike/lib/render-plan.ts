/** Renders a top-down labelled plan PNG for a scene + draft, for a vision model to judge a layout.
 * World space: metres, x right, y up, rotation CCW degrees, item front is local -y. */
import { writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import type { Scene, Item, Wall, Opening, Vec2, Room } from '../../src/scene.js';
import { finishColor, material, onFloor, physicalWall, type Draft, type DraftItem, type FixtureLight } from './finishes.ts';

const MAX_PX = 1200;
const PAD_M = 0.7;
const ROOM_MARGIN_M = 0.5;

const KIND_COLORS: Record<string, string> = {
  sofa: '#c99b6a', bed: '#8fb2d9', table: '#9ac97e', chair: '#e0a3c4',
  desk: '#d9b36a', wardrobe: '#a68fd9', shelf: '#7ecbc9', rug: '#d9d1a3',
  nightstand: '#e0c48f', dresser: '#c9a37e',
};
const DEFAULT_ITEM_COLOR = '#b0b0b0';

interface Box { minX: number; maxX: number; minY: number; maxY: number }
interface Xform { toPx: (p: Vec2) => Vec2; pxPerM: number; width: number; height: number; box: Box }

function rotCCW(cx: number, cy: number, dx: number, dy: number, rotDeg: number): Vec2 {
  const t = (rotDeg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

function sceneBox(scene: Scene): Box {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const room of scene.rooms) {
    for (const [x, y] of room.polygon) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return { minX, maxX, minY, maxY };
}

function roomBox(room: Room): Box {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of room.polygon) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function makeXform(box: Box, pad: number): Xform {
  const drawMinX = box.minX - pad, drawMaxX = box.maxX + pad;
  const drawMinY = box.minY - pad, drawMaxY = box.maxY + pad;
  const totalW = drawMaxX - drawMinX, totalH = drawMaxY - drawMinY;
  const pxPerM = MAX_PX / Math.max(totalW, totalH);
  const width = totalW * pxPerM, height = totalH * pxPerM;
  const box2: Box = { minX: drawMinX, maxX: drawMaxX, minY: drawMinY, maxY: drawMaxY };
  const toPx = ([x, y]: Vec2): Vec2 => [(x - drawMinX) * pxPerM, (drawMaxY - y) * pxPerM];
  return { toPx, pxPerM, width, height, box: box2 };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function polyPoints(pts: Vec2[]): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function drawGrid(x: Xform): string {
  const parts: string[] = [];
  const { minX, maxX, minY, maxY } = x.box;
  const bottomPx = x.toPx([0, minY])[1];
  const leftPx = x.toPx([minX, 0])[0];
  for (let gx = Math.ceil(minX); gx <= Math.floor(maxX); gx++) {
    const [px1, py1] = x.toPx([gx, minY]);
    const [px2, py2] = x.toPx([gx, maxY]);
    parts.push(`<line x1="${px1.toFixed(1)}" y1="${py1.toFixed(1)}" x2="${px2.toFixed(1)}" y2="${py2.toFixed(1)}" stroke="#dde3e8" stroke-width="1"/>`);
    parts.push(`<text x="${px1.toFixed(1)}" y="${(bottomPx - 4).toFixed(1)}" font-size="11" fill="#6b7680" text-anchor="middle">${gx}</text>`);
  }
  for (let gy = Math.ceil(minY); gy <= Math.floor(maxY); gy++) {
    const [px1, py1] = x.toPx([minX, gy]);
    const [px2, py2] = x.toPx([maxX, gy]);
    parts.push(`<line x1="${px1.toFixed(1)}" y1="${py1.toFixed(1)}" x2="${px2.toFixed(1)}" y2="${py2.toFixed(1)}" stroke="#dde3e8" stroke-width="1"/>`);
    parts.push(`<text x="${(leftPx + 4).toFixed(1)}" y="${(py1 + 4).toFixed(1)}" font-size="11" fill="#6b7680" text-anchor="start">${gy}</text>`);
  }
  return parts.join('\n');
}

function wallSegment(w: Wall): { a: Vec2; b: Vec2; u: Vec2; n: Vec2; len: number; thickness: number } {
  const [ax, ay] = w.a, [bx, by] = w.b;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const u: Vec2 = [dx / len, dy / len];
  const n: Vec2 = [-u[1], u[0]];
  return { a: w.a, b: w.b, u, n, len, thickness: w.thickness ?? 0.1 };
}

function drawWalls(scene: Scene, x: Xform): string {
  const parts: string[] = [];
  for (const w of scene.walls) {
    const { a, u, n, len, thickness } = wallSegment(w);
    const half = thickness / 2;
    const corners = ([
      [a[0] - n[0] * half, a[1] - n[1] * half],
      [a[0] + n[0] * half, a[1] + n[1] * half],
      [a[0] + u[0] * len + n[0] * half, a[1] + u[1] * len + n[1] * half],
      [a[0] + u[0] * len - n[0] * half, a[1] + u[1] * len - n[1] * half],
    ] as Vec2[]).map(x.toPx);
    parts.push(`<polygon points="${polyPoints(corners)}" fill="${w.color ?? '#3a3f44'}" stroke="#22262a" stroke-width="1"/>`);
  }
  return parts.join('\n');
}

function roomCentroid(room: Room): Vec2 {
  let sx = 0, sy = 0;
  for (const [x, y] of room.polygon) { sx += x; sy += y; }
  return [sx / room.polygon.length, sy / room.polygon.length];
}

/** Which side of the wall's normal points into its own room (for default inward door swing). */
function inwardNormal(w: Wall, scene: Scene, n: Vec2, mid: Vec2): Vec2 {
  const room = scene.rooms.find(r => r.id === w.room_id);
  if (!room) return n;
  const c = roomCentroid(room);
  const toCentroid: Vec2 = [c[0] - mid[0], c[1] - mid[1]];
  const dot = toCentroid[0] * n[0] + toCentroid[1] * n[1];
  return dot >= 0 ? n : [-n[0], -n[1]];
}

function drawOpenings(scene: Scene, x: Xform): string {
  const parts: string[] = [];
  for (const o of scene.openings) {
    const wall = scene.walls.find(w => w.id === o.wall_id);
    if (!wall) continue;
    const { a, u, n, thickness } = wallSegment(wall);
    const half = thickness / 2;
    const gapStart: Vec2 = [a[0] + u[0] * o.offset, a[1] + u[1] * o.offset];
    const gapEnd: Vec2 = [a[0] + u[0] * (o.offset + o.width), a[1] + u[1] * (o.offset + o.width)];
    const mid: Vec2 = [(gapStart[0] + gapEnd[0]) / 2, (gapStart[1] + gapEnd[1]) / 2];
    // erase the wall segment at the opening
    const gapCorners = ([
      [gapStart[0] - n[0] * half, gapStart[1] - n[1] * half],
      [gapStart[0] + n[0] * half, gapStart[1] + n[1] * half],
      [gapEnd[0] + n[0] * half, gapEnd[1] + n[1] * half],
      [gapEnd[0] - n[0] * half, gapEnd[1] - n[1] * half],
    ] as Vec2[]).map(x.toPx);
    parts.push(`<polygon points="${polyPoints(gapCorners)}" fill="#ffffff"/>`);

    if (o.kind === 'window') {
      for (const sign of [-1, 1] as const) {
        const off = thickness / 4;
        const p1: Vec2 = [gapStart[0] + n[0] * off * sign, gapStart[1] + n[1] * off * sign];
        const p2: Vec2 = [gapEnd[0] + n[0] * off * sign, gapEnd[1] + n[1] * off * sign];
        const [px1, py1] = x.toPx(p1), [px2, py2] = x.toPx(p2);
        parts.push(`<line x1="${px1.toFixed(1)}" y1="${py1.toFixed(1)}" x2="${px2.toFixed(1)}" y2="${py2.toFixed(1)}" stroke="#8fc7e8" stroke-width="2"/>`);
      }
    } else if (o.kind === 'door') {
      const swing = o.swing ?? 'inward-left';
      const inward = swing.startsWith('inward');
      const hingeAtStart = swing.endsWith('left');
      const nDir = inward ? inwardNormal(wall, scene, n, mid) : [-inwardNormal(wall, scene, n, mid)[0], -inwardNormal(wall, scene, n, mid)[1]] as Vec2;
      const hinge = hingeAtStart ? gapStart : gapEnd;
      const uSign = hingeAtStart ? 1 : -1;
      const closedTip: Vec2 = [hinge[0] + u[0] * o.width * uSign, hinge[1] + u[1] * o.width * uSign];
      const openTip: Vec2 = [hinge[0] + nDir[0] * o.width, hinge[1] + nDir[1] * o.width];
      const [hx, hy] = x.toPx(hinge);
      const [ox, oy] = x.toPx(openTip);
      const [cx, cy] = x.toPx(closedTip);
      const rPx = o.width * x.pxPerM;
      parts.push(`<line x1="${hx.toFixed(1)}" y1="${hy.toFixed(1)}" x2="${ox.toFixed(1)}" y2="${oy.toFixed(1)}" stroke="#3a3f44" stroke-width="1.5" stroke-dasharray="4,3"/>`);
      // Centre the arc on the hinge: in screen space (y down) sweep 1 turns clockwise, which is a positive cross product
      // from the open tip to the closed tip around the hinge. The swing name alone misses walls that run the other way.
      const sweepFlag = (ox - hx) * (cy - hy) - (oy - hy) * (cx - hx) > 0 ? 1 : 0;
      parts.push(`<path d="M ${ox.toFixed(1)} ${oy.toFixed(1)} A ${rPx.toFixed(1)} ${rPx.toFixed(1)} 0 0 ${sweepFlag} ${cx.toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="#3a3f44" stroke-width="1.5" stroke-dasharray="4,3"/>`);
    }
  }
  return parts.join('\n');
}

/** Floors tinted by their finish (light wash so items and labels stay readable). */
function drawRoomFills(scene: Scene, draft: Draft, x: Xform): string {
  const parts: string[] = [];
  for (const room of scene.rooms) {
    const pts = room.polygon.map(x.toPx);
    const floor = (draft.finishes ?? []).find(f => f.room_id === room.id && f.surface === 'floor');
    parts.push(`<polygon points="${polyPoints(pts)}" fill="#fbfbf9" stroke="none"/>`);
    if (floor) parts.push(`<polygon points="${polyPoints(pts)}" fill="${finishColor(floor)}" fill-opacity="0.45" stroke="none"/>`);
  }
  return parts.join('\n');
}

/** Painted wall faces: a coloured band on the room side of each finished wall. */
function drawWallFinishes(scene: Scene, draft: Draft, x: Xform): string {
  const parts: string[] = [];
  const finishes = [...(draft.finishes ?? [])].filter(f => f.surface === 'walls' || f.surface === 'wall').sort((a, b) => (a.surface === 'wall' ? 1 : 0) - (b.surface === 'wall' ? 1 : 0));
  for (const f of finishes) {
    const target = f.surface === 'wall' ? physicalWall(scene, f.wall_id ?? '') : undefined;
    for (const w of scene.walls.filter(w => w.room_id === f.room_id && (!target || (w.source_id ?? w.id) === target))) {
      const { a, u, n, len, thickness } = wallSegment(w);
      const mid: Vec2 = [a[0] + u[0] * len / 2, a[1] + u[1] * len / 2], inn = inwardNormal(w, scene, n, mid);
      const h0 = thickness / 2, h1 = h0 + 0.09;
      const q = ([[a[0] + inn[0] * h0, a[1] + inn[1] * h0], [a[0] + inn[0] * h1, a[1] + inn[1] * h1],
        [a[0] + u[0] * len + inn[0] * h1, a[1] + u[1] * len + inn[1] * h1], [a[0] + u[0] * len + inn[0] * h0, a[1] + u[1] * len + inn[1] * h0]] as Vec2[]).map(x.toPx);
      parts.push(`<polygon points="${polyPoints(q)}" fill="${finishColor(f)}" stroke="#22262a" stroke-width="0.6"/>`);
    }
  }
  return parts.join('\n');
}

/** Light fixtures: warm disc with a cross, id label. */
function drawLights(draft: Draft, x: Xform, roomId?: string): string {
  const parts: string[] = [];
  for (const l of (draft.lighting ?? []).filter((l): l is FixtureLight => l.type === 'fixture' && (!roomId || l.room_id === roomId))) {
    if (!Array.isArray(l.pos)) continue;
    const [cx, cy] = x.toPx(l.pos), r = Math.max(7, 0.14 * x.pxPerM);
    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="#ffd66b" fill-opacity="0.95" stroke="#8a6a12" stroke-width="1.5"/>`);
    parts.push(`<line x1="${(cx - r * 0.7).toFixed(1)}" y1="${(cy - r * 0.7).toFixed(1)}" x2="${(cx + r * 0.7).toFixed(1)}" y2="${(cy + r * 0.7).toFixed(1)}" stroke="#8a6a12" stroke-width="1.2"/>`);
    parts.push(`<line x1="${(cx - r * 0.7).toFixed(1)}" y1="${(cy + r * 0.7).toFixed(1)}" x2="${(cx + r * 0.7).toFixed(1)}" y2="${(cy - r * 0.7).toFixed(1)}" stroke="#8a6a12" stroke-width="1.2"/>`);
    parts.push(`<text x="${cx.toFixed(1)}" y="${(cy - r - 3).toFixed(1)}" font-size="9.5" fill="#6b4f0a" stroke="#ffffff" stroke-width="2" paint-order="stroke" text-anchor="middle">${esc(l.id.slice(0, 14))}</text>`);
  }
  return parts.join('\n');
}

/** Legend rows: swatch + one line per finish and ceiling design. */
function legendRows(draft: Draft, roomId?: string): { color?: string; text: string }[] {
  const rows: { color?: string; text: string }[] = [];
  for (const f of (draft.finishes ?? []).filter(f => !roomId || f.room_id === roomId)) {
    const info = material(f.material);
    rows.push({ color: finishColor(f), text: `${f.room_id} ${f.surface === 'wall' ? `wall ${f.wall_id}` : f.surface}: ${info ? info.preset.name : 'paint'}${f.color ? ` ${f.color}` : ''}` });
  }
  for (const l of (draft.lighting ?? []).filter(l => !roomId || l.room_id === roomId)) {
    rows.push(l.type === 'ceiling' ? { text: `${l.room_id} ceiling light: ${l.style}${l.brightness !== undefined ? ` ${l.brightness}%` : ''}${l.temperature_k ? ` ${l.temperature_k}K` : ''}` }
      : { color: '#ffd66b', text: `${l.id}: ${l.mount} light ${l.brightness ?? ''}${l.brightness ? ' lm' : ''} ${l.temperature_k ?? 2700}K` });
  }
  return rows;
}

/** Room name + dimensions in the room's top-left corner, drawn after items so furniture never hides them. */
function drawRoomLabels(scene: Scene, x: Xform): string {
  const parts: string[] = [];
  for (const room of scene.rooms) {
    const box = roomBox(room);
    const w = (box.maxX - box.minX).toFixed(1);
    const d = (box.maxY - box.minY).toFixed(1);
    const [lx, ly] = x.toPx([box.minX, box.maxY]);
    const tx = lx + 6, ty = ly + 15;
    parts.push(`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="13" font-weight="600" fill="#2a2e33" text-anchor="start">${esc(room.name ?? room.id)}</text>`);
    parts.push(`<text x="${tx.toFixed(1)}" y="${(ty + 14).toFixed(1)}" font-size="11" fill="#6b7680" text-anchor="start">${w}m x ${d}m</text>`);
  }
  return parts.join('\n');
}

/** Opening id (+ width for windows) just inside the room, in small blue/grey text. */
function drawOpeningLabels(scene: Scene, x: Xform): string {
  const parts: string[] = [];
  for (const o of scene.openings) {
    const wall = scene.walls.find(w => w.id === o.wall_id);
    if (!wall) continue;
    const { a, u, n } = wallSegment(wall);
    const gapStart: Vec2 = [a[0] + u[0] * o.offset, a[1] + u[1] * o.offset];
    const gapEnd: Vec2 = [a[0] + u[0] * (o.offset + o.width), a[1] + u[1] * (o.offset + o.width)];
    const mid: Vec2 = [(gapStart[0] + gapEnd[0]) / 2, (gapStart[1] + gapEnd[1]) / 2];
    const inward = inwardNormal(wall, scene, n, mid);
    const labelPos: Vec2 = [mid[0] + inward[0] * 0.35, mid[1] + inward[1] * 0.35];
    const [lx, ly] = x.toPx(labelPos);
    const idLabel = o.id.length > 20 ? `${o.id.slice(0, 19)}…` : o.id;
    const text = o.kind === 'window' ? `${idLabel} ${o.width.toFixed(1)}m` : idLabel;
    const color = o.kind === 'window' ? '#3a7fb0' : '#6b7680';
    parts.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="9.5" fill="${color}" stroke="#ffffff" stroke-width="2" paint-order="stroke" text-anchor="middle">${esc(text)}</text>`);
  }
  return parts.join('\n');
}

function drawItem(item: Item, x: Xform): string {
  const [w, d] = item.size;
  const half: Vec2[] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const worldCorners = half.map(([dx, dy]) => rotCCW(item.pos[0], item.pos[1], dx, dy, item.rot));
  const pxCorners = worldCorners.map(x.toPx);
  const color = KIND_COLORS[item.kind] ?? DEFAULT_ITEM_COLOR;
  const parts: string[] = [];
  parts.push(`<polygon points="${polyPoints(pxCorners)}" fill="${color}" fill-opacity="0.92" stroke="#33363a" stroke-width="1.2"/>`);

  // front arrow: local front is (0,-1); draw from just inside center to just past the front edge.
  const arrowLen = Math.max(d / 2 + Math.min(0.3, d / 4), 0.15);
  const tailWorld = rotCCW(item.pos[0], item.pos[1], 0, -d * 0.1, item.rot);
  const tipWorld = rotCCW(item.pos[0], item.pos[1], 0, -arrowLen, item.rot);
  const [tx, ty] = x.toPx(tailWorld);
  const [hx, hy] = x.toPx(tipWorld);
  const angle = Math.atan2(hy - ty, hx - tx);
  const headLen = 7;
  const leftWing: Vec2 = [hx - headLen * Math.cos(angle - Math.PI / 7), hy - headLen * Math.sin(angle - Math.PI / 7)];
  const rightWing: Vec2 = [hx - headLen * Math.cos(angle + Math.PI / 7), hy - headLen * Math.sin(angle + Math.PI / 7)];
  parts.push(`<line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#111214" stroke-width="2"/>`);
  parts.push(`<polygon points="${hx.toFixed(1)},${hy.toFixed(1)} ${leftWing[0].toFixed(1)},${leftWing[1].toFixed(1)} ${rightWing[0].toFixed(1)},${rightWing[1].toFixed(1)}" fill="#111214"/>`);

  const [cx, cy] = x.toPx(item.pos);
  const label = item.id.slice(0, 14);
  parts.push(`<text x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="10.5" fill="#111214" stroke="#ffffff" stroke-width="2.5" paint-order="stroke" text-anchor="middle">${esc(label)}</text>`);
  return parts.join('\n');
}

const WALL_COLORS: Record<string, string> = { wall_art: '#c0508a', mirror: '#4f9cc4' };

/** Wall-hung item: a thick coloured bar along its wall face, label (id + centre height) just inside the room. */
function drawWallItem(item: DraftItem, x: Xform): string {
  const w = item.size[0];
  const [ax, ay] = x.toPx(rotCCW(item.pos[0], item.pos[1], -w / 2, 0, item.rot));
  const [bx, by] = x.toPx(rotCCW(item.pos[0], item.pos[1], w / 2, 0, item.rot));
  const [lx, ly] = x.toPx(rotCCW(item.pos[0], item.pos[1], 0, -0.28, item.rot));
  const color = WALL_COLORS[item.kind] ?? '#8a6fbf', label = `${item.id.slice(0, 14)}${item.height_m !== undefined ? ` @${item.height_m.toFixed(2)}` : ''}`;
  return `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#22262a" stroke-width="10"/>
<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${color}" stroke-width="7"/>
<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" font-size="10" fill="${color}" stroke="#ffffff" stroke-width="2.5" paint-order="stroke" text-anchor="middle">${esc(label)}</text>`;
}

/** Item resting on another: a small dot on its support, label beside it. */
function drawRestingItem(item: DraftItem, x: Xform): string {
  const [cx, cy] = x.toPx(item.pos), r = Math.max(4, Math.min(item.size[0], item.size[1]) / 2 * x.pxPerM);
  return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="#e07b39" stroke="#5a2e10" stroke-width="1.2"/>
<text x="${(cx + r + 2).toFixed(1)}" y="${(cy - r).toFixed(1)}" font-size="9.5" fill="#5a2e10" stroke="#ffffff" stroke-width="2" paint-order="stroke" text-anchor="start">${esc(item.id.slice(0, 14))}</text>`;
}

/** resvg aborts the whole process (a Rust panic, not a catchable error) on some geometry: a group opacity layer whose
 * content lies entirely off the canvas (every other room's floor in a --room plan), NaN coordinates, arcs of zero radius.
 * Opacity is written per fill/stroke above; this drops any element that still carries a non-finite number, a polygon
 * with fewer than three distinct points, or a zero-radius arc. */
function robustSvg(svg: string): string {
  return svg.split('\n').filter(line => {
    if (/NaN|Infinity/.test(line)) return false;
    const points = /<polygon points="([^"]*)"/.exec(line);
    if (points && new Set(points[1]!.trim().split(/\s+/)).size < 3) return false;
    const arc = /A (\S+) (\S+) /.exec(line);
    if (arc && (Number(arc[1]) <= 0 || Number(arc[2]) <= 0)) return false;
    return true;
  }).join('\n');
}

export async function renderPlan(
  scene: Scene,
  draft: Draft,
  outPng: string,
  opts: { roomId?: string } = {},
): Promise<string> {
  const box = opts.roomId
    ? (() => {
        const room = scene.rooms.find(r => r.id === opts.roomId);
        if (!room) throw new Error(`renderPlan: unknown roomId ${opts.roomId}`);
        return roomBox(room);
      })()
    : sceneBox(scene);
  const pad = opts.roomId ? ROOM_MARGIN_M : PAD_M;
  const xform = makeXform(box, pad);

  const allItems: DraftItem[] = [...scene.items, ...(scene.fixed ?? []), ...draft.items];
  const items = opts.roomId ? allItems.filter(i => i.room_id === opts.roomId) : allItems;

  const rows = legendRows(draft, opts.roomId), legendH = rows.length ? rows.length * 17 + 14 : 0;
  const H = xform.height + legendH;
  const legend = rows.map((r, i) => {
    const y = xform.height + 10 + i * 17;
    return `${r.color ? `<rect x="10" y="${y}" width="22" height="13" fill="${r.color}" stroke="#33363a" stroke-width="0.8"/>` : `<text x="21" y="${y + 11}" font-size="12" text-anchor="middle" fill="#8a6a12">*</text>`}<text x="40" y="${y + 11}" font-size="11.5" fill="#2a2e33">${esc(r.text)}</text>`;
  }).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${xform.width.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${xform.width.toFixed(0)} ${H.toFixed(0)}">
<rect x="0" y="0" width="${xform.width.toFixed(0)}" height="${H.toFixed(0)}" fill="#ffffff"/>
${drawGrid(xform)}
${drawRoomFills(scene, draft, xform)}
${drawWalls(scene, xform)}
${drawWallFinishes(scene, draft, xform)}
${drawOpenings(scene, xform)}
${drawOpeningLabels(scene, xform)}
${items.filter(onFloor).map(i => drawItem(i, xform)).join('\n')}
${items.filter(i => i.wall_id !== undefined).map(i => drawWallItem(i, xform)).join('\n')}
${items.filter(i => i.wall_id === undefined && i.on !== undefined).map(i => drawRestingItem(i, xform)).join('\n')}
${drawLights(draft, xform, opts.roomId)}
${drawRoomLabels(scene, xform)}
${legend}
</svg>`;

  const resvg = new Resvg(robustSvg(svg), { fitTo: { mode: 'width', value: Math.round(xform.width) } });
  const png = resvg.render().asPng();
  await writeFile(outPng, png);
  return outPng;
}
