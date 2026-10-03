import { furnitureDimensions } from './furniture-bounds';
import type { CatalogAsset, SceneDocument, SceneObject } from '../contracts';
import { pointInPolygon } from './validation';
import { hasRoomCeiling, roomCeilingHeight } from './heights';

/** A curtain's top (its rod) sits this far below the ceiling. */
export const CURTAIN_ROD_GAP = 0.03;

const WALL_SHELF_NAME = /\bfloating\b|\bwall[- ]?(mount(ed)?|shelf|shelves|shelving|unit)\b|\b(picture|photo) ledge\b/i;
const WALL_DECOR_NAME = /\b(clock|wall hanging|macram[eé]|tapestry)\b|\bwall[- ]?mount(ed)?\b|\bwall (planter|vase|pocket|basket)s?\b/i;
const SCONCE_NAME = /\bsconces?\b|\bwall[- ](lamp|light)s?\b/i;
const CEILING_LAMP_NAME = /\bceiling (light|lamp)s?\b|\bpendant\b|\bflush[- ]mount(ed)?\b/i;
/** Cooker hoods come from the catalog as wall pieces (kind range_hood -> wall_art); their bottom clears the hob. */
const HOOD_NAME = /\b(cooker|extractor|chimney|range) (\w+ )?hoods?\b/i;
/** A hood's bottom: a 0.9 m worktop plus the 0.65 m hob clearance hood makers ask for. */
export const HOOD_BOTTOM = 1.55;

/** Hung on a wall by mountDecoration: art, mirrors, curtains, clocks and wall hangings (kind wall_art, which the
 * catalog's wall_hanging and clock kinds become), wall shelves and picture ledges, wall planters and vases, sconces. */
export function wallDecoration(asset: CatalogAsset): boolean {
  if (asset.kind === 'wall_art' || asset.kind === 'mirror' || asset.kind === 'curtain') return true;
  const [, height, depth] = asset.dimensions;
  // Catalog wall shelves are kind shelf; a 5 to 15 cm tall, shallow board is a wall shelf even when its name says only "shelf".
  if (asset.kind === 'shelf') return height <= 1.2 && depth <= .4 && (WALL_SHELF_NAME.test(asset.name) || (height <= .15 && depth <= .35));
  if (asset.kind === 'decor' || asset.kind === 'plant') return WALL_DECOR_NAME.test(asset.name);
  if (asset.kind === 'lamp') return SCONCE_NAME.test(asset.name);
  return false;
}

/** A hung shelf or ledge small decor can stand on (restsOn): a wall shelf, not a pre-styled set with its props modelled on it. */
export function wallShelf(asset: CatalogAsset): boolean {
  return wallDecoration(asset) && asset.kind !== 'curtain' && asset.kind !== 'mirror'
    && (asset.kind === 'shelf' || /\b(shelf|shelves|shelving|ledge)\b/i.test(asset.name))
    && !/\bstyled\b|\bpegboard\b|\bwith\b.*\b(books|ceramics|plants|frames|prints|vases?)\b/i.test(asset.name);
}

/** Hanging planters hang from the ceiling; wall, deck and railing planters do not. */
export function hangsFromCeiling(asset: CatalogAsset): boolean {
  // Ceiling and pendant lamps hang from the ceiling like hanging plants; wall and floor lamps do not.
  if (asset.kind === 'lamp') return CEILING_LAMP_NAME.test(asset.name) && !SCONCE_NAME.test(asset.name);
  return (asset.kind === 'plant' || asset.kind === 'decor')
    && (/\bhanging\b/i.test(asset.name) || /(^|:)hanging-/i.test(asset.id))
    && /\b(plant|planter|pot|basket)s?\b/i.test(asset.name)
    && !/\b(wall|deck|rail|railing|balcony|print|art)\b/i.test(asset.name);
}

const activeRoomAt = (scene: SceneDocument, x: number, z: number) =>
  scene.rooms.find(room => scene.project?.metadata[room.id]?.phase !== 'remove' && pointInPolygon([x, z], room.polygon));

/** Top of the item touches the room's ceiling; the footprint centre stays where it was asked. */
export function hangFromCeiling(scene: SceneDocument, object: SceneObject, asset: CatalogAsset): SceneObject {
  const room = activeRoomAt(scene, object.position[0], object.position[2]);
  if (!room) throw new Error('Hang this piece inside a room.');
  if (!hasRoomCeiling(scene, room)) throw new Error('This outdoor space has no ceiling to hang it from.');
  const floor = scene.project?.metadata[room.id]?.elevation ?? 0;
  const y = floor + roomCeilingHeight(scene, room) - furnitureDimensions(object, asset)[1];
  if (!(y >= floor)) throw new Error('This hanging plant is taller than the room.');
  const next: SceneObject = { ...object, position: [object.position[0], y, object.position[2]], hangsFrom: 'ceiling' };
  delete next.host; delete next.restsOn;
  return next;
}

/** A requested hanging height keeps its bottom this far above the floor and its top this far under the ceiling. */
export const HUNG_MIN_BOTTOM = 0.3, HUNG_CEILING_GAP = 0.1;
const HUNG_EPS = 1e-5;

export interface MountOptions {
  /** Requested bottom height (absolute y, like host.elevation). Defaults to the object's current host.elevation, so
   * moves, re-hangs and the placement review keep a chosen height; without either the standard height applies. A
   * height other than the standard is clamped to [floor + 0.3, ceiling - 0.1 - height] and may not cover an opening. */
  elevation?: number;
}

/** Wall tangent and inward normal use the same XZ convention as component hosts. */
export function mountDecoration(scene: SceneDocument, object: SceneObject, asset: CatalogAsset, options: MountOptions = {}): SceneObject {
  if (!asset || !wallDecoration(asset)) return object;
  const curtain = asset.kind === 'curtain';
  const requested = options.elevation ?? object.host?.elevation;
  let custom = false;
  const [width, height, depth] = furnitureDimensions({ ...object, host: { wallId: '', offset: 0, elevation: 0, side: 1 } }, asset);
  let best: SceneObject | undefined, distance = Infinity;
  for (const wall of scene.walls) {
    if (scene.project?.metadata[wall.id]?.phase === 'remove') continue;
    const dx = wall.end[0] - wall.start[0], dz = wall.end[1] - wall.start[1], length = Math.hypot(dx, dz);
    if (length < width!) continue;
    const tx = dx / length, tz = dz / length;
    const along = (object.position[0] - wall.start[0]) * tx + (object.position[2] - wall.start[1]) * tz;
    // A curtain near a window centres on it.
    const window = curtain ? wall.openings.filter(o => o.kind === 'window' && along >= o.offset - width! / 2 && along <= o.offset + o.width + width! / 2)
      .sort((a, b) => Math.abs(a.offset + a.width / 2 - along) - Math.abs(b.offset + b.width / 2 - along))[0] : undefined;
    const offset = Math.max(width! / 2, Math.min(length - width! / 2, window ? window.offset + window.width / 2 : along));
    const x = wall.start[0] + tx * offset, z = wall.start[1] + tz * offset;
    const wallTop = (scene.project?.metadata[wall.id]?.elevation ?? 0) + wall.height;
    for (const side of [1, -1] as const) {
      const nx = -tz * side, nz = tx * side, gap = wall.thickness / 2 + depth! / 2;
      const px = x + nx * gap, pz = z + nz * gap;
      const room = activeRoomAt(scene, x + nx * (gap + .01), z + nz * (gap + .01));
      if (!room) continue;
      const floor = scene.project?.metadata[room.id]?.elevation ?? 0;
      let elevation: number, scale = object.scale, chosen = false;
      if (curtain) {
        // The rod sits just under the ceiling; a curtain longer than the drop is hemmed to reach the floor.
        const ceiling = hasRoomCeiling(scene, room) ? Math.min(wallTop, floor + roomCeilingHeight(scene, room)) : wallTop;
        const rod = ceiling - CURTAIN_ROD_GAP, drop = rod - floor;
        if (drop < .5) continue;
        if (asset.dimensions[1] * scale[1] > drop + 1e-6) scale = [scale[0], drop / asset.dimensions[1], scale[2]];
        if (scale[1] < .1) continue;
        elevation = rod - asset.dimensions[1] * scale[1];
      } else {
        const leans = asset.kind === 'mirror' && asset.dimensions[1] * object.scale[1] > 1.4;
        elevation = floor + (leans ? 0 : HOOD_NAME.test(asset.name) ? HOOD_BOTTOM : Math.max(.9, 1.5 - height! / 2));
        if (!leans && requested !== undefined && Number.isFinite(requested) && Math.abs(requested - elevation) > HUNG_EPS) {
          // A chosen height (gallery walls, art sized over a sofa, a shelf over a desk) stays within safe bounds.
          const ceiling = hasRoomCeiling(scene, room) ? Math.min(wallTop, floor + roomCeilingHeight(scene, room)) : wallTop;
          const low = floor + HUNG_MIN_BOTTOM, high = ceiling - HUNG_CEILING_GAP - height!;
          if (high >= low - HUNG_EPS) { elevation = Math.min(high, Math.max(low, requested)); chosen = true; }
        }
        if (elevation + height! > wallTop + 1e-5) continue;
      }
      const dist = Math.hypot(px - object.position[0], pz - object.position[2]);
      if (dist >= distance) continue;
      distance = dist; custom = chosen;
      best = { ...object, position: [px, elevation, pz], rotation: Math.atan2(nx, nz) || 0, scale, host: { wallId: wall.id, offset, elevation, side } };
    }
  }
  if (!best) throw new Error(curtain ? 'No wall with enough space is available for this curtain.' : 'No wall with enough space is available for this decoration.');
  if (custom) {
    // A chosen height may not put the piece over a door or window of the wall it hangs on.
    const host = best.host!, wall = scene.walls.find(w => w.id === host.wallId)!, base = scene.project?.metadata[wall.id]?.elevation ?? 0;
    const covered = wall.openings.find(o => Math.min(host.offset + width! / 2, o.offset + o.width) - Math.max(host.offset - width! / 2, o.offset) > .01
      && Math.min(host.elevation + height!, base + o.sill + o.height) - Math.max(host.elevation, base + o.sill) > .01);
    if (covered) throw new Error(`This decoration would cover ${covered.kind} “${covered.id}” at that height; hang it higher, lower or further along the wall.`);
  }
  delete best.hangsFrom;
  return best;
}

/**
 * Wall and ceiling edits carry what hangs on them: each wall-mounted or ceiling-hung item is mounted again from
 * where it is. One that no longer fits anywhere stays put, so the placement review reports it.
 */
export function rehangObjects(scene: SceneDocument, catalog: CatalogAsset[]): SceneDocument {
  const assets = new Map(catalog.map(asset => [asset.id, asset]));
  const objects = scene.objects.map(object => {
    const asset = assets.get(object.assetId);
    if (!asset || !(object.hangsFrom || object.host)) return object;
    try { return object.hangsFrom ? hangFromCeiling(scene, object, asset) : wallDecoration(asset) ? mountDecoration(scene, object, asset) : object; }
    catch { return object; }
  });
  return { ...scene, objects };
}
