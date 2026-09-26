import { parseScene } from '../adapter.js';
import { itemPolygon, pointInPolygon } from './space.js';
import type { Item, Scene, Vec2 } from '../scene.js';

export interface DeskDaylightProxy {
  item_id: string; window_id: string | null; distance_m: number | null; side_light_alignment: number | null;
}
export interface StrategyMetrics {
  daylight_for_work: { score: number; desks: DeskDaylightProxy[]; basis: string };
  social_living: { score: number; seating_pairs_within_3m: number; mean_facing_alignment: number; basis: string };
}
const round = (value: number) => Math.round(value * 1e6) / 1e6;
const subtract = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const magnitude = (v: Vec2) => Math.hypot(...v);
const kind = (item: Item) => item.kind.toLowerCase().replace(/[ -]/g, '_');

function closestPoint(point: Vec2, a: Vec2, b: Vec2): Vec2 {
  const edge = subtract(b, a), t = Math.max(0, Math.min(1, dot(subtract(point, a), edge) / dot(edge, edge)));
  return [a[0] + edge[0] * t, a[1] + edge[1] * t];
}

/** Footprint-to-full-window-span distance, including crossings and endpoint contact. */
function windowDistance(item: Item, a: Vec2, b: Vec2): number {
  const polygon = itemPolygon(item);
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return 0;
  let distance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const c = polygon[i]!, d = polygon[(i + 1) % polygon.length]!;
    const ab = subtract(b, a), cd = subtract(d, c), denominator = cross(ab, cd);
    if (Math.abs(denominator) > 1e-10) {
      const t = cross(subtract(c, a), cd) / denominator, u = cross(subtract(c, a), ab) / denominator;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
    }
    distance = Math.min(distance, magnitude(subtract(c, closestPoint(c, a, b))),
      magnitude(subtract(a, closestPoint(a, c, d))), magnitude(subtract(b, closestPoint(b, c, d))));
  }
  return distance;
}

const front = (item: Item): Vec2 => [Math.sin(item.rot * Math.PI / 180), -Math.cos(item.rot * Math.PI / 180)];
const seatingKinds = new Set(['sofa', 'armchair', 'chair', 'loveseat', 'lounge_chair', 'reading_chair', 'dining_chair']);

/** Deterministic, geometry-only strategy proxies. Physical validity is checked separately. */
export function strategyMetrics(input: Scene): StrategyMetrics {
  const scene = parseScene(input), items = [...scene.items, ...scene.fixed];
  const windows = scene.openings.filter(opening => opening.kind === 'window').map(opening => {
    const wall = scene.walls.find(candidate => candidate.id === opening.wall_id)!;
    const delta = subtract(wall.b, wall.a), length = magnitude(delta);
    const at = (offset: number): Vec2 => [wall.a[0] + delta[0] * offset / length, wall.a[1] + delta[1] * offset / length];
    return { id: opening.id, room_id: wall.room_id, a: at(opening.offset), b: at(opening.offset + opening.width) };
  });
  let daylightScore = 0;
  const desks: DeskDaylightProxy[] = items.filter(item => kind(item) === 'desk').map(item => {
    const right: Vec2 = [Math.cos(item.rot * Math.PI / 180), Math.sin(item.rot * Math.PI / 180)];
    const candidates = windows.filter(window => window.room_id === item.room_id).map(window => {
      const distance = windowDistance(item, window.a, window.b), direction = subtract(closestPoint(item.pos, window.a, window.b), item.pos);
      const side = magnitude(direction) > 0 ? Math.min(1, Math.abs(dot(right, direction) / magnitude(direction))) : 0;
      return { window, distance, side, score: side / (1 + distance / 1.5) };
    }).sort((a, b) => b.score - a.score || a.distance - b.distance || a.window.id.localeCompare(b.window.id));
    const best = candidates[0];
    if (!best) return { item_id: item.id, window_id: null, distance_m: null, side_light_alignment: null };
    daylightScore += best.score;
    return { item_id: item.id, window_id: best.window.id, distance_m: round(best.distance), side_light_alignment: round(best.side) };
  });

  const seats = items.filter(item => seatingKinds.has(kind(item)));
  let pairs = 0, closePairs = 0, alignment = 0;
  for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) {
    const a = seats[i]!, b = seats[j]!;
    if (a.room_id !== b.room_id) continue;
    pairs++;
    const delta = subtract(b.pos, a.pos), distance = magnitude(delta);
    if (distance > 3) continue;
    closePairs++;
    if (!distance) continue;
    const direction: Vec2 = [delta[0] / distance, delta[1] / distance];
    alignment += Math.max(0, dot(front(a), direction)) * Math.max(0, -dot(front(b), direction));
  }
  return {
    daylight_for_work: {
      score: round(desks.length ? daylightScore / desks.length : 0), desks,
      basis: 'Geometry proxy in [0,1]: each desk uses its best same-room full window span, side alignment / (1 + footprint distance / 1.5 m), averaged over desks. Alignment is 1 for side light and 0 ahead/behind. Missing windows are unknown (null details, zero contribution); no desks scores 0. Does not measure illuminance, glare, obstruction, or sun hours.',
    },
    social_living: {
      score: round(pairs ? alignment / pairs : 0), seating_pairs_within_3m: closePairs,
      mean_facing_alignment: round(closePairs ? alignment / closePairs : 0),
      basis: 'Geometry proxy in [0,1]: mutual positive facing alignment of seating centres within 3 m, averaged over all same-room seating pairs (distant pairs contribute 0). Work chairs excluded. No pairs scores 0. Does not measure comfort, sight-line obstruction, or conversation quality.',
    },
  };
}
