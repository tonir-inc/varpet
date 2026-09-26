import type { CatalogAsset, Room, SceneDocument, Vec2 } from '../contracts';
import { componentPosition } from '../core/geometry';
import { roomCeilingHeight } from '../core/heights';

export interface DesignerStarter { id: string; label: string; request: string }
export const fallbackStarters: DesignerStarter[] = [
  'Paint the bedroom walls sage', 'Make the living room feel bigger',
  'Where should a desk go for good light?', 'Make it cozier',
].map((label, index) => ({ id: `example:${index}`, label, request: label }));

/** Boundary-inclusive, including concave rooms. Unknown furniture still occupies a room. */
function contains(polygon: Vec2[], [x, z]: Vec2): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[j]!, [bx, bz] = polygon[i]!;
    const cross = (x - ax) * (bz - az) - (z - az) * (bx - ax);
    if (Math.abs(cross) < 1e-7 && x >= Math.min(ax, bx) - 1e-7 && x <= Math.max(ax, bx) + 1e-7
      && z >= Math.min(az, bz) - 1e-7 && z <= Math.max(az, bz) + 1e-7) return true;
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

/** Scene observations only: no requests, edits, prices or inferred compass orientation. */
export function designerStarters(scene: SceneDocument, catalog: CatalogAsset[] = [], northDeg?: number): DesignerStarter[] {
  const metadata = scene.project?.metadata ?? {};
  const retained = (id: string) => metadata[id]?.phase !== 'remove';
  const rooms = scene.rooms.filter(room => retained(room.id) && room.polygon.length >= 3);
  if (!rooms.length) return fallbackStarters.map(item => ({ ...item }));
  const assets = new Map(catalog.map(asset => [asset.id, asset]));
  const heights = new Map(rooms.map(room => [room.id, roomCeilingHeight(scene, room)]));
  const name = (room: Room) => metadata[room.id]?.name?.trim() || room.name;
  const floor = (id: string) => metadata[id]?.elevation ?? 0;
  const belongs = (room: Room, position: [number, number, number]) => Math.abs(position[1] - floor(room.id)) < .1
    && contains(room.polygon, [position[0], position[2]]);
  const builtBelongs = (room: Room, position: [number, number, number]) => position[1] >= floor(room.id) - .1
    && position[1] < floor(room.id) + heights.get(room.id)!
    && contains(room.polygon, [position[0], position[2]]);
  const suggestions: DesignerStarter[] = [];
  const add = (id: string, label: string, request: string) => suggestions.push({ id, label, request });
  for (const room of rooms) {
    const title = name(room);
    const objects = scene.objects.filter(object => retained(object.id) && belongs(room, object.position));
    const built = (scene.project?.components ?? []).filter(component => component.phase !== 'remove' && retained(component.id)
      && ['cabinet', 'worktop', 'appliance', 'sink', 'toilet', 'shower', 'bath'].includes(component.kind)
      && (component.roomId ? component.roomId === room.id : builtBelongs(room, componentPosition(scene, component))));
    if (!objects.length && !built.length && /living|lounge|bedroom|study|office|dining/i.test(title)) {
      add(`empty:${room.id}`, `${title} is empty. Furnish it?`, `Furnish the ${title}.`);
    } else if (/bedroom/i.test(title)) {
      const wardrobe = /wardrobe|closet/i;
      const hasStorage = objects.some(object => assets.get(object.assetId)?.kind === 'wardrobe'
        || wardrobe.test(`${object.name} ${assets.get(object.assetId)?.name ?? ''}`))
        || built.some(component => wardrobe.test(component.name));
      // An unclassified cabinet may already be a wardrobe; do not assert its absence.
      const uncertain = objects.some(object => !assets.has(object.assetId) || assets.get(object.assetId)?.kind === 'cabinet')
        || built.some(component => component.kind === 'cabinet');
      if (!hasStorage && !uncertain) add(`storage:${room.id}`, `No wardrobe is listed in ${title}. Plan storage?`, `Plan wardrobe storage for the ${title}.`);
    }
  }
  for (const wall of scene.walls.filter(wall => retained(wall.id))) {
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    if (!length) continue;
    for (const opening of wall.openings.filter(opening => opening.kind === 'window' && retained(opening.id))) {
      const t = (opening.offset + opening.width / 2) / length;
      const center: Vec2 = [wall.start[0] + dx * t, wall.start[1] + dz * t];
      const normal: Vec2 = [-dz / length, dx / length], distance = wall.thickness / 2 + .1;
      const plus: Vec2 = [center[0] + normal[0] * distance, center[1] + normal[1] * distance];
      const minus: Vec2 = [center[0] - normal[0] * distance, center[1] - normal[1] * distance];
      const sameFloor = rooms.filter(room => Math.abs(floor(room.id) - floor(wall.id)) < .1);
      const a = sameFloor.find(room => contains(room.polygon, plus)), b = sameFloor.find(room => contains(room.polygon, minus));
      if (Boolean(a) === Boolean(b)) continue; // Internal or unassigned window.
      const room = (a ?? b)!;
      if (!/living|lounge|bedroom|study|office/i.test(name(room))) continue;
      const outward = a ? -1 : 1;
      const bearing = (Math.atan2(normal[0] * outward, -normal[1] * outward) * 180 / Math.PI - (northDeg ?? 0) + 720) % 360;
      const knownNorth = northDeg !== undefined && Number.isFinite(northDeg) && northDeg >= 0 && northDeg < 360;
      const boundary = metadata[wall.id]?.boundary;
      const west = knownNorth && boundary !== 'interior' && boundary !== 'shared' && Math.abs(bearing - 270) <= 22.5;
      if (!suggestions.some(item => item.id === `window:${room.id}`)) add(`window:${room.id}`,
        `${west ? 'West-facing windows' : 'A window'} in ${name(room)}. A reading corner there?`,
        `Suggest a reading corner by the window in the ${name(room)}.`);
    }
  }
  const first = name(rooms[0]!);
  if (suggestions.length < 3) add(`palette:${rooms[0]!.id}`, `Explore a warmer palette for ${first}`, `What colours would make the ${first} feel warmer?`);
  if (suggestions.length < 3) add(`routes:${rooms[0]!.id}`, `Make ${first} easier to move around`, `How could we make the ${first} easier to move around?`);
  for (const fallback of fallbackStarters) { if (suggestions.length >= 3) break; suggestions.push({ ...fallback }); }
  return suggestions.slice(0, 4);
}
