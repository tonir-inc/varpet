/** Metres in the plan plane: x right, y up. Rotation is counterclockwise;
 * item front is local -y. north_deg is clockwise from plan-up to true north.
 * This temporary model is isolated from the engine by adapter.ts. */
export type Vec2 = [number, number];
/** zone is present only for outdoor spaces (editor project metadata); interior rooms omit it. */
export interface Room { id: string; name?: string; polygon: Vec2[]; zone?: 'balcony' | 'loggia' | 'terrace' }
export interface Wall { id: string; room_id: string; a: Vec2; b: Vec2; open?: boolean; color?: string; source_id?: string; keep?: boolean; thickness?: number; height?: number }
export interface Opening {
  id: string; wall_id: string; kind: 'door' | 'window' | 'passage';
  offset: number; width: number; height: number; sill: number;
  room_ids?: string[];
  swing?: 'inward-left' | 'inward-right' | 'outward-left' | 'outward-right' | 'none';
}
export interface Item {
  id: string; room_id: string; kind: string; name: string; pos: Vec2;
  rot: number; size: [number, number, number]; keep: boolean;
  /** Immutable physical structure; room_id is descriptive, collision is global. */
  structure?: { wall_id: string; bottom_m: number };
  sku?: string; price?: number; vendor?: string; color?: string; group_id?: string;
  /** Supporting furniture's item ID (editor `restsOn`): the item stands on that piece's top, not on the floor. */
  on?: string;
  /** Hung on a wall (editor `host`: wall art, curtains) or from the ceiling (editor `hangsFrom`): no floor footprint. */
  mount?: 'wall' | 'ceiling';
  /** Made-to-measure pieces (catalog `materialSlots`): the roles whose finish can be restyled (fronts, handles, worktop...). */
  material_slots?: string[];
  /** Current colour per restyled role (editor object `materials`); a role not listed shows the model's own finish. */
  materials?: Record<string, string>;
}
/** Only items standing on the floor occupy floor space; supported and mounted items do not. */
export const onFloor = (item: Pick<Item, 'on' | 'mount'>) => item.on === undefined && item.mount === undefined;
export interface Scene {
  rooms: Room[]; walls: Wall[]; openings: Opening[]; items: Item[]; fixed: Item[];
  north_deg?: number;
  geometry_audit?: import("./reconcile-geometry.js").GeometryAudit;
}
/** Move `on`: a support ID rests the item there, null detaches it to the floor, omitted keeps its current support. */
export type Op = { type: 'move'; id: string; pos: Vec2; rot?: number; room_id?: string; on?: string | null }
  | { type: 'add'; item: Item } | { type: 'remove'; id: string }
  | { type: 'color'; target: 'item' | 'wall'; id: string; color: string };
