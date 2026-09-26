import type { BuildingComponent, ComponentKind, SceneDocument, ServiceRoute, ServiceSystem, Vec3 } from '../contracts';
import { componentPosition } from './geometry';

export interface PlanLayers { models: boolean; electrical: boolean; water: boolean }
export const defaultPlanLayers: PlanLayers = { models: true, electrical: false, water: false };
export const serviceLabels: Record<ServiceSystem, string> = {
  electrical: 'Electrical', 'water-hot': 'Hot water', 'water-cold': 'Cold water', waste: 'Waste / drainage',
  ventilation: 'Ventilation', heating: 'Heating', gas: 'Gas', data: 'Data / network',
};
export const serviceColors: Record<ServiceSystem, string> = {
  electrical: '#db9b34', 'water-hot': '#d75c50', 'water-cold': '#3b8acc', waste: '#797287',
  ventilation: '#77a69f', heating: '#d98249', gas: '#cec451', data: '#9b7abc',
};
export function visiblePlanRoutes(scene: SceneDocument, layers: PlanLayers): ServiceRoute[] {
  return (scene.project?.routes ?? []).filter(route =>
    (layers.electrical && route.system === 'electrical') ||
    (layers.water && (route.system === 'water-hot' || route.system === 'water-cold' || route.system === 'waste')),
  );
}
const electricalKinds = new Set<ComponentKind>(['light', 'switch', 'outlet', 'panel', 'junction']);
const waterKinds = new Set<ComponentKind>(['sink', 'toilet', 'shower', 'bath', 'drain', 'valve', 'riser']);

/** Fixture symbols remain useful before routing; membership never invents a plumbing connection. */
export function planConnectionPoints(scene: SceneDocument, layers: PlanLayers): Array<{ component: BuildingComponent; position: Vec3; systems: ServiceSystem[] }> {
  const endpointSystems = new Map<string, Set<ServiceSystem>>();
  for (const route of visiblePlanRoutes(scene, layers)) {
    for (const id of [route.from, route.to]) {
      if (id === undefined) continue;
      const systems = endpointSystems.get(id) ?? new Set<ServiceSystem>();
      systems.add(route.system);
      endpointSystems.set(id, systems);
    }
  }
  const seen = new Set<string>();
  return (scene.project?.components ?? []).flatMap(component => {
    if (seen.has(component.id)) return [];
    seen.add(component.id);
    const electricalFixture = layers.electrical && electricalKinds.has(component.kind);
    const waterFixture = layers.water && waterKinds.has(component.kind);
    const systems = new Set<ServiceSystem>(electricalFixture ? ['electrical'] : []);
    for (const system of endpointSystems.get(component.id) ?? []) systems.add(system);
    if (!electricalFixture && !waterFixture && systems.size === 0) return [];
    return [{ component, position: componentPosition(scene, component), systems: [...systems] }];
  });
}
export function routeEndpointLabel(scene: SceneDocument, id?: string): string {
  if (id === undefined) return 'Not connected';
  return scene.project?.components.find(component => component.id === id)?.name ?? 'Missing component';
}
export function routeLength(route: ServiceRoute): number {
  return route.points.reduce((length, point, index) => {
    const previous = route.points[index - 1];
    return previous ? length + Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]) : length;
  }, 0);
}

type ProjectedSegment = [Vec3, Vec3];
const OVERLAP_EPSILON = 1e-8;

function sharedProjectedRun([a, b]: ProjectedSegment, [c, d]: ProjectedSegment): boolean {
  const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
  if (length <= OVERLAP_EPSILON) return false;
  // Both ends must lie on the first segment's infinite line; crossing at one point is not a shared run.
  const distance = (point: Vec3) => Math.abs(dx * (point[2] - a[2]) - dz * (point[0] - a[0])) / length;
  if (distance(c) > OVERLAP_EPSILON || distance(d) > OVERLAP_EPSILON) return false;
  const project = (point: Vec3) => ((point[0] - a[0]) * dx + (point[2] - a[2]) * dz) / length;
  const start = project(c), end = project(d);
  return Math.min(length, Math.max(start, end)) - Math.max(0, Math.min(start, end)) > OVERLAP_EPSILON;
}

/** Nested strokes expose coincident services without moving their recorded physical paths. */
export function planRouteBands(routes: ServiceRoute[]): Array<{ route: ServiceRoute; width: number; overlapping: boolean }> {
  const segments = routes.map(route => route.points.flatMap((point, index): ProjectedSegment[] => {
    const previous = route.points[index - 1];
    return previous && Math.hypot(point[0] - previous[0], point[2] - previous[2]) > OVERLAP_EPSILON ? [[previous, point]] : [];
  }));
  const parents = routes.map((_, index) => index);
  const groupOf = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]!]!;
      index = parents[index]!;
    }
    return index;
  };
  for (let first = 0; first < routes.length; first++) {
    for (let second = first + 1; second < routes.length; second++) {
      if (segments[first]!.some(a => segments[second]!.some(b => sharedProjectedRun(a, b)))) {
        parents[groupOf(second)] = groupOf(first);
      }
    }
  }
  const sizes = new Map<number, number>(), ranks = new Map<number, number>();
  for (let index = 0; index < routes.length; index++) {
    const group = groupOf(index);
    sizes.set(group, (sizes.get(group) ?? 0) + 1);
  }
  return routes.map((route, index) => {
    const group = groupOf(index), rank = ranks.get(group) ?? 0;
    ranks.set(group, rank + 1);
    return { route, width: 2.5 + rank * 3, overlapping: sizes.get(group)! > 1 };
  }).sort((first, second) => second.width - first.width);
}
