import type { BuildingComponent, CatalogAsset, EntityMetadata, Operation, ProjectAnalysis, RenovationOperation, RenovationProject, RenovationSnapshot, SceneDocument, Vec2, Vec3, Wall } from '../contracts';

import { componentPosition, componentRotation, polygonArea, wallLength } from './geometry';
import { placementIssues } from './validation';
export { componentPosition, componentRotation, polygonArea, wallLength } from './geometry';

const EPS = 1e-5;
const same = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS;
const signedArea = (points: Vec2[]) => points.reduce((area, a, i) => { const b = points[(i + 1) % points.length]!; return area + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
function segmentPosition(point: Vec2, start: Vec2, end: Vec2): number | null {
  const dx = end[0] - start[0], dz = end[1] - start[1], lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < EPS * EPS) return null;
  const t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared;
  if (t < -EPS || t > 1 + EPS || Math.abs((point[0] - start[0]) * dz - (point[1] - start[1]) * dx) > EPS * Math.sqrt(lengthSquared)) return null;
  return t;
}

export function emptyProject(): RenovationProject {
  return { mode: 'correct', currency: 'USD', metadata: {}, components: [], routes: [], sources: [], assumptions: [], materials: [], finishes: [], tasks: [], options: [] };
}
/** Migration adds explicit unknown classifications. It never promotes old geometry to measured evidence. */
export function migrateScene(scene: SceneDocument): SceneDocument {
  const result = structuredClone(scene);
  if (result.version === 2 && result.project) return result;
  result.version = 2;
  result.project = emptyProject();
  for (const wall of result.walls) result.project.metadata[wall.id] = { structuralRole: 'unknown', phase: 'existing', review: 'unreviewed' };
  for (const room of result.rooms) result.project.metadata[room.id] = { zone: 'interior', phase: 'existing' };
  return result;
}
export function projectSnapshot(scene: SceneDocument): RenovationSnapshot {
  const project = scene.project ?? emptyProject();
  return structuredClone({ rooms: scene.rooms, walls: scene.walls, objects: scene.objects, metadata: project.metadata, components: project.components, routes: project.routes, finishes: project.finishes });
}
function restoreSnapshot(scene: SceneDocument, snapshot: RenovationSnapshot): void {
  const copy = structuredClone(snapshot);
  scene.rooms = copy.rooms; scene.walls = copy.walls; scene.objects = copy.objects;
  Object.assign(scene.project!, { metadata: copy.metadata, components: copy.components, routes: copy.routes, finishes: copy.finishes });
}
function saveActive(scene: SceneDocument): void {
  const option = scene.project!.options.find(o => o.id === scene.project!.activeOptionId);
  if (option) option.snapshot = projectSnapshot(scene);
}
const find = <T extends { id: string }>(list: T[], id: string, what: string): T => {
  const item = list.find(x => x.id === id); if (!item) throw new Error(`${what} “${id}” does not exist.`); return item;
};
const upsert = <T extends { id: string }>(list: T[], item: T): void => { const i = list.findIndex(x => x.id === item.id); if (i < 0) list.push(item); else list[i] = item; };
const remove = <T extends { id: string }>(list: T[], id: string, what: string): void => { const i = list.indexOf(find(list, id, what)); list.splice(i, 1); };
export function invalidateAssumptions(scene: SceneDocument, ids: string[]): void {
  if (!scene.project) return;
  const affected = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const assumption of scene.project!.assumptions) if (!affected.has(assumption.id) && (affected.has(assumption.entityId) || assumption.dependsOn?.some(id => affected.has(id)) || assumption.sourceIds.some(id => affected.has(id)))) { assumption.status = 'stale'; affected.add(assumption.id); changed = true; }
  }
}
function ensureEditable(scene: SceneDocument, id: string): void {
  if (scene.project!.metadata[id]?.locked) throw new Error(`“${id}” is locked. Unlock it in its properties before changing geometry.`);
}
function alteration(scene: SceneDocument, id: string): void {
  ensureEditable(scene, id);
  if (scene.project!.mode === 'renovate') {
    const metadata = scene.project!.metadata[id] ??= {};
    metadata.review = 'required';
    metadata.phase = metadata.phase === 'new' ? 'new' : 'replace';
  }
  invalidateAssumptions(scene, [id]);
}
function removeMetadata(scene: SceneDocument, ids: string[]): void {
  for (const id of ids) delete scene.project!.metadata[id];
}
function dependentGeometry(scene: SceneDocument): Map<string, string> {
  const project = scene.project!;
  return new Map([
    ...project.components.map(component => [component.id, JSON.stringify([component, componentPosition(scene, component), componentRotation(scene, component)])] as [string, string]),
    ...project.routes.map(route => [route.id, JSON.stringify(route)] as [string, string]),
    ...scene.walls.flatMap(wall => wall.openings.map(opening => [opening.id, JSON.stringify([wall.id, wall.start, wall.end, wall.height, wall.thickness, project.metadata[wall.id]?.elevation ?? 0, opening])] as [string, string])),
  ]);
}
function syncHostedRoutes(scene: SceneDocument): void {
  const project = scene.project!;
  for (const route of project.routes) {
    const from = project.components.find(c => c.id === route.from), to = project.components.find(c => c.id === route.to);
    if (from) route.points[0] = componentPosition(scene, from);
    if (to) route.points[route.points.length - 1] = componentPosition(scene, to);
  }
}
export function isRenovationOperation(operation: Operation): operation is RenovationOperation {
  return !['add', 'update', 'delete', 'replace-structure', 'replace-scene'].includes(operation.type);
}
/** Applies to a transaction-local draft. EditorStore validates and commits the complete transaction atomically. */
export function applyRenovationOperation(input: SceneDocument, operation: RenovationOperation): SceneDocument {
  const scene = input.version === 2 ? input : migrateScene(input), project = scene.project!;
  const beforeGeometry = dependentGeometry(scene);
  switch (operation.type) {
    case 'migrate-project': break;
    case 'update-wall': {
      const wall = find(scene.walls, operation.id, 'Wall'); alteration(scene, wall.id);
      const start = [...wall.start] as Vec2, end = [...wall.end] as Vec2;
      const nextStart = operation.patch.start ?? start, nextEnd = operation.patch.end ?? end;
      const translation = !!operation.patch.start && !!operation.patch.end && same(
        [nextStart[0] - start[0], nextStart[1] - start[1]],
        [nextEnd[0] - end[0], nextEnd[1] - end[1]],
      ) && (!same(start, nextStart) || !same(end, nextEnd));
      // Capture topology before changing any points: a large pointer step must not jump
      // over an adjoining wall or carry an existing T junction off its host segment.
      const previousWalls = translation ? scene.walls.map(other => ({ id: other.id, start: [...other.start] as Vec2, end: [...other.end] as Vec2 })) : [];
      const previousAreas = translation ? new Map(scene.rooms.map(room => [room.id, signedArea(room.polygon)])) : new Map<string, number>();
      const endpointHosts = previousWalls.flatMap(other => {
        if (other.id === wall.id) return [];
        return (['start', 'end'] as const).flatMap(side => {
          const t = segmentPosition(side === 'start' ? start : end, other.start, other.end);
          return t !== null && t > EPS && t < 1 - EPS ? [{ id: other.id, side }] : [];
        });
      });
      // Every junction lying on the original segment follows its relative position, including T junctions.
      const movePoint = (point: Vec2): Vec2 | null => {
        if (!operation.patch.start && !operation.patch.end) return null;
        const t = segmentPosition(point, start, end);
        if (t === null) return null;
        return [nextStart[0] + (nextEnd[0] - nextStart[0]) * t, nextStart[1] + (nextEnd[1] - nextStart[1]) * t];
      };
      for (const other of scene.walls) for (const side of ['start', 'end'] as const) {
        const moved = movePoint(other[side]);
        if (moved && !same(moved, other[side])) { alteration(scene, other.id); other[side] = moved; }
      }
      for (const room of scene.rooms) {
        const points = room.polygon.map(point => movePoint(point) ?? point);
        if (points.some((point, i) => !same(point, room.polygon[i]!))) {
          if (translation && signedArea(points) * previousAreas.get(room.id)! <= 0) throw new Error(`Moving this wall would collapse or reverse room “${room.name}”. Keep it inside the connected room boundaries.`);
          ensureEditable(scene, room.id); invalidateAssumptions(scene, [room.id]); room.polygon = points;
        }
      }
      Object.assign(wall, operation.patch);
      for (const previous of previousWalls) {
        const other = find(scene.walls, previous.id, 'Wall');
        const projection = (other.end[0] - other.start[0]) * (previous.end[0] - previous.start[0]) + (other.end[1] - other.start[1]) * (previous.end[1] - previous.start[1]);
        if (projection <= 0) throw new Error(`Moving this wall would pass the far end of connected wall “${other.id}”. Move it a shorter distance.`);
      }
      for (const host of endpointHosts) {
        const other = find(scene.walls, host.id, 'Wall');
        if (segmentPosition(wall[host.side], other.start, other.end) === null) throw new Error(`Moving this wall would disconnect it from wall “${host.id}”. Keep the junction on its connected wall.`);
      }
      invalidateAssumptions(scene, wall.openings.map(o => o.id));
      break;
    }
    case 'add-wall': scene.walls.push(operation.wall); project.metadata[operation.wall.id] = { structuralRole: 'unknown', phase: project.mode === 'renovate' ? 'new' : 'existing', review: 'unreviewed' }; break;
    case 'delete-wall': {
      const wall = find(scene.walls, operation.id, 'Wall'); ensureEditable(scene, wall.id);
      if (project.mode === 'renovate') { project.metadata[wall.id] = { ...project.metadata[wall.id], phase: 'remove', review: 'required' }; }
      else { remove(scene.walls, wall.id, 'Wall'); removeMetadata(scene, [wall.id, ...wall.openings.map(o => o.id)]); }
      invalidateAssumptions(scene, [wall.id]); break;
    }
    case 'split-wall': {
      const wall = find(scene.walls, operation.id, 'Wall'); alteration(scene, wall.id);
      const length = wallLength(wall), cut = operation.offset;
      if (!Number.isFinite(cut) || cut <= 0.05 || cut >= length - 0.05) throw new Error('Split position must be inside the wall and leave two valid segments.');
      if (wall.openings.some(o => o.offset < cut && o.offset + o.width > cut)) throw new Error('Move the split clear of existing openings.');
      const point: Vec2 = [wall.start[0] + (wall.end[0] - wall.start[0]) * cut / length, wall.start[1] + (wall.end[1] - wall.start[1]) * cut / length];
      const other: Wall = { ...structuredClone(wall), id: operation.newId, start: point, openings: wall.openings.filter(o => o.offset >= cut).map(o => ({ ...o, offset: o.offset - cut })) };
      wall.end = [...point]; wall.openings = wall.openings.filter(o => o.offset < cut);
      scene.walls.push(other); project.metadata[other.id] = { ...project.metadata[wall.id] };
      const usedIds = new Set([...scene.rooms, ...scene.walls, ...scene.walls.flatMap(w => w.openings), ...scene.objects, ...project.components, ...project.routes, ...project.sources, ...project.assumptions, ...project.materials, ...project.finishes, ...project.tasks, ...project.options].map(entity => entity.id));
      for (const finish of project.finishes.filter(f => f.entityId === wall.id)) {
        let suffix = 0, finishId: string;
        do { finishId = `${other.id.slice(0, 80)}:finish-${suffix++}`; } while (usedIds.has(finishId));
        usedIds.add(finishId);
        project.finishes.push({ ...finish, id: finishId, entityId: other.id });
      }
      for (const component of project.components) if (component.host?.wallId === wall.id && component.host.offset >= cut) { component.host.wallId = other.id; component.host.offset -= cut; }
      for (const room of scene.rooms) {
        const points: Vec2[] = [];
        for (let i = 0; i < room.polygon.length; i++) { const a = room.polygon[i]!, b = room.polygon[(i + 1) % room.polygon.length]!; points.push(a); if ((same(a, wall.start) && same(b, other.end)) || (same(b, wall.start) && same(a, other.end))) points.push([...point]); }
        room.polygon = points;
      }
      break;
    }
    case 'join-walls': {
      const wall = find(scene.walls, operation.id, 'Wall'), other = find(scene.walls, operation.otherId, 'Wall');
      if (wall === other) throw new Error('Choose two different walls to join.');
      ensureEditable(scene, other.id); ensureEditable(scene, wall.id);
      const len = wallLength(wall), len2 = wallLength(other);
      const cross = (wall.end[0] - wall.start[0]) * (other.end[1] - other.start[1]) - (wall.end[1] - wall.start[1]) * (other.end[0] - other.start[0]);
      const dot = (wall.end[0] - wall.start[0]) * (other.end[0] - other.start[0]) + (wall.end[1] - wall.start[1]) * (other.end[1] - other.start[1]);
      if (!same(wall.end, other.start) || Math.abs(cross) > EPS * len * len2 || dot <= 0 || wall.height !== other.height || wall.thickness !== other.thickness) throw new Error('Join requires the first wall’s end to meet the second wall’s start, with matching direction, height and thickness.');
      const firstMetadata = project.metadata[wall.id] ?? {}, secondMetadata = project.metadata[other.id] ?? {};
      const comparable = (metadata: EntityMetadata) => JSON.stringify([metadata.structuralRole ?? 'unknown', metadata.boundary ?? 'unknown', metadata.material ?? '', metadata.elevation ?? 0, metadata.phase ?? 'existing']);
      if (comparable(firstMetadata) !== comparable(secondMetadata) || wall.color !== other.color) throw new Error('These walls have different structural roles, boundaries, materials, elevations, phases or colours. Keep them separate, or reconcile their properties explicitly before joining.');
      const finishSignature = (id: string) => project.finishes.filter(f => f.entityId === id).map(f => `${f.surface}:${f.materialId}`).sort().join('|');
      if (finishSignature(wall.id) !== finishSignature(other.id)) throw new Error('These walls have different surface finishes. Keep separate segments to preserve those finishes, or assign matching finishes before joining.');
      const notes = [firstMetadata.notes, secondMetadata.notes !== firstMetadata.notes ? secondMetadata.notes : undefined, secondMetadata.name && secondMetadata.name !== firstMetadata.name ? `Joined wall ${other.id}: ${secondMetadata.name}` : undefined].filter(Boolean).join('\n');
      if (notes.length > 2000) throw new Error('Combined wall notes exceed the project limit. Shorten the notes before joining.');
      alteration(scene, wall.id);
      project.metadata[wall.id] = { ...project.metadata[wall.id], ...(notes ? { notes } : {}), review: project.mode === 'renovate' || firstMetadata.review === 'required' || secondMetadata.review === 'required' ? 'required' : 'unreviewed' };
      wall.end = [...other.end]; wall.openings.push(...other.openings.map(o => ({ ...o, offset: o.offset + len })));
      for (const component of project.components) if (component.host?.wallId === other.id) { component.host.wallId = wall.id; component.host.offset += len; }
      for (const assumption of project.assumptions) { if (assumption.entityId === other.id) assumption.entityId = wall.id; assumption.dependsOn = assumption.dependsOn?.map(id => id === other.id ? wall.id : id); }
      // Equal finish stacks now cover the complete joined wall once, preserving quantities.
      project.finishes = project.finishes.filter(finish => finish.entityId !== other.id);
      invalidateAssumptions(scene, [wall.id, other.id]);
      for (const task of project.tasks) task.entityIds = [...new Set(task.entityIds.map(id => id === other.id ? wall.id : id))];
      remove(scene.walls, other.id, 'Wall'); removeMetadata(scene, [other.id]); break;
    }
    case 'add-opening': { const wall = find(scene.walls, operation.wallId, 'Wall'); alteration(scene, wall.id); wall.openings.push(operation.opening); project.metadata[operation.opening.id] = { phase: project.mode === 'renovate' ? 'new' : 'existing', review: 'unreviewed' }; break; }
    case 'update-opening': {
      const wall = scene.walls.find(w => w.openings.some(o => o.id === operation.id)); if (!wall) throw new Error('Opening no longer exists.');
      alteration(scene, wall.id); alteration(scene, operation.id); Object.assign(find(wall.openings, operation.id, 'Opening'), operation.patch); break;
    }
    case 'delete-opening': { const wall = scene.walls.find(w => w.openings.some(o => o.id === operation.id)); if (!wall) throw new Error('Opening no longer exists.'); alteration(scene, wall.id); ensureEditable(scene, operation.id); remove(wall.openings, operation.id, 'Opening'); removeMetadata(scene, [operation.id]); break; }
    case 'add-room': scene.rooms.push(operation.room); project.metadata[operation.room.id] = { zone: 'interior', phase: project.mode === 'renovate' ? 'new' : 'existing' }; break;
    case 'update-room': ensureEditable(scene, operation.id); Object.assign(find(scene.rooms, operation.id, 'Room'), operation.patch); invalidateAssumptions(scene, [operation.id]); break;
    case 'delete-room': ensureEditable(scene, operation.id); remove(scene.rooms, operation.id, 'Room'); removeMetadata(scene, [operation.id]); break;
    case 'set-metadata': project.metadata[operation.id] = { ...project.metadata[operation.id], ...operation.patch }; invalidateAssumptions(scene, [operation.id]); break;
    case 'upsert-component': ensureEditable(scene, operation.component.id); upsert(project.components, operation.component); invalidateAssumptions(scene, [operation.component.id]); break;
    case 'delete-component': ensureEditable(scene, operation.id); remove(project.components, operation.id, 'Component'); removeMetadata(scene, [operation.id]); break;
    case 'upsert-route': upsert(project.routes, operation.route); invalidateAssumptions(scene, [operation.route.id]); break;
    case 'delete-route': remove(project.routes, operation.id, 'Route'); removeMetadata(scene, [operation.id]); break;
    case 'upsert-source': upsert(project.sources, operation.source); invalidateAssumptions(scene, [operation.source.id]); break;
    case 'delete-source': remove(project.sources, operation.id, 'Source'); break;
    case 'upsert-assumption': upsert(project.assumptions, operation.assumption); invalidateAssumptions(scene, [operation.assumption.id]); break;
    case 'delete-assumption': remove(project.assumptions, operation.id, 'Assumption'); break;
    case 'upsert-material': upsert(project.materials, operation.material); break;
    case 'delete-material': remove(project.materials, operation.id, 'Material'); break;
    case 'upsert-finish': upsert(project.finishes, operation.finish); break;
    case 'delete-finish': remove(project.finishes, operation.id, 'Finish'); break;
    case 'upsert-task': upsert(project.tasks, operation.task); break;
    case 'delete-task': remove(project.tasks, operation.id, 'Task'); break;
    case 'set-project': Object.assign(project, operation.patch); break;
    case 'capture-baseline': project.baseline = projectSnapshot(scene); break;
    case 'restore-baseline': if (!project.baseline) throw new Error('Capture the existing apartment baseline first.'); saveActive(scene); restoreSnapshot(scene, project.baseline); delete project.activeOptionId; project.mode = 'correct'; break;
    case 'create-option': if (project.options.some(o => o.id === operation.id)) throw new Error('An option with this ID already exists.'); saveActive(scene); project.options.push({ id: operation.id, name: operation.name, snapshot: projectSnapshot(scene) }); project.activeOptionId = operation.id; project.mode = 'renovate'; break;
    case 'switch-option': { const option = find(project.options, operation.id, 'Option'); saveActive(scene); restoreSnapshot(scene, option.snapshot); project.activeOptionId = option.id; project.mode = 'renovate'; break; }
    case 'delete-option': if (project.activeOptionId === operation.id) delete project.activeOptionId; remove(project.options, operation.id, 'Option'); break;
  }
  syncHostedRoutes(scene);
  const changedDependants = [...dependentGeometry(scene)].filter(([id, value]) => beforeGeometry.has(id) && beforeGeometry.get(id) !== value).map(([id]) => id);
  if (changedDependants.length) invalidateAssumptions(scene, changedDependants);
  return scene;
}

function distance(a: Vec3, b: Vec3): number { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function routeLength(points: Vec3[]): number { return points.slice(1).reduce((sum, p, i) => sum + distance(p, points[i]!), 0); }
function inside(point: Vec2, polygon: Vec2[]): boolean { let hit = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const a = polygon[i]!, b = polygon[j]!; if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit; } return hit; }
function segmentCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cross = (p: Vec2, q: Vec2, r: Vec2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return cross(a, b, c) * cross(a, b, d) < -EPS && cross(c, d, a) * cross(c, d, b) < -EPS;
}
function footprint(position: Vec3, dimensions: Vec3, rotation: number): Vec2[] {
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as Vec2[]).map(([x, z]) => { const dx = x * dimensions[0] / 2, dz = z * dimensions[2] / 2; return [position[0] + Math.cos(rotation) * dx + Math.sin(rotation) * dz, position[2] - Math.sin(rotation) * dx + Math.cos(rotation) * dz]; });
}
/** Quantities and warnings are deterministic conceptual checks, never construction approval. */
export function analyzeProject(scene: SceneDocument, catalog: CatalogAsset[]): ProjectAnalysis {
  const project = scene.project ?? emptyProject();
  const issues: ProjectAnalysis['issues'] = [], quantities: ProjectAnalysis['quantities'] = [];
  const issue = (id: string, entityId: string | undefined, title: string, detail: string, severity: 'warning' | 'info' = 'warning') => issues.push({ id, ...(entityId ? { entityId } : {}), title, detail, severity });
  const floorArea = scene.rooms.filter(room => project.metadata[room.id]?.phase !== 'remove').reduce((sum, room) => sum + polygonArea(room.polygon), 0);
  const wallArea = scene.walls.filter(wall => project.metadata[wall.id]?.phase !== 'remove').reduce((sum, wall) => sum + wallLength(wall) * wall.height - wall.openings.reduce((n, o) => n + o.width * o.height, 0), 0);
  for (const placement of placementIssues(scene, catalog)) issue(`placement:${placement.entityId}:${placement.kind}`, placement.entityId, placement.kind === 'support' ? 'Furniture needs floor support' : placement.kind === 'wall' ? 'Furniture intersects a wall' : 'Furniture overlap', placement.message);
  for (const assumption of project.assumptions) if (['unresolved', 'stale'].includes(assumption.status)) issue(`assumption:${assumption.id}`, assumption.entityId, `${assumption.property}: ${assumption.status}`, assumption.question || assumption.rationale);
  for (const wall of scene.walls) {
    const meta = project.metadata[wall.id];
    if (!meta?.structuralRole || meta.structuralRole === 'unknown') issue(`role:${wall.id}`, wall.id, 'Wall structure is unknown', 'Record a structural assessment; appearance and wall thickness do not establish whether alteration is possible.', 'info');
    if (meta?.review === 'required' || (project.mode === 'renovate' && ['remove', 'replace'].includes(meta?.phase ?? '') && meta?.review !== 'reviewed')) issue(`review:${wall.id}`, wall.id, 'Alteration requires review', 'Confirm the proposed wall/opening work with the relevant professional. Model approval records no permission to construct.');
  }
  if (!scene.walls.some(w => project.metadata[w.id]?.phase !== 'remove' && w.openings.some(o => project.metadata[o.id]?.phase !== 'remove' && project.metadata[o.id]?.role === 'entrance'))) issue('entrance', undefined, 'Entrance not identified', 'Select the apartment entrance and set its opening role.', 'info');
  const obstacles = scene.objects.filter(o => project.metadata[o.id]?.phase !== 'remove').flatMap(o => { const asset = catalog.find(a => a.id === o.assetId); return asset ? [{ id: o.id, name: o.name, polygon: footprint(o.position, asset.dimensions.map((v, i) => v * o.scale[i]!) as Vec3, o.rotation), low: o.position[1], high: o.position[1] + asset.dimensions[1] * o.scale[1] }] : []; });
  obstacles.push(...project.components.filter(c => c.phase !== 'remove').map(c => ({ id: c.id, name: c.name, polygon: footprint(componentPosition(scene, c), c.dimensions, componentRotation(scene, c)), low: componentPosition(scene, c)[1], high: componentPosition(scene, c)[1] + c.dimensions[1] })));
  for (const wall of scene.walls) {
    if (project.metadata[wall.id]?.phase === 'remove') continue;
    const length = wallLength(wall), dx = (wall.end[0] - wall.start[0]) / length, dz = (wall.end[1] - wall.start[1]) / length;
    for (const opening of wall.openings) {
      const meta = project.metadata[opening.id] ?? {};
      if (meta.phase === 'remove') continue;
      if (!meta.mechanism) issue(`opening-type:${opening.id}`, opening.id, 'Opening mechanism not confirmed', 'Choose the installed door/window mechanism or record the unresolved alternatives. The preview uses a temporary default.', 'info');
      if (opening.kind !== 'door') continue;
      if (opening.width - (meta.frameWidth ?? 0.05) * 2 < 0.8) issue(`clearance:${opening.id}`, opening.id, 'Narrow door passage', 'The approximate clear opening is below 0.8 m. Check the intended route and applicable access requirements.');
      if (['sliding', 'pocket', 'fixed'].includes(meta.mechanism ?? 'hinged')) continue;
      const frame = Math.min(meta.frameWidth ?? 0.045, opening.width / 5, opening.height / 5);
      const leafCount = meta.mechanism === 'double' ? 2 : 1, leafWidth = Math.max(0.01, opening.width - frame * 2) / leafCount;
      const sweeps: Vec2[][] = [];
      for (let leaf = 0; leaf < leafCount; leaf++) {
        const right = leafCount === 2 ? leaf === 1 : meta.hinge === 'right';
        const hingeOffset = opening.offset + (right ? opening.width - frame : frame);
        const hinge: Vec2 = [wall.start[0] + dx * hingeOffset, wall.start[1] + dz * hingeOffset];
        const direction = right ? -1 : 1, swing = meta.swing ?? 1;
        const swept: Vec2[] = [hinge];
        for (let step = 0; step <= 36; step++) { const a = Math.PI / 2 * step / 36; const along = direction * Math.cos(a) * leafWidth, across = swing * Math.sin(a) * leafWidth; swept.push([hinge[0] + dx * along - dz * across, hinge[1] + dz * along + dx * across]); }
        sweeps.push(swept);
      }
      const meets = (polygon: Vec2[], swept: Vec2[]) => polygon.some(p => inside(p, swept)) || swept.some(p => inside(p, polygon)) || swept.some((a, i) => polygon.some((c, j) => segmentCross(a, swept[(i + 1) % swept.length]!, c, polygon[(j + 1) % polygon.length]!)));
      const openingBase = (project.metadata[wall.id]?.elevation ?? 0) + opening.sill;
      for (const obstacle of obstacles) if (obstacle.high > openingBase && obstacle.low < openingBase + opening.height && sweeps.some(swept => meets(obstacle.polygon, swept))) issue(`swing:${opening.id}:${obstacle.id}`, opening.id, `Door swing meets ${obstacle.name}`, 'The swept 90° opening envelope intersects this object. Adjust the hinge, swing, opening or obstacle.');
      for (const other of scene.walls) {
        const base = project.metadata[other.id]?.elevation ?? 0;
        if (other.id === wall.id || project.metadata[other.id]?.phase === 'remove' || base >= openingBase + opening.height || base + other.height <= openingBase) continue;
        if (sweeps.some(swept => inside(other.start, swept) || inside(other.end, swept) || swept.some((a, i) => segmentCross(a, swept[(i + 1) % swept.length]!, other.start, other.end)))) issue(`swing-wall:${opening.id}:${other.id}`, opening.id, 'Door swing meets another wall', `The opening envelope intersects wall ${other.id}.`);
      }

    }
  }
  for (const room of scene.rooms) {
    const meta = project.metadata[room.id];
    if (meta?.ceilingHeight === undefined) issue(`ceiling:${room.id}`, room.id, 'Ceiling height not confirmed', 'The preview uses a temporary ceiling height. Add a measurement or property assumption before relying on overhead clearances.', 'info');
    if (meta?.zone && meta.zone !== 'interior') { if (!project.components.some(c => c.roomId === room.id && c.kind === 'railing' && c.phase !== 'remove')) issue(`balcony:${room.id}`, room.id, 'Outdoor edge needs review', 'Confirm railing/parapet, threshold, drainage and weatherproofing for this outdoor space.'); }
  }
  const activeComponent = (id: string | undefined) => !id || project.components.some(component => component.id === id && component.phase !== 'remove');
  const activeRoute = (route: RenovationProject['routes'][number]) => route.phase !== 'remove' && activeComponent(route.from) && activeComponent(route.to);
  for (const component of project.components) {
    if (component.phase === 'remove') continue;
    if (component.host && project.metadata[component.host.wallId]?.phase === 'remove') issue(`removed-host:${component.id}`, component.id, 'Mounted component needs relocation', 'Its supporting wall is marked for removal. Move the component and review its connected routes.');
    quantities.push({ id: component.id, name: component.name, quantity: 1, unit: 'each', cost: component.price ?? 0 });
    if (component.kind === 'switch' && !component.control?.targets.some(id => activeComponent(id))) issue(`switch:${component.id}`, component.id, 'Switch has no active light targets', 'Connect this switch to one or more retained or new light fixtures.');
    if (['light', 'outlet', 'panel', 'junction', 'appliance'].includes(component.kind) && !project.routes.some(r => activeRoute(r) && r.system === 'electrical' && (r.from === component.id || r.to === component.id))) issue(`supply:${component.id}`, component.id, 'Supply connection not drawn', 'Logical switch control is separate from the physical electrical circuit.', 'info');
    if (component.kind === 'light' && !project.components.some(c => c.phase !== 'remove' && c.control?.targets.includes(component.id))) issue(`control:${component.id}`, component.id, 'Light has no switch control', 'Connect a switch, dimmer or multi-location control.', 'info');
  }
  for (const route of project.routes) {
    if (route.phase === 'remove') continue;
    const length = routeLength(route.points);
    quantities.push({ id: route.id, name: route.name, quantity: length, unit: 'm', cost: length * (route.pricePerMetre ?? 0) });
    if (!activeComponent(route.from) || !activeComponent(route.to)) issue(`removed-endpoint:${route.id}`, route.id, 'Route connects to removed equipment', 'Relocate or remove this route, or connect its endpoint to retained or new equipment.');
    if (!route.from || !route.to) issue(`endpoints:${route.id}`, route.id, 'Route has an unconnected endpoint', 'Assign both physical connection components.');
    if (route.system === 'waste' && route.points.at(-1)![1] >= route.points[0]![1]) issue(`drain:${route.id}`, route.id, 'Waste route has no fall toward its destination', 'Verify pipe gradient, invert levels and the destination with the plumbing design.');
    issue(`services:${route.id}`, route.id, `${route.system} route needs trade review`, 'Check sizing, clearances, penetrations and installation requirements with the relevant trade.', 'info');
    const penetrations = new Set<string>();
    for (let index = 1; index < route.points.length; index++) {
      const a = route.points[index - 1]!, b = route.points[index]!;
      for (const wall of scene.walls) {
        if (project.metadata[wall.id]?.phase === 'remove' || !segmentCross([a[0], a[2]], [b[0], b[2]], wall.start, wall.end)) continue;
        const ux = wall.end[0] - wall.start[0], uz = wall.end[1] - wall.start[1], rx = b[0] - a[0], rz = b[2] - a[2];
        const t = ((wall.start[0] - a[0]) * uz - (wall.start[1] - a[2]) * ux) / (rx * uz - rz * ux);
        const y = a[1] + (b[1] - a[1]) * t, length = wallLength(wall);
        const along = ((a[0] + rx * t - wall.start[0]) * ux + (a[2] + rz * t - wall.start[1]) * uz) / length;
        const wallBase = project.metadata[wall.id]?.elevation ?? 0;
        if (y >= wallBase && y <= wallBase + wall.height && !wall.openings.some(o => along >= o.offset && along <= o.offset + o.width && y >= wallBase + o.sill && y <= wallBase + o.sill + o.height)) penetrations.add(wall.id);
      }
    }
    for (const wallId of penetrations) issue(`penetration:${route.id}:${wallId}`, route.id, 'Service route crosses a wall', `Review the penetration through ${wallId}, including structure, fire/acoustic sealing and installation access.`);
  }
  for (const finish of project.finishes) {
    const material = project.materials.find(m => m.id === finish.materialId); if (!material || project.metadata[finish.entityId]?.phase === 'remove' || project.components.some(c => c.id === finish.entityId && c.phase === 'remove')) continue;
    const room = scene.rooms.find(r => r.id === finish.entityId), wall = scene.walls.find(w => w.id === finish.entityId);
    let quantity = 1;
    if (room) quantity = finish.surface === 'skirting' ? room.polygon.reduce((sum, p, i) => { const q = room.polygon[(i + 1) % room.polygon.length]!; return sum + Math.hypot(p[0] - q[0], p[1] - q[1]); }, 0) : polygonArea(room.polygon);
    if (wall) quantity = finish.surface === 'skirting' ? wallLength(wall) : wallLength(wall) * wall.height - wall.openings.reduce((sum, o) => sum + o.width * o.height, 0);
    quantity *= 1 + material.wastePercent / 100;
    quantities.push({ id: finish.id, name: `${material.name} · ${finish.surface}`, quantity, unit: material.unit, cost: quantity * material.unitCost });
  }
  for (const object of scene.objects) { const asset = catalog.find(a => a.id === object.assetId); if (project.metadata[object.id]?.phase !== 'remove') quantities.push({ id: object.id, name: object.name, quantity: 1, unit: 'each', cost: asset?.price ?? 0 }); }
  for (const task of project.tasks) quantities.push({ id: task.id, name: task.title, quantity: 1, unit: 'allowance', cost: task.allowance });
  const changes = { added: 0, removed: 0, changed: 0 };
  if (project.baseline) {
    const collect = (snapshot: RenovationSnapshot) => new Map([...snapshot.rooms, ...snapshot.walls, ...snapshot.objects, ...snapshot.components, ...snapshot.routes].map(entity => [entity.id, JSON.stringify([entity, snapshot.metadata[entity.id]])]));
    const before = collect(project.baseline), after = collect(projectSnapshot(scene));
    for (const [id, value] of after) { if (!before.has(id)) changes.added++; else if (before.get(id) !== value) changes.changed++; }
    for (const id of before.keys()) if (!after.has(id)) changes.removed++;
  }
  return { issues, quantities, totalCost: quantities.reduce((sum, line) => sum + line.cost, 0), floorArea, wallArea, routeLength: project.routes.filter(route => route.phase !== 'remove').reduce((sum, route) => sum + routeLength(route.points), 0), changes };
}
