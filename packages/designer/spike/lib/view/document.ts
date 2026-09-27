/** Designer scene + draft to the editor document the product renders, and camera poses. Runs inside the daemon. */
import { readFile, writeFile } from 'node:fs/promises';
import type { AssetKind, CatalogAsset, SceneDocument, SceneObject } from '../../../../../apps/editor/src/contracts.js';
import { catalogProduct } from '../../../../../apps/editor/src/adapters/database-catalog.js';
import { demoScene, localCatalog } from '../../../../../apps/editor/src/core/demo.js';
import { catalogItems } from '../../../src/catalog.js';
import { editorKindOf } from '../../../src/editor-bridge.js';
import type { Scene } from '../../../src/scene.js';
import type { CeilingDesign, ComponentHost, FinishMaterial } from '../../../../../apps/editor/src/renovation-contracts.js';
import { materialForPreset } from '../../../../../apps/editor/src/core/finish-presets.js';
import { defaultCeilingDesign, layoutCeilingDesign } from '../../../../../apps/editor/src/core/ceiling-design.js';
import { roomCeilingHeight } from '../../../../../apps/editor/src/core/heights.js';
import { migrateScene } from '../../../../../apps/editor/src/core/renovation.js';
import { validateScene } from '../../../../../apps/editor/src/core/validation.js';
import { wallSurfaceSpans } from '../../../../../apps/editor/src/core/wall-surfaces.js';
import { normalizeWallJunctions } from '../../../../../apps/editor/src/core/wall-junctions.js';
import { headlessSurface, placeFurniture } from '../../../../../apps/editor/src/core/furniture-support.js';
import { mountDecoration, wallDecoration } from '../../../../../apps/editor/src/core/decoration-placement.js';
import { snapRoomFaces } from '../../../src/reconcile-geometry.js';
import { FIXTURE_DEFAULTS, fixtureBottom, material, onFloor, type Draft, type DraftItem } from '../finishes.js';
import { CATALOG_CACHE } from './state.js';

export type { Draft };
/** overview: editor cutaway orbit framed on the room. eye: standing at 1.4 m where the most furniture is in frame (clear
 * of door swings, no door leaf close in frame), aimed at the furniture centroid with a 55 degree lens. eye2: from the far
 * side. top: plan view. Or an explicit pose in designer metres (x, y on the plan, h height; default 1.4 eye / 0.9 target). */
export type ViewCamera = 'overview' | 'eye' | 'eye2' | 'top' | { eye: [number, number, number?]; target: [number, number, number?] };

/** The flat's own editor document (workspace source.json) without its furniture; without one, the Avani demo shell.
 * Room outlines are snapped onto the wall faces as the designer's scene was (editorToDesigner reconciles version 2
 * documents): traced rooms stop 1-3 cm short of the faces, and the editor paints a wall face, and finds the floor
 * under a hung mirror, only where a room polygon reaches that face. */
function editorShell(scene: Scene, source?: unknown): SceneDocument {
  if (source) {
    const doc = structuredClone(source) as SceneDocument, rooms = new Set(doc.rooms.map(room => room.id));
    const missing = scene.rooms.filter(room => !rooms.has(room.id)).map(room => room.id);
    if (missing.length) throw new Error(`source.json has no rooms ${missing.join(', ')}; it is not this scene's editor document`);
    const snapped = doc.version === 2 ? snapRoomFaces({ ...doc, objects: [] }) : undefined;
    for (const warning of snapped?.audit.warnings ?? []) process.stderr.write(`renderView: ${warning}\n`);
    return withSceneSections(scene, snapped?.editor ?? { ...doc, objects: [] });
  }
  const rooms = new Set(demoScene.rooms.map(room => room.id));
  if (!scene.rooms.every(room => rooms.has(room.id))) throw new Error('renderView supports the Avani demo shell only (room ids must match apps/editor demoScene)');
  return withSceneSections(scene, { ...structuredClone(demoScene), objects: [] });
}

/** A scene made from a junction-split document names wall sections (`wall-south:section-…`) that the saved document
 * does not have yet. The editor's own normalization makes the same deterministic section ids; if it cannot split (a
 * mounted component across a junction), accent walls are matched by geometry anyway (accentFaces). */
function withSceneSections(scene: Scene, doc: SceneDocument): SceneDocument {
  const known = new Set(doc.walls.map(wall => wall.id));
  if (scene.walls.every(wall => known.has(wall.source_id ?? wall.id))) return doc;
  try { return normalizeWallJunctions(migrateScene(doc)); } catch (error) {
    process.stderr.write(`renderView: wall sections not split (${error instanceof Error ? error.message : error}); matching walls by geometry\n`);
    return doc;
  }
}

/** One side of an editor wall and how much of it (metres along the wall) looks into each room, by the editor's own
 * wallSurfaceSpans. The editor stores one finish per face, not per span, so a face shared by two rooms (a partition
 * running past a corner into the hall) takes the finish of `owner`, the room it bounds for the longest stretch. */
export interface WallFace { wallId: string; surface: 'wall-front' | 'wall-back'; rooms: Map<string, number>; owner: string }

/** Shorter room contacts (a jamb return, a wall end touching a corner) are not a face of that room. */
const MIN_FACE = 0.05;

export function wallFaces(doc: SceneDocument): WallFace[] {
  const metadata = doc.project?.metadata ?? {}, faces: WallFace[] = [];
  const rooms = doc.rooms.filter(room => metadata[room.id]?.phase !== 'remove');
  for (const wall of doc.walls) {
    if (metadata[wall.id]?.phase === 'remove') continue;
    for (const surface of ['wall-front', 'wall-back'] as const) {
      const cover = new Map<string, number>();
      for (const room of rooms) {
        const length = wallSurfaceSpans(wall, [room], metadata).filter(span => surface === 'wall-front' ? span.front : span.back).reduce((sum, span) => sum + span.end - span.start, 0);
        if (length >= MIN_FACE) cover.set(room.id, length);
      }
      const owner = [...cover].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (owner) faces.push({ wallId: wall.id, surface, rooms: cover, owner });
    }
  }
  return faces;
}

/** The editor wall faces a designer wall segment covers, on the side that looks into the room: every editor wall
 * (junction sections included) lying along the segment's line and overlapping it by more than MIN_FACE. */
export function accentFaces(doc: SceneDocument, faces: WallFace[], designer: Scene['walls'][number] | undefined, roomId: string): WallFace[] {
  if (!designer) return [];
  const ends = [designer.a, designer.b].map(([x, y]) => [x, -y] as const);
  const walls = doc.walls.filter(wall => {
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    if (length < 1e-6) return false;
    const along = ends.map(([x, z]) => ((x - wall.start[0]) * dx + (z - wall.start[1]) * dz) / length);
    const across = ends.map(([x, z]) => Math.abs((x - wall.start[0]) * dz - (z - wall.start[1]) * dx) / length);
    const overlap = Math.min(length, Math.max(...along)) - Math.max(0, Math.min(...along));
    return across.every(value => value <= Math.max(0.03, wall.thickness / 2 + 0.01)) && overlap > MIN_FACE;
  }).map(wall => wall.id);
  // Prefer faces this room owns: a face shared with a neighbour carries one finish, so an accent on it repaints the
  // neighbour's stretch too. Only when the room owns none of them does the explicit accent win anyway.
  const matched = faces.filter(face => walls.includes(face.wallId) && face.rooms.has(roomId)), owned = matched.filter(face => face.owner === roomId);
  return owned.length ? owned : matched;
}

async function loadAssets(skus: string[]): Promise<CatalogAsset[]> {
  let cache: Record<string, CatalogAsset | null> = {};
  try { cache = JSON.parse(await readFile(CATALOG_CACHE, 'utf8')); } catch { /* cold cache */ }
  const known = new Set(localCatalog.map(asset => asset.id));
  const missing = [...new Set(skus)].filter(sku => !known.has(sku) && !(sku in cache));
  if (missing.length) {
    try {
      const records = await catalogItems(missing);
      for (const record of records) { const product = catalogProduct(record); if (product) cache[product.asset.id] = product.asset; }
    } catch (error) { process.stderr.write(`renderView: catalog fetch failed (${String(error)}); using boxes\n`); }
    for (const sku of missing) cache[sku] ??= null;
    await writeFile(CATALOG_CACHE, JSON.stringify(cache));
  }
  return [...localCatalog, ...Object.values(cache).filter((asset): asset is CatalogAsset => asset !== null)];
}

/** Draft/scene items become editor objects; a product without a usable model renders as the editor's procedural piece.
 * Wall-hung items (wall_id) are mounted by the editor's own mountDecoration, so the host, height and position are the
 * ones the editor's placement review recomputes; items with `on` are placed by the editor's own placeFurniture so they
 * carry `restsOn` and sit on the support's top surface. */
export async function editorDocument(scene: Scene, draft: Draft, source?: unknown): Promise<{ scene: SceneDocument; catalog: CatalogAsset[] }> {
  const doc = editorShell(scene, source), items: DraftItem[] = [...scene.items, ...draft.items];
  const catalog = await loadAssets(items.flatMap(item => item.sku ? [item.sku] : []));
  const placed = new Map<string, SceneObject>();
  const assetOf = (item: DraftItem): CatalogAsset => {
    let asset = catalog.find(candidate => candidate.id === (item.sku ?? '') || candidate.id === `spike-box-${item.id}`);
    if (!asset) {
      const [w, d, h] = item.size, kind = editorAssetKind(item.kind) as AssetKind;
      asset = { id: `spike-box-${item.id}`, name: item.name, category: 'Spike', kind, dimensions: [w, h, d], color: item.color ?? '#b8b4ad', price: 0, source: { type: 'procedural' } };
      catalog.push(asset);
    }
    return asset;
  };
  const base = (item: DraftItem): SceneObject => {
    const [w, d, h] = item.size, asset = assetOf(item), [aw, ah, ad] = asset.dimensions;
    return { id: item.id, name: item.name, assetId: asset.id, position: [item.pos[0], 0, -item.pos[1]], rotation: item.rot * Math.PI / 180,
      scale: [w / aw, h / ah, d / ad].map(value => Number.isFinite(value) && value > 0 ? value : 1) as [number, number, number], ...(item.color ? { color: item.color } : {}) };
  };
  for (const item of items.filter(onFloor)) placed.set(item.id, base(item));
  for (const item of items.filter(item => item.wall_id !== undefined)) placed.set(item.id, hang(doc, item, base(item), assetOf(item)));
  // Resting items after their supports; chains resolve over a few passes, the rest fall back to the floor.
  let pending = items.filter(item => item.wall_id === undefined && item.on !== undefined);
  for (let pass = 0; pending.length && pass < 4; pass++) {
    const next: DraftItem[] = [];
    for (const item of pending) {
      if (!placed.has(item.on!) && pending.some(other => other.id === item.on)) { next.push(item); continue; }
      placed.set(item.id, rest({ ...doc, objects: [...placed.values()] }, catalog, item, base(item)));
    }
    pending = next;
  }
  for (const item of pending) placed.set(item.id, base(item));
  const objects = items.map(item => placed.get(item.id)!).filter(Boolean);
  return { scene: applySurfaces({ ...doc, objects }, scene, draft), catalog };
}

const EDITOR_KINDS = new Set<string>(['sofa', 'chair', 'table', 'desk', 'bed', 'cabinet', 'wardrobe', 'dresser', 'lamp', 'plant', 'rug', 'shelf', 'toilet', 'sink', 'bathtub', 'shower', 'fridge', 'stove', 'oven', 'washing_machine', 'dryer', 'dishwasher', 'microwave', 'tv', 'monitor', 'computer', 'laptop', 'speaker', 'printer', 'game_console', 'kitchen_cabinet', 'kitchen_counter', 'kitchen_island', 'radiator', 'fan', 'coat_rack', 'shoe_rack', 'decor', 'wall_art', 'mirror', 'curtain']);
/** The editor asset kind a designer kind becomes when its product has no catalog record. */
export const editorAssetKind = (kind: string): string => EDITOR_KINDS.has(kind) ? kind : editorKindOf[kind] ?? 'cabinet';

/** The editor's own wall mount (nearest room-facing wall face, its standard hanging height). The editor hangs only
 * wall decorations (art, mirrors, curtains, clocks); anything else asked to hang stands on the floor below its spot,
 * as the spike check tells the model. */
function hang(doc: SceneDocument, item: DraftItem, object: SceneObject, asset: CatalogAsset): SceneObject {
  const floor = doc.project?.metadata[item.room_id]?.elevation ?? 0;
  if (!wallDecoration(asset)) {
    process.stderr.write(`renderView: ${item.id} (${asset.kind}) cannot hang on a wall in the editor; stood on the floor\n`);
    return { ...object, position: [object.position[0], floor, object.position[2]] };
  }
  try { return mountDecoration(doc, object, asset); } catch (error) {
    process.stderr.write(`renderView: ${item.id} on ${item.wall_id}: ${error instanceof Error ? error.message : error}; left on the floor\n`);
    return { ...object, position: [object.position[0], floor, object.position[2]] };
  }
}

/** The editor's placeFurniture (restsOn + support top); kinds the editor will not stack still sit on the support's top. */
function rest(doc: SceneDocument, catalog: CatalogAsset[], item: DraftItem, object: SceneObject): SceneObject {
  try { return placeFurniture(doc, catalog, object, item.on); } catch (error) {
    const hit = headlessSurface(doc, catalog, object, item.on);
    process.stderr.write(`renderView: ${item.id} on ${item.on}: ${error instanceof Error ? error.message : error}${hit ? '; drawn on its top without restsOn' : '; left on the floor'}\n`);
    return hit ? { ...object, position: [object.position[0], hit.y, object.position[2]] } : object;
  }
}

/** Finishes, ceiling designs and light fixtures as the editor stores them (project materials/finishes/metadata/components). */
export function applySurfaces(input: SceneDocument, scene: Scene, draft: Draft): SceneDocument {
  if (!draft.finishes?.length && !draft.lighting?.length) return input;
  const doc = migrateScene(input), project = doc.project!;
  const materials = new Map<string, FinishMaterial>();
  const materialId = (presetId: string | undefined, color: string | undefined) => {
    const info = material(presetId), key = `${info?.id ?? 'paint'}|${(color ?? info?.color ?? '').toLowerCase()}`;
    let record = materials.get(key);
    if (!record) {
      record = info ? { ...materialForPreset(info.preset), id: `spike-finish:${key}`, ...(color ? { color } : {}) }
        : { id: `spike-finish:${key}`, name: `Paint ${color}`, color: color!, unit: 'm2', unitCost: 0, thickness: 0.0002, wastePercent: 0, notes: 'Conceptual paint colour; unquoted.' };
      materials.set(key, record);
    }
    return record.id;
  };
  const assign = (entityId: string, surface: 'floor' | 'ceiling' | 'wall-front' | 'wall-back', id: string) => {
    project.finishes = project.finishes.filter(finish => !(finish.entityId === entityId && finish.surface === surface));
    project.finishes.push({ id: `spike:${entityId}:${surface}`, entityId, surface, materialId: id });
  };
  const faces = wallFaces(doc);
  // Room-wide finishes first so a single accent wall overrides its room's walls.
  const order = { floor: 0, ceiling: 0, walls: 1, wall: 2 } as const;
  for (const finish of [...(draft.finishes ?? [])].sort((a, b) => order[a.surface] - order[b.surface])) {
    const id = materialId(finish.material, finish.color);
    if (finish.surface === 'floor' || finish.surface === 'ceiling') { assign(finish.room_id, finish.surface, id); continue; }
    const targets = finish.surface === 'walls' ? faces.filter(face => face.owner === finish.room_id)
      : accentFaces(doc, faces, scene.walls.find(wall => wall.id === finish.wall_id), finish.room_id);
    for (const face of targets) assign(face.wallId, face.surface, id);
  }
  project.materials.push(...materials.values());
  const items = [...scene.items, ...draft.items];
  for (const light of draft.lighting ?? []) {
    const room = doc.rooms.find(candidate => candidate.id === light.room_id);
    if (!room) continue;
    if (light.type === 'ceiling') {
      const design = { ...defaultCeilingDesign(light.style), ...(light.brightness !== undefined ? { brightness: light.brightness } : {}), ...(light.temperature_k !== undefined ? { temperature: light.temperature_k } : {}) };
      fitCeilingDesign(doc, scene, room.id, design);
    } else {
      const defaults = FIXTURE_DEFAULTS[light.mount], size = light.size ?? defaults.size;
      const bottom = fixtureBottom(light, items, roomCeilingHeight(doc, room));
      // Unhosted lights hang from the ceiling on a cord in the editor; a wall light sits on its nearest wall instead.
      const host = light.mount === 'wall' ? wallHost(doc, [light.pos[0], -light.pos[1]], bottom) : undefined;
      project.components.push({ id: light.id, name: light.name ?? `${light.mount} light`, kind: 'light', position: [light.pos[0], bottom, -light.pos[1]],
        ...(host ? { host } : {}), dimensions: size, rotation: 0, color: light.color ?? '#d9d3c7', phase: 'new', roomId: room.id,
        light: { brightness: light.brightness ?? defaults.brightness, temperature: light.temperature_k ?? 2700, enabled: true } });
    }
  }
  return doc;
}

/** The wall whose face is nearest an editor point (x, z), within 0.5 m and tall enough to carry the light, as a component
 * host on the point's side. */
function wallHost(doc: SceneDocument, [x, z]: [number, number], elevation: number): ComponentHost | undefined {
  let best: { host: ComponentHost; gap: number } | undefined;
  for (const wall of doc.walls) {
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    if (length < 1e-6 || wall.height < elevation + 0.3) continue;  // a parapet or railing wall lower than the light
    const along = ((x - wall.start[0]) * dx + (z - wall.start[1]) * dz) / length;
    if (along < 0 || along > length) continue;
    const across = ((x - wall.start[0]) * -dz + (z - wall.start[1]) * dx) / length;
    const gap = Math.abs(across) - wall.thickness / 2;
    if (gap > 0.5 || (best && gap >= best.gap)) continue;
    best = { gap, host: { wallId: wall.id, offset: along, elevation, side: across < 0 ? -1 : 1 } };
  }
  return best?.host;
}

/** The editor refuses a whole document whose ceiling design does not fit its room (a narrow hall, an L-shaped WC), while
 * the designer's check accepts any style anywhere. Degrade instead of failing the picture: a smaller inset first
 * (fewer, tighter spots or a smaller panel), then one flush ceiling light at the roomiest point of the room. */
function fitCeilingDesign(doc: SceneDocument, scene: Scene, roomId: string, design: CeilingDesign): void {
  const project = doc.project!, room = doc.rooms.find(candidate => candidate.id === roomId)!, before = project.metadata[roomId];
  for (const inset of [...new Set([design.inset, 0.35, 0.25, 0.15])].filter(value => value <= design.inset)) {
    project.metadata[roomId] = { ...before, ceilingDesign: { ...design, inset } };
    try { layoutCeilingDesign(doc, room); return; } catch { /* try a smaller inset */ }
  }
  project.metadata[roomId] = { ...before, ceilingDesign: null };
  const polygon = scene.rooms.find(candidate => candidate.id === roomId)?.polygon as [number, number][] | undefined;
  if (!polygon) return;
  const [x, y] = roomiestPoint(polygon), size = FIXTURE_DEFAULTS.ceiling.size;
  process.stderr.write(`renderView: ${design.style} ceiling design does not fit ${roomId}; drawn as one ceiling light\n`);
  project.components.push({ id: `spike-ceiling-${roomId}`, name: `${design.style} ceiling light`, kind: 'light', position: [x, (project.metadata[roomId]?.elevation ?? 0) + roomCeilingHeight(doc, room) - size[2], -y],
    dimensions: size, rotation: 0, color: '#d9d3c7', phase: 'new', roomId,
    light: { brightness: Math.round(FIXTURE_DEFAULTS.ceiling.brightness * design.brightness / 70), temperature: design.temperature, enabled: design.enabled } });
}

/** The point inside a room polygon farthest from its edges (a coarse grid search; rooms are small). */
function roomiestPoint(polygon: [number, number][]): [number, number] {
  const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const edgeDistance = ([px, py]: [number, number]) => Math.min(...polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!, dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t);
  }));
  let best: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2], bestDistance = -1;
  for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
    const point: [number, number] = [minX + (maxX - minX) * i / 24, minY + (maxY - minY) * j / 24];
    if (!inside(polygon, point)) continue;
    const distance = edgeDistance(point);
    if (distance > bestDistance) { bestDistance = distance; best = point; }
  }
  return best;
}

const inside = (polygon: [number, number][], [x, y]: [number, number]) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!, [xj, yj] = polygon[j]!;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/** Still-camera lens: vertical field of view in degrees (about a 28 mm lens on full frame), and eye height in metres. */
export const EYE_FOV = 55, EYE_HEIGHT = 1.4;

/** Eye poses a photographer would pick: standing in a corner or along a wall, clear of every door swing and tall piece,
 * no door within a few metres in frame, aimed at the furniture centroid; ranked by how many items fall in frame. */
/** Wider lens for doorway shots of small rooms (about 22 mm on full frame). */
export const DOORWAY_FOV = 68;
type EyePose = { eye: [number, number, number]; target: [number, number, number]; fov?: number };

/** Poses standing just inside each door of the room, aimed at the farthest point of the room in view from there (down a
 * corridor, across a bathroom to the basin wall). Best door first; a room with one door gets a second aim to the other side. */
function doorwayPoses(scene: Scene, polygon: [number, number][], items: DraftItem[]): EyePose[] {
  const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const points: [number, number][] = [];
  for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16; j++) {
    const point: [number, number] = [minX + (maxX - minX) * (0.03 + 0.94 * i / 16), minY + (maxY - minY) * (0.03 + 0.94 * j / 16)];
    if (inside(polygon, point)) points.push(point);
  }
  // Tall pieces (wardrobes, fridges, shelving) block the line of sight; low ones are seen over.
  const tall = items.filter(item => item.size[2] > 1.2 && item.wall_id === undefined).map(item => {
    const turned = Math.abs(Math.sin(item.rot * Math.PI / 180)) > 0.7;
    return { x: item.pos[0], y: item.pos[1], w: (turned ? item.size[1] : item.size[0]) / 2 + 0.1, d: (turned ? item.size[0] : item.size[1]) / 2 + 0.1 };
  });
  const clear = ([x, y]: [number, number]) => inside(polygon, [x, y]) && !tall.some(box => Math.abs(box.x - x) < box.w && Math.abs(box.y - y) < box.d);
  const visible = (from: [number, number], to: [number, number]) => Array.from({ length: 24 }, (_, i) => (i + 1) / 25).every(t => clear([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]));
  const views = scene.openings.filter(opening => opening.kind === 'door').flatMap(opening => {
    const wall = scene.walls.find(candidate => candidate.id === opening.wall_id);
    if (!wall) return [];
    const dx = wall.b[0] - wall.a[0], dy = wall.b[1] - wall.a[1], length = Math.hypot(dx, dy) || 1, t = (opening.offset + opening.width / 2) / length;
    const at: [number, number] = [wall.a[0] + dx * t, wall.a[1] + dy * t], normal: [number, number] = [-dy / length, dx / length];
    // Past the wall face and the traced room edge, clear of the jambs.
    const step = (wall.thickness ?? 0.1) / 2 + 0.15;
    const side = [1, -1].find(sign => inside(polygon, [at[0] + normal[0] * sign * step, at[1] + normal[1] * sign * step]));
    if (side === undefined) return [];
    const inward: [number, number] = [normal[0] * side, normal[1] * side], eye: [number, number] = [at[0] + inward[0] * step, at[1] + inward[1] * step];
    const seen = points.flatMap(point => {
      const vx = point[0] - eye[0], vy = point[1] - eye[1], distance = Math.hypot(vx, vy);
      if (distance < 0.5) return [];
      const cross = inward[0] * vy - inward[1] * vx, cosine = (inward[0] * vx + inward[1] * vy) / distance;
      return cosine > Math.cos(70 * Math.PI / 180) && visible(eye, point) ? [{ point, distance, heading: Math.atan2(vy, vx) }] : [];
    }).sort((a, b) => b.distance - a.distance);
    if (!seen.length) return [];
    // A second aim 20-50 degrees off the first: another wall of the room, not the jamb beside the lens.
    const best = seen[0]!, turn = (view: { heading: number }) => Math.abs(Math.atan2(Math.sin(view.heading - best.heading), Math.cos(view.heading - best.heading))) * 180 / Math.PI;
    const other = seen.find(view => turn(view) >= 20 && turn(view) <= 50 && view.distance >= 0.6 * best.distance) ?? best;
    return [{ eye, best, other }];
  }).sort((a, b) => b.best.distance - a.best.distance);
  if (!views.length) return [];
  // About 15 degrees down: the floor, the fittings and the far wall, not a close-up of the tiles.
  const pose = (eye: [number, number], target: [number, number]): EyePose => ({ eye: [eye[0], eye[1], 1.5], target: [target[0], target[1], Math.max(0.9, 1.5 - Math.hypot(target[0] - eye[0], target[1] - eye[1]) * 0.27)], fov: DOORWAY_FOV });
  const first = views[0]!, second = views[1];
  return [pose(first.eye, first.best.point), second ? pose(second.eye, second.best.point) : pose(first.eye, first.other.point)];
}

/** The editor document's fixed fittings (sanitary ware, kitchen runs, fitted cupboards) as designer items, so cameras
 * neither stand in a toilet nor stare into a fitted wardrobe; the designer scene does not list them. */
export function fittingItems(doc: SceneDocument): DraftItem[] {
  return (doc.project?.components ?? []).filter(component => component.kind !== 'light' && component.position[1] < 1 && component.phase !== 'remove')
    .map(component => ({ id: component.id, room_id: component.roomId ?? '', kind: component.kind, name: component.name, keep: true,
      pos: [component.position[0], -component.position[2]], rot: component.rotation * 180 / Math.PI,
      size: [component.dimensions[0], component.dimensions[2], component.dimensions[1]] }) as DraftItem);
}

export function cornerPoses(scene: Scene, draft: Draft, roomId: string, fittings: DraftItem[] = []): EyePose[] {
  const polygon = scene.rooms.find(room => room.id === roomId)!.polygon as [number, number][];
  const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]);
  const cx = xs.reduce((a, b) => a + b) / xs.length, cy = ys.reduce((a, b) => a + b) / ys.length;
  const items = [...scene.items, ...draft.items, ...fittings].filter(item => item.room_id === roomId || inside(polygon, item.pos));
  // Furniture centroid, weighted by footprint so a sofa pulls harder than a vase; rugs frame, they do not aim.
  const weighted = items.filter(item => item.kind !== 'rug').map(item => ({ at: item.pos, w: Math.min(3, Math.max(0.05, item.size[0] * item.size[1])) }));
  const total = weighted.reduce((sum, item) => sum + item.w, 0);
  const aim: [number, number] = total > 0 ? [weighted.reduce((sum, item) => sum + item.at[0] * item.w, 0) / total, weighted.reduce((sum, item) => sum + item.at[1] * item.w, 0) / total] : [cx, cy];
  const openings = (kind: 'door' | 'window') => scene.openings.filter(opening => opening.kind === kind).flatMap(opening => {
    const wall = scene.walls.find(candidate => candidate.id === opening.wall_id);
    if (!wall) return [];
    const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) || 1, t = (opening.offset + opening.width / 2) / length;
    return [{ at: [wall.a[0] + (wall.b[0] - wall.a[0]) * t, wall.a[1] + (wall.b[1] - wall.a[1]) * t] as [number, number], reach: opening.width + 0.45, roomId: wall.room_id }];
  });
  const doors = openings('door'), windows = openings('window').filter(window => window.roomId === roomId);
  const blocked = (p: [number, number]) => doors.some(door => Math.hypot(door.at[0] - p[0], door.at[1] - p[1]) < door.reach) || items.some(item => {
    // Nobody stands inside a wardrobe or on a basin: tall pieces keep 25 cm clear, low ones 15 cm (wall-hung ones do not count).
    if (item.kind === 'rug' || (item.size[2] <= 1 && (item as DraftItem).wall_id !== undefined)) return false;
    const margin = item.size[2] > 1 ? 0.25 : 0.15, turned = Math.abs(Math.sin(item.rot * Math.PI / 180)) > 0.7, w = turned ? item.size[1] : item.size[0], d = turned ? item.size[0] : item.size[1];
    return Math.abs(item.pos[0] - p[0]) < w / 2 + margin && Math.abs(item.pos[1] - p[1]) < d / 2 + margin;
  });
  // Horizontal half angle of the still frame (3:2), with a margin for the edges.
  const half = Math.atan(Math.tan(EYE_FOV * Math.PI / 360) * 1.5);
  const bearing = (from: [number, number], to: [number, number], heading: number) => { const a = Math.atan2(to[1] - from[1], to[0] - from[0]) - heading; return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))); };
  const candidates: [number, number][] = [];
  const edges = polygon.map((corner, i) => [corner, polygon[(i + 1) % polygon.length]!] as const);
  for (const corner of polygon) {
    const toward = [cx - corner[0], cy - corner[1]], length = Math.hypot(toward[0]!, toward[1]!) || 1;
    for (const inset of [0.45, 0.8, 1.2, 1.6]) candidates.push([corner[0] + toward[0]! / length * inset * Math.SQRT2, corner[1] + toward[1]! / length * inset * Math.SQRT2]);
  }
  for (const [a, b] of edges) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, normal = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    for (const t of [0.3, 0.5, 0.7]) for (const side of [1, -1]) candidates.push([a[0] + (b[0] - a[0]) * t + normal[0]! * side * 0.5, a[1] + (b[1] - a[1]) * t + normal[1]! * side * 0.5]);
  }
  const poses = candidates.filter(eye => inside(polygon, eye) && !blocked(eye)).map(eye => {
    const heading = Math.atan2(aim[1] - eye[1], aim[0] - eye[0]), far = Math.hypot(aim[0] - eye[0], aim[1] - eye[1]);
    const seen = items.filter(item => bearing(eye, item.pos, heading) < half * 0.9 && Math.hypot(item.pos[0] - eye[0], item.pos[1] - eye[1]) > 0.8).length;
    // A door leaf close to the lens dominates the frame; a door across the room is only background.
    const doorInFrame = doors.some(door => Math.hypot(door.at[0] - eye[0], door.at[1] - eye[1]) < 3 && bearing(eye, door.at, heading) < half + 0.2);
    // Furniture right under the lens (a sofa back filling the lower third) hides the room behind it.
    const close = items.filter(item => item.size[2] > 0.5 && bearing(eye, item.pos, heading) < half && Math.hypot(item.pos[0] - eye[0], item.pos[1] - eye[1]) - Math.max(item.size[0], item.size[1]) / 2 < 1.3).length;
    // A tall piece (floor lamp, plant, shelving) right at the lens fills a third of the frame, even off to the side.
    const hogs = items.filter(item => item.size[2] > 1 && (item as DraftItem).wall_id === undefined && bearing(eye, item.pos, heading) < half + 0.3 && Math.hypot(item.pos[0] - eye[0], item.pos[1] - eye[1]) - Math.max(item.size[0], item.size[1]) / 2 < 1.2).length;
    // A window in frame shows the daylight and the view out, as listing photographs do.
    const windowInFrame = windows.some(window => bearing(eye, window.at, heading) < half * 0.85);
    // Standing in a niche (a kitchen recess, beside a pier) fills the sides of the frame with wall: count the rays across
    // the frame that leave the room within 2 m.
    const walled = Array.from({ length: 9 }, (_, k) => heading + half * (k / 4 - 1)).filter(angle => {
      for (let d = 0.1; d < 2; d += 0.1) if (!inside(polygon, [eye[0] + Math.cos(angle) * d, eye[1] + Math.sin(angle) * d])) return true;
      return false;
    }).length;
    return { eye, far, score: seen + Math.min(far, 5) * 0.6 + (windowInFrame ? 3 : 0) - close * 4 - hogs * 10 - walled * 2 - (doorInFrame ? 100 : 0) - (far < 2 ? 50 : 0) };
  });
  // Too small for a corner shot (no clear standing spot 2 m or more from what it looks at): stand just inside a
  // doorway and look into the room, as a photographer does in a bathroom, a WC or a narrow hall.
  const doorway = () => doorwayPoses(scene, polygon, items);
  if (!poses.some(pose => pose.far >= 1.5)) { const shots = doorway(); if (shots.length) return shots; }
  if (!poses.length) poses.push({ eye: [cx, cy], far: 0, score: 0 });
  poses.sort((a, b) => b.score - a.score);
  const best = poses[0]!;
  // The second angle looks back from the far side of the room, ideally from well away from the first.
  // Only from a spot with some distance to the furniture: a second angle 60 cm from the basin shows only the basin.
  const roomy = poses.filter(pose => pose.far >= 1.5);
  const opposite = roomy.find(pose => Math.hypot(pose.eye[0] - best.eye[0], pose.eye[1] - best.eye[1]) > Math.hypot(aim[0] - best.eye[0], aim[1] - best.eye[1])) ?? roomy.find(pose => Math.hypot(pose.eye[0] - best.eye[0], pose.eye[1] - best.eye[1]) > 1);
  const corner = ({ eye }: { eye: [number, number] }): EyePose => ({ eye: [eye[0], eye[1], EYE_HEIGHT], target: [aim[0], aim[1], 0.9] });
  return [corner(best), opposite ? corner(opposite) : doorway()[0] ?? corner(poses[1] ?? best)];
}

/** The room, the walls that face it, and what stands, hangs or shines inside it; every wall of the result bounds only this
 * room, so the editor's cutaway lowers the ones facing the camera. The full document if the reduced one does not validate. */
/** Horizontal direction from a focused room to the editor's orbit camera (viewport focus()). */
const OVERVIEW_AZIMUTH = [0.95 / Math.hypot(0.95, 1.35), 1.35 / Math.hypot(0.95, 1.35)] as const;

function isolateRoom(doc: SceneDocument, catalog: CatalogAsset[], roomId: string): SceneDocument {
  const room = doc.rooms.find(candidate => candidate.id === roomId), project = doc.project;
  if (!room || !project) return doc;
  const polygon = room.polygon as [number, number][], metadata = project.metadata;
  const within = (x: number, z: number) => inside(polygon, [x, z]);
  // Traced rooms stop a few centimetres short of the wall face, so probe 12 cm beyond each face along the wall. A wall
  // facing the room is trimmed to the room's stretch (plus any opening it cuts through); a wall between the room and the
  // overview camera becomes a 20 cm kerb so the camera looks in, as the editor's cutaway does for exterior walls.
  const trimmed = new Map<string, number>(), stubs = new Set<string>();
  const walls = doc.walls.flatMap(wall => {
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    if (length < 1e-6) return [];
    const ux = dx / length, uz = dz / length, reach = wall.thickness / 2 + 0.12, steps = 40;
    const probe = (t: number, side: number) => within(wall.start[0] + dx * t - uz * side, wall.start[1] + dz * t + ux * side);
    let plus = 0, minus = 0, first = Infinity, last = -Infinity;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = probe(t, reach), b = probe(t, -reach);
      if (a) plus++;
      if (b) minus++;
      if (a || b) { first = Math.min(first, t * length); last = Math.max(last, t * length); }
    }
    if (!plus && !minus) return [];
    const roomSide = plus >= minus ? 1 : -1, outward = [uz * roomSide, -ux * roomSide];
    const facing = outward[0]! * OVERVIEW_AZIMUTH[0] + outward[1]! * OVERVIEW_AZIMUTH[1] > 0.26;
    let from = Math.max(0, first - length / steps - wall.thickness), to = Math.min(length, last + length / steps + wall.thickness);
    for (const opening of wall.openings) if (opening.offset < to && opening.offset + opening.width > from) { from = Math.min(from, opening.offset); to = Math.max(to, opening.offset + opening.width); }
    const at = (offset: number): [number, number] => [wall.start[0] + ux * offset, wall.start[1] + uz * offset];
    if (facing) {
      // A low kerb where the wall stood, broken at its openings, so a wardrobe against it reads as against a wall.
      const cuts = wall.openings.filter(opening => opening.offset < to && opening.offset + opening.width > from).sort((a, b) => a.offset - b.offset);
      const spans: [number, number][] = [];
      let start = from;
      for (const opening of cuts) { if (opening.offset - start > 0.1) spans.push([start, opening.offset]); start = Math.max(start, opening.offset + opening.width); }
      if (to - start > 0.1) spans.push([start, to]);
      return spans.map(([a, b], k) => { stubs.add(`${wall.id}::kerb-${k}`); return { ...wall, id: `${wall.id}::kerb-${k}`, start: at(a), end: at(b), height: 0.2, openings: [] }; });
    }
    trimmed.set(wall.id, from);
    return [{ ...wall, start: at(from), end: at(to), openings: wall.openings.filter(opening => opening.offset >= from - 1e-6 && opening.offset + opening.width <= to + 1e-6).map(opening => ({ ...opening, offset: opening.offset - from })) }];
  });
  const wallIds = new Set(walls.map(wall => wall.id).filter(id => !stubs.has(id)));
  const rehost = <T extends { host?: { wallId: string; offset: number } }>(item: T): T => item.host ? { ...item, host: { ...item.host, offset: item.host.offset - (trimmed.get(item.host.wallId) ?? 0) } } : item;
  let objects = doc.objects.filter(object => (!object.host || wallIds.has(object.host.wallId)) && within(object.position[0], object.position[2])).map(rehost);
  for (let pass = 0; pass < 4; pass++) { const ids = new Set(objects.map(object => object.id)); objects = objects.filter(object => !object.restsOn || ids.has(object.restsOn)); }
  const components = project.components.filter(component => (component.host ? wallIds.has(component.host.wallId) : true)
    && (component.roomId !== undefined ? component.roomId === roomId : within(component.position[0], component.position[2]))).map(rehost);
  const ids = new Set([roomId, ...wallIds, ...walls.flatMap(wall => wall.openings.map(opening => opening.id)), ...objects.map(object => object.id), ...components.map(component => component.id)]);
  const isolated: SceneDocument = { ...doc, rooms: [room], walls, objects, project: { ...project,
    metadata: Object.fromEntries(Object.entries(metadata).filter(([id]) => ids.has(id))),
    components, routes: [], assumptions: [], tasks: [], options: [], activeOptionId: undefined, baseline: undefined,
    finishes: project.finishes.filter(finish => ids.has(finish.entityId)) } };
  const validation = validateScene({ ...isolated, objects: [] }, catalog);
  if (validation.ok) return isolated;
  process.stderr.write(`renderView: overview of ${roomId} shows the whole flat (${validation.errors.slice(0, 3).join(' ')})\n`);
  return doc;
}

const editorPoint = ([x, y, h]: [number, number, number?], fallback: number) => [x, h ?? fallback, -y];


/** Everything the page needs for one picture. */
/** roomId undefined: the whole flat (overview/top or an explicit pose). */
export async function renderPayload(scene: Scene, draft: Draft, roomId: string | undefined, camera: ViewCamera = 'overview', time: 'day' | 'evening' = 'day', source?: unknown) {
  if (roomId !== undefined && !scene.rooms.some(room => room.id === roomId)) throw new Error(`Unknown room ${roomId}`);
  if (roomId === undefined && (camera === 'eye' || camera === 'eye2')) throw new Error('eye cameras need a room');
  const full = await editorDocument(scene, draft, source);
  // A room overview is a dollhouse of that room alone: neighbouring rooms, their partitions and furniture would stand
  // between the orbit camera and a small room (a WC seen over the hall), and the editor only cuts exterior walls.
  const document = roomId !== undefined && camera === 'overview' ? { ...full, scene: isolateRoom(full.scene, full.catalog, roomId) } : full;
  const explicit = typeof camera === 'object' ? camera : roomId !== undefined && (camera === 'eye' || camera === 'eye2') ? cornerPoses(scene, draft, roomId, fittingItems(full.scene))[camera === 'eye' ? 0 : 1] : undefined;
  const pose = explicit ? { position: editorPoint(explicit.eye, EYE_HEIGHT), target: editorPoint(explicit.target, 0.9), fov: ('fov' in explicit && typeof explicit.fov === 'number' ? explicit.fov : EYE_FOV) } : null;
  return { ...document, roomId, pose, time, view: explicit ? 'inside' : camera === 'top' ? 'top' : 'perspective', walls: explicit ? 'full' : 'cutaway' };
}
