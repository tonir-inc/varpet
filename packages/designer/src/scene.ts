/** Metres in the plan plane: x right, y up. Rotation is counterclockwise;
 * item front is local -y. north_deg is clockwise from plan-up to true north.
 * This temporary model is isolated from the engine by adapter.ts. */
export type Vec2 = [number, number];
export interface Room { id: string; name?: string; polygon: Vec2[] }
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
}
export interface Scene {
  rooms: Room[]; walls: Wall[]; openings: Opening[]; items: Item[]; fixed: Item[];
  north_deg?: number;
  geometry_audit?: import("./reconcile-geometry.js").GeometryAudit;
}
export type Op = { type: 'move'; id: string; pos: Vec2; rot?: number; room_id?: string }
  | { type: 'add'; item: Item } | { type: 'remove'; id: string }
  | { type: 'color'; target: 'item' | 'wall'; id: string; color: string };
