/** Small measurements the designer service needs around a spike turn (run with packages/designer's tsx):
 *   tsx harness/designer_spike_tools.ts metrics <workspace>        -> {rooms:[...], free_before_m2, free_after_m2}
 *   tsx harness/designer_spike_tools.ts snap <editor-document.json> -> {operations:[update-room...]}
 *   tsx harness/designer_spike_tools.ts basket <workspace>         -> {items:[{id, vendor, image?}]}
 * metrics: free floor and the narrowest reachable walkway per room, before (scene.json, the customer's own flat) and
 * after (plus draft.json's floor pieces), from the designer's own space metrics (the ones ./varpet check walks).
 * snap: the room outlines the spike's 3D export snaps onto wall faces (reconcile-geometry snapRoomFaces); the editor
 * hangs wall art and finds the floor under a mirror only where a room polygon reaches the face, so a proposal carries
 * the same snap as polygon-only room updates. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spaceMetrics, type RoomSpaceMetrics } from '../packages/designer/src/metrics/space.ts';
import { snapRoomFaces } from '../packages/designer/src/reconcile-geometry.ts';
import type { Scene } from '../packages/designer/src/scene.ts';
import { onFloor, plainItem, type DraftItem } from '../packages/designer/spike/lib/finishes.ts';
import type { SceneDocument } from '../apps/editor/src/contracts.ts';
import { catalogItems } from '../packages/designer/src/catalog.ts';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export function roomMetrics(scene: Scene, items: DraftItem[]) {
  const ops = items.filter(onFloor).map(item => ({ type: 'add' as const, item: { ...plainItem(item), keep: item.keep ?? false } }));
  const before = spaceMetrics(scene), after = spaceMetrics(scene, ops);
  const touched = new Set(items.map(item => item.room_id));
  const byId = (rooms: RoomSpaceMetrics[]) => new Map(rooms.map(room => [room.room_id, room]));
  const beforeRooms = byId(before.rooms);
  const rooms = after.rooms.map(room => {
    const reachable = room.walkways.filter(path => path.reachable);
    // A route the empty flat already could not walk is the flat's, not the design's.
    const blockedBefore = new Set((beforeRooms.get(room.room_id)?.walkways ?? []).filter(path => !path.reachable).map(path => [path.from, path.to].sort().join('|')));
    const blocked = room.walkways.filter(path => !path.reachable && !blockedBefore.has([path.from, path.to].sort().join('|'))).length;
    const name = scene.rooms.find(entry => entry.id === room.room_id)?.name ?? room.room_id;
    return { id: room.room_id, name, designed: touched.has(room.room_id),
      free_before_m2: round(beforeRooms.get(room.room_id)?.free_area_m2 ?? room.free_area_m2),
      free_after_m2: round(room.free_area_m2),
      narrowest_m: reachable.length ? round(Math.min(...reachable.map(path => path.width_m))) : null,
      blocked };
  });
  return { rooms, free_before_m2: round(before.free_area_m2), free_after_m2: round(after.free_area_m2) };
}

export function snapOperations(doc: SceneDocument) {
  if (doc.version !== 2) return [];
  const snapped = snapRoomFaces({ ...doc, objects: [] }).editor;
  return snapped.rooms.flatMap(room => {
    const original = doc.rooms.find(entry => entry.id === room.id);
    if (!original || JSON.stringify(original.polygon) === JSON.stringify(room.polygon)) return [];
    return [{ type: 'update-room' as const, id: room.id, patch: { polygon: room.polygon } }];
  });
}

/** What the customer buys, per design piece: its shop and a product photo from the catalog (the card groups and
 * prices the pieces itself from the proposal). A catalog outage leaves the photos out, never the pieces. */
export async function basket(items: DraftItem[]) {
  const skus = [...new Set(items.flatMap(item => typeof item.sku === 'string' ? [item.sku] : []))];
  const images = new Map<string, string>();
  try {
    for (const record of await catalogItems(skus) as Record<string, unknown>[]) {
      const url = [record.main_image_url, record.preview_url, record.image].find(value => typeof value === 'string' && /^https?:\/\//.test(value));
      if (typeof record.id === 'string' && typeof url === 'string') images.set(record.id, url);
    }
  } catch { /* photos are optional */ }
  return { items: items.map(item => ({ id: item.id, vendor: typeof item.vendor === 'string' && item.vendor ? item.vendor : undefined,
    ...(typeof item.sku === 'string' && images.has(item.sku) ? { image: images.get(item.sku) } : {}) })) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const [command, path] = process.argv.slice(2);
  if (command === 'metrics' && path) {
    const scene = json(join(path, 'scene.json')) as Scene, draft = json(join(path, 'draft.json')) as { items?: DraftItem[] };
    scene.items ??= []; scene.fixed ??= []; scene.openings ??= [];
    console.log(JSON.stringify(roomMetrics(scene, draft.items ?? [])));
  } else if (command === 'basket' && path) {
    const draft = json(join(path, 'draft.json')) as { items?: DraftItem[] };
    console.log(JSON.stringify(await basket(draft.items ?? [])));
  } else if (command === 'snap' && path) {
    console.log(JSON.stringify({ operations: snapOperations(json(path) as SceneDocument) }));
  } else {
    console.error('usage: designer_spike_tools.ts metrics <workspace> | snap <editor-document.json>');
    process.exit(2);
  }
}
