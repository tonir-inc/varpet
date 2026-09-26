import type { BuildingComponent, ComponentKind, SceneDocument, ServiceRoute, ServiceSystem, Vec3 } from '../contracts';
import { defaultPlanLayers, planConnectionPoints, planRouteBands, routeEndpointLabel, routeLength, serviceColors, serviceLabels, visiblePlanRoutes } from './plan-layers';

let assertions = 0;
function assert(condition: unknown, message: string): asserts condition {
  assertions++;
  if (!condition) throw new Error(`Plan layers check failed: ${message}`);
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-8;
const component = (id: string, kind: ComponentKind): BuildingComponent => ({
  id, name: `Recorded ${id}`, kind, position: [8, 1, 9], dimensions: [0.2, 0.2, 0.1], rotation: 0, color: '#ffffff', phase: 'existing',
});
const route = (id: string, system: ServiceSystem, from?: string, to?: string): ServiceRoute => ({
  id, name: `Recorded ${id}`, system, points: [[0, 0, 0], [3, 4, 0], [3, 4, 12]], diameter: 0.01, phase: 'existing', from, to,
});
const legacy: SceneDocument = {
  format: 'varpet.editor', version: 1, id: 'plan-layers', name: 'Plan layers', units: 'm', upAxis: 'Y', rooms: [], objects: [],
  walls: [{ id: 'host', start: [1, 2], end: [5, 2], thickness: 0.2, height: 3, color: '#ffffff', openings: [] }],
};
const all = { models: false, electrical: true, water: true };
const electrical = { models: false, electrical: true, water: false };
const water = { models: false, electrical: false, water: true };
assert(equal(defaultPlanLayers, { models: true, electrical: false, water: false }), 'initial plan preserves model visibility and keeps services opt-in');
assert(equal(visiblePlanRoutes(legacy, all), []) && equal(planConnectionPoints(legacy, all), []), 'v1 scenes without a project have no service content');
assert(routeEndpointLabel(legacy) === 'Not connected', 'absent endpoint is explicitly disconnected');
assert(routeEndpointLabel(legacy, 'unknown') === 'Missing component', 'dangling endpoint is identified even without a project');

const scene: SceneDocument = {
  ...structuredClone(legacy), version: 2,
  project: {
    mode: 'correct', currency: 'USD', metadata: {}, components: [], routes: [], sources: [], assumptions: [], materials: [], finishes: [], tasks: [], options: [],
  },
};
const project = scene.project!;
const electricalKinds: ComponentKind[] = ['light', 'switch', 'outlet', 'panel', 'junction'];
const waterKinds: ComponentKind[] = ['sink', 'toilet', 'shower', 'bath', 'drain', 'valve', 'riser'];
project.components.push(...electricalKinds.map(kind => component(kind, kind)), ...waterKinds.map(kind => component(kind, kind)), component('appliance', 'appliance'), component('column', 'column'));
project.components.find(item => item.id === 'switch')!.control = { type: 'single', targets: ['light'], gangs: 1 };
project.components.find(item => item.id === 'outlet')!.host = { wallId: 'host', offset: 2, elevation: 1.2, side: -1 };
project.components.find(item => item.id === 'riser')!.host = { wallId: 'missing-host', offset: 2, elevation: 1.2, side: 1 };
const withoutRoutes = JSON.stringify(scene);
assert(equal(visiblePlanRoutes(scene, all), []), 'logical switch control targets never synthesize cable routes');
assert(equal(planConnectionPoints(scene, defaultPlanLayers), []), 'hidden services have no connection symbols');
assert(equal(planConnectionPoints(scene, electrical).map(point => point.component.id), electricalKinds), 'electrical symbols include every relevant fixture with no routes');
assert(equal(planConnectionPoints(scene, water).map(point => point.component.id), waterKinds), 'water symbols include every relevant fixture with no routes');
assert(planConnectionPoints(scene, electrical).every(point => equal(point.systems, ['electrical'])), 'electrical fixture membership is explicit');
assert(planConnectionPoints(scene, water).every(point => equal(point.systems, [])), 'unconnected plumbing fixtures do not claim hot, cold or waste connections');
const outlet = planConnectionPoints(scene, electrical).find(point => point.component.id === 'outlet')!;
assert(near(outlet.position[0], 3) && near(outlet.position[1], 1.2) && near(outlet.position[2], 1.85), 'hosted symbols use wall offset, elevation and side rather than stale component position');
assert(equal(planConnectionPoints(scene, water).find(point => point.component.id === 'riser')!.position, [8, 1, 9]), 'orphaned hosted fixture falls back to its recorded position');
outlet.position[0] = 999;
assert(JSON.stringify(scene) === withoutRoutes, 'symbol positions are detached and queries do not change the scene');

project.routes.push(
  route('cable', 'electrical', 'panel', 'appliance'),
  { ...route('removed-cable', 'electrical', 'switch', 'appliance'), phase: 'remove' },
  route('hot', 'water-hot', 'valve', 'sink'),
  route('cold', 'water-cold', 'riser', 'sink'),
  route('drainage', 'waste', 'sink', 'appliance'),
  route('duplicate-cold', 'water-cold', 'riser', 'sink'),
  route('unbound', 'electrical'),
  route('dangling', 'water-cold', 'missing-component', 'column'),
  route('ventilation', 'ventilation', 'column'),
  route('heating', 'heating', 'column'),
  route('gas', 'gas', 'column'),
  route('data', 'data', 'column'),
);
const source = JSON.stringify(scene);
assert(equal(visiblePlanRoutes(scene, defaultPlanLayers), []), 'initial service toggles hide all routes');
assert(equal(visiblePlanRoutes(scene, electrical).map(item => item.id), ['cable', 'removed-cable', 'unbound']), 'electrical layer includes only recorded electrical routes and preserves removal phase');
assert(equal(visiblePlanRoutes(scene, water).map(item => item.id), ['hot', 'cold', 'drainage', 'duplicate-cold', 'dangling']), 'water layer includes hot, cold and waste routes only');
assert(visiblePlanRoutes(scene, all).length === 8, 'independent service toggles combine visible systems');
assert(equal(visiblePlanRoutes(scene, all), visiblePlanRoutes(scene, { ...all, models: true })), 'model visibility does not affect route selection');
assert(equal(planConnectionPoints(scene, all), planConnectionPoints(scene, { ...all, models: true })), 'model visibility does not affect connection symbols');
const electricalPoints = planConnectionPoints(scene, electrical);
assert(equal(electricalPoints.map(point => point.component.id), [...electricalKinds, 'appliance']), 'arbitrary component kinds appear when endpoints of visible electrical routes');
assert(equal(electricalPoints.find(point => point.component.id === 'appliance')!.systems, ['electrical']), 'shared endpoint has one electrical membership despite multiple routes');
const waterPoints = planConnectionPoints(scene, water);
assert(equal(waterPoints.map(point => point.component.id), [...waterKinds, 'appliance', 'column']), 'plumbing symbols union fixture kinds with real endpoint components');
assert(equal(waterPoints.find(point => point.component.id === 'sink')!.systems, ['water-hot', 'water-cold', 'waste']), 'sink memberships come from distinct visible recorded routes');
assert(!waterPoints.some(point => point.component.id === 'missing-component'), 'dangling references cannot create made-up fixtures');
assert(equal(planConnectionPoints(scene, all).find(point => point.component.id === 'appliance')!.systems, ['electrical', 'waste']), 'component shared by cable and drain appears once with both memberships');
assert(new Set(planConnectionPoints(scene, all).map(point => point.component.id)).size === planConnectionPoints(scene, all).length, 'connection points have unique component ids');
assert(routeEndpointLabel(scene, 'sink') === 'Recorded sink', 'endpoint labels resolve recorded component names');
assert(routeEndpointLabel(scene, 'missing-component') === 'Missing component', 'dangling route references have a clear label');
assert(routeLength(project.routes[0]!) === 17, 'route length sums real three-dimensional segments');
assert(routeLength({ ...project.routes[0]!, points: [[2, 1, 3], [2, 5, 3]] }) === 4, 'vertical risers retain their full length in a plan');
assert(routeLength({ ...project.routes[0]!, points: [] }) === 0 && routeLength({ ...project.routes[0]!, points: [[1, 2, 3]] }) === 0, 'empty and point routes have zero length');
for (const system of ['electrical', 'water-hot', 'water-cold', 'waste', 'ventilation', 'heating', 'gas', 'data'] as ServiceSystem[]) {
  assert(!!serviceLabels[system] && /^#[a-f\d]{6}$/i.test(serviceColors[system]), `${system} has a human label and a usable color`);
}
assert(new Set(['electrical', 'water-hot', 'water-cold', 'waste'].map(system => serviceColors[system as ServiceSystem])).size === 4, 'visible service types have distinct colors');
assert(JSON.stringify(scene) === source, 'all layer, endpoint and length queries leave the source scene unchanged');

const path = (id: string, points: Vec3[]): ServiceRoute => ({ ...route(id, 'water-cold'), points });
const bands = (routes: ServiceRoute[]) => planRouteBands(routes).map(band => [band.route.id, band.width, band.overlapping]);
assert(equal(planRouteBands([]), []), 'an empty route layer has no color bands');
const solo = path('solo', [[0, 0, 0], [3, 0, 0]]);
assert(equal(bands([solo]), [['solo', 2.5, false]]), 'a solitary route keeps the normal stroke and hit area');
const coincident = [
  solo,
  path('reversed-hot', [[3, 1, 0], [0, 1, 0]]),
  path('drain-under-floor', [[0, -0.5, 0], [3, -0.5, 0]]),
];
const coincidentSource = JSON.stringify(coincident);
assert(equal(bands(coincident), [['drain-under-floor', 8.5, true], ['reversed-hot', 5.5, true], ['solo', 2.5, true]]), 'coincident projected paths at any height receive distinct nested bands ordered widest first');
assert(planRouteBands(coincident).every(band => coincident.includes(band.route)), 'band metadata preserves each original route identity');
assert(equal(bands(coincident), bands(coincident)), 'band ordering is deterministic');
assert(JSON.stringify(coincident) === coincidentSource, 'band calculation never sorts or changes the source routes');

const chain = [
  path('left-run', [[0, 0, 0], [3, 0, 0]]),
  path('middle-run', [[2, 1, 0], [5, 1, 0]]),
  path('right-run', [[4, 2, 0], [7, 2, 0]]),
];
assert(equal(bands(chain), [['right-run', 8.5, true], ['middle-run', 5.5, true], ['left-run', 2.5, true]]), 'partial overlap creates one connected band group even when outer runs do not touch');
const angled = [
  path('segmented-diagonal', [[0, 0, 0], [1, 0, 1], [5, 0, 5]]),
  path('partial-diagonal', [[6, 2, 6], [3, 2, 3]]),
  path('diagonal-point-touch', [[6, 4, 6], [7, 4, 7]]),
];
assert(equal(bands(angled), [['partial-diagonal', 5.5, true], ['segmented-diagonal', 2.5, true], ['diagonal-point-touch', 2.5, false]]), 'overlap detection handles diagonal segments, reversed partial runs and different polyline breakpoints');
const independent = [
  path('base', [[0, 0, 0], [2, 0, 0]]),
  path('crossing', [[1, 1, -1], [1, 1, 1]]),
  path('point-touch', [[2, 1, 0], [3, 1, 0]]),
  path('parallel', [[0, 0, 0.1], [2, 0, 0.1]]),
  path('vertical', [[1, 0, 0], [1, 3, 0]]),
  path('empty', []),
  path('single-point', [[1, 0, 0]]),
  path('repeated-point', [[1, 0, 0], [1, 0, 0]]),
];
assert(planRouteBands(independent).every(band => band.width === 2.5 && !band.overlapping), 'crossings, endpoint touches, parallel runs and zero projected length do not create shared bands');
const groups = [
  path('first-a', [[0, 0, 0], [2, 0, 0]]),
  path('first-b', [[1, 1, 0], [2, 1, 0]]),
  path('second-a', [[0, 0, 3], [2, 0, 3]]),
  path('second-b', [[1, 1, 3], [2, 1, 3]]),
];
assert(equal(bands(groups), [['first-b', 5.5, true], ['second-b', 5.5, true], ['first-a', 2.5, true], ['second-a', 2.5, true]]), 'independent overlap groups reuse widths and preserve stable ordering for ties');

console.log(`Plan layers checks passed (${assertions} assertions).`);
