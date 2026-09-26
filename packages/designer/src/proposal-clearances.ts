import type { LayoutIssue, LayoutMetrics } from './layout.js';
import type { FunctionClearance } from './metrics/function.js';
import type { Walkway } from './metrics/space.js';

type ClearanceMetrics = Pick<LayoutMetrics, 'function_clearances' | 'space'>;
const EPSILON_M = 1e-6;
const PREFERRED_WALKWAY_M = 0.75;
const metres = (value: number) => `${value.toFixed(3)} m`;
const functionKey = (metric: FunctionClearance) => JSON.stringify([
  metric.item_id, metric.function, metric.side, metric.other_item_id ?? '',
]);
const functionDeficit = (metric: FunctionClearance) => Math.max(metric.deficit_m, metric.excess_m ?? 0);
const walkwayKey = (room: string, path: Walkway) => JSON.stringify([room, ...[path.from, path.to].sort()]);
const walkwayDeficit = (path: Walkway) => path.reachable ? Math.max(0, PREFERRED_WALKWAY_M - path.width_m) : PREFERRED_WALKWAY_M;
const worsened = (before: number, after: number) => after > EPSILON_M && after > before + EPSILON_M;

/** Function-only proposal guard, without recomputing space or sunlight metrics.
 * Unchanged/improved baseline problems and removed metrics are allowed; inputs are untouched. */
export function functionClearanceRegressions(before: readonly FunctionClearance[], after: readonly FunctionClearance[]): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const functions = new Map(before.map(metric => [functionKey(metric), metric]));
  for (const metric of after) {
    const baseline = functions.get(functionKey(metric));
    const deficit = functionDeficit(metric), previous = baseline ? functionDeficit(baseline) : 0;
    if (!worsened(previous, deficit)) continue;
    const preferred = metric.maximum_m === undefined ? `${metres(metric.minimum_m)} minimum`
      : `${metric.minimum_m.toFixed(3)}–${metres(metric.maximum_m)}`;
    issues.push({ check: 'function_clearance', severity: 'hard',
      item_ids: [metric.item_id, ...(metric.other_item_id ? [metric.other_item_id] : [])],
      at: [...metric.at], deficit_m: deficit,
      message: `${metric.item_id} ${metric.function} ${metric.side}${metric.other_item_id ? ` with ${metric.other_item_id}` : ''}: `
        + `${metres(metric.clearance_m)} after vs ${baseline ? `${metres(baseline.clearance_m)} before` : 'a new clearance'}; preferred ${preferred}. `
        + `Reduce the ${metres(deficit)} shortfall/excess to at most ${metres(previous)}.`,
    });
  }
  return issues;
}

/** Full preferred-clearance comparison for observation; callers choose which policy to enforce.
 * Global checkLayout guidance stays soft. */
export function proposalClearanceRegressions(before: ClearanceMetrics, after: ClearanceMetrics): LayoutIssue[] {
  const issues = functionClearanceRegressions(before.function_clearances, after.function_clearances);
  const walkways = new Map(before.space.rooms.flatMap(room => room.walkways.map(path => [walkwayKey(room.room_id, path), path] as const)));
  for (const room of after.space.rooms) for (const path of room.walkways) {
    const baseline = walkways.get(walkwayKey(room.room_id, path));
    const deficit = walkwayDeficit(path), previous = baseline ? walkwayDeficit(baseline) : 0;
    if (!worsened(previous, deficit)) continue;
    const describe = (route: Walkway) => route.reachable ? metres(route.width_m) : 'unreachable';
    issues.push({ check: 'walkway', severity: 'hard', room_id: room.room_id,
      item_ids: [path.from, path.to].filter(id => id.startsWith('item:')).map(id => id.slice(5)),
      at: [...path.narrowest], deficit_m: deficit,
      walkway: { from: path.from, to: path.to, reachable: path.reachable },
      message: `${path.from} to ${path.to} in ${room.room_id}: ${describe(path)} after vs ${baseline ? `${describe(baseline)} before` : 'a new route'}; `
        + `${metres(PREFERRED_WALKWAY_M)} preferred. Reduce the ${metres(deficit)} route deficit to at most ${metres(previous)}.`,
    });
  }
  return issues;
}
